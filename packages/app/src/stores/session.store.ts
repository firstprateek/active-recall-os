/**
 * Session slice — the active review session state machine.
 *
 * rateCard flow (ARCHITECTURE.md): calculateNextState (pure) →
 * cardRepository.updateState (persist) → sessionRepository.appendResult →
 * update local results + advance queue → broadcast 'card:updated'.
 *
 * Queue exhaustion does NOT auto-complete: the consuming hook decides when
 * to call completeSession so a summary screen can render first.
 */

import type { StateCreator } from 'zustand';
import type { Card, Rating, ReviewResult, ReviewSession } from '@/types/domain';
import { err, type Result } from '@/types/result';
import { calculateNextState } from '@/engine/sm2';
import { cardRepository } from '@/repositories/card.repository';
import { sessionRepository } from '@/repositories/session.repository';
import { syncBus } from '@/lib/sync/broadcast';
import type { AppStore } from '@/stores';

export interface SessionSlice {
  activeSession: ReviewSession | null;
  queue: Card[];
  currentIndex: number;
  results: ReviewResult[];
  sessionActions: {
    startSession(deckId: string): Promise<Result<ReviewSession>>;
    rateCard(rating: Rating, responseTimeMs: number): Promise<Result<Card>>;
    completeSession(): Promise<Result<ReviewSession>>;
    abandonSession(): Promise<void>;
  };
}

type IdleSessionState = Pick<
  SessionSlice,
  'activeSession' | 'queue' | 'currentIndex' | 'results'
>;

function idleSessionState(): IdleSessionState {
  return { activeSession: null, queue: [], currentIndex: 0, results: [] };
}

export const createSessionSlice: StateCreator<AppStore, [], [], SessionSlice> = (set, get) => ({
  ...idleSessionState(),
  sessionActions: {
    async startSession(deckId) {
      // Never double-start: an in-flight session (same deck or not) is
      // abandoned — completed with its partial results — before starting fresh.
      if (get().activeSession !== null) {
        await get().sessionActions.abandonSession();
      }

      // Build the queue before creating the session row so a failed query
      // never leaves an orphaned empty session behind.
      const queue = await cardRepository.getReviewQueue(deckId);
      if (!queue.ok) return queue;

      const session = await sessionRepository.start(deckId);
      if (!session.ok) return session;

      set({
        activeSession: session.value,
        queue: queue.value,
        currentIndex: 0,
        results: [],
      });
      return session;
    },

    async rateCard(rating, responseTimeMs) {
      const { activeSession, queue, currentIndex, results } = get();
      if (activeSession === null) return err('CONFLICT', 'No active review session');
      const card = queue[currentIndex];
      if (card === undefined) return err('CONFLICT', 'Review queue is exhausted');

      const now = new Date();
      const stateBefore = card.state;
      const nextState = calculateNextState(card, rating, now);

      const persisted = await cardRepository.updateState(card.id, nextState, now);
      if (!persisted.ok) return persisted;

      const result: ReviewResult = {
        cardId: card.id,
        rating,
        responseTimeMs,
        stateBefore,
        stateAfter: persisted.value.state,
        reviewedAt: now,
      };
      const appended = await sessionRepository.appendResult(activeSession.id, result);
      if (!appended.ok) return appended;

      set({
        activeSession: appended.value,
        results: [...results, result],
        currentIndex: currentIndex + 1,
      });
      syncBus.publish('card:updated', card.id);
      return persisted;
    },

    async completeSession() {
      const session = get().activeSession;
      if (session === null) return err('CONFLICT', 'No active review session');

      const completed = await sessionRepository.complete(session.id);
      if (completed.ok) {
        set(idleSessionState());
        syncBus.publish('session:completed', session.id);
      }
      return completed;
    },

    async abandonSession() {
      const session = get().activeSession;
      if (session !== null) {
        // Abandoning still completes the session: reviews already made are
        // real SM-2 state changes and must never be lost.
        const completed = await sessionRepository.complete(session.id);
        if (completed.ok) {
          syncBus.publish('session:completed', session.id);
        } else {
          console.error('abandonSession: persisting completion failed:', completed.error);
        }
      }
      set(idleSessionState());
    },
  },
});
