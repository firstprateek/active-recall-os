/**
 * SessionRepository — review session persistence.
 * Data layer: no React, no Zustand. Returns Result<T, AppError>, never throws.
 */

import type { ActiveRecallDB } from '@/db/schema';
import { db as defaultDb } from '@/db/schema';
import type { ReviewResult, ReviewSession } from '@/types/domain';
import { err, ok, tryStorage, type Result } from '@/types/result';

export class SessionRepository {
  constructor(private readonly db: ActiveRecallDB = defaultDb) {}

  async start(deckId: string, now: Date = new Date()): Promise<Result<ReviewSession>> {
    const session: ReviewSession = {
      id: crypto.randomUUID(),
      deckId,
      startedAt: now,
      completedAt: null,
      cardsReviewed: [],
    };
    return tryStorage(async () => {
      await this.db.sessions.add(session);
      return session;
    }, 'start session');
  }

  async getById(id: string): Promise<Result<ReviewSession>> {
    const found = await tryStorage(() => this.db.sessions.get(id), 'get session');
    if (!found.ok) return found;
    if (found.value === undefined) return err('NOT_FOUND', `Session ${id} not found`);
    return ok(found.value);
  }

  /** Append one review result to an in-progress session. */
  async appendResult(id: string, result: ReviewResult): Promise<Result<ReviewSession>> {
    return this.db
      .transaction('rw', this.db.sessions, async () => {
        const session = await this.db.sessions.get(id);
        if (session === undefined) return err('NOT_FOUND', `Session ${id} not found`);
        if (session.completedAt !== null) {
          return err('CONFLICT', `Session ${id} is already completed`);
        }
        const updated: ReviewSession = {
          ...session,
          cardsReviewed: [...session.cardsReviewed, result],
        };
        await this.db.sessions.put(updated);
        return ok(updated);
      })
      .catch((cause: unknown) => err('STORAGE', 'append review result failed', cause));
  }

  async complete(id: string, now: Date = new Date()): Promise<Result<ReviewSession>> {
    return this.db
      .transaction('rw', this.db.sessions, async () => {
        const session = await this.db.sessions.get(id);
        if (session === undefined) return err('NOT_FOUND', `Session ${id} not found`);
        const updated: ReviewSession = { ...session, completedAt: now };
        await this.db.sessions.put(updated);
        return ok(updated);
      })
      .catch((cause: unknown) => err('STORAGE', 'complete session failed', cause));
  }

  async getByDeck(deckId: string): Promise<Result<ReviewSession[]>> {
    return tryStorage(
      () => this.db.sessions.where('deckId').equals(deckId).sortBy('startedAt'),
      'list sessions by deck',
    );
  }

  async getAll(): Promise<Result<ReviewSession[]>> {
    return tryStorage(() => this.db.sessions.orderBy('startedAt').toArray(), 'list sessions');
  }

  /** Completed sessions in a date range — dashboard heatmap + streaks. */
  async getCompletedBetween(from: Date, to: Date): Promise<Result<ReviewSession[]>> {
    return tryStorage(async () => {
      const sessions = await this.db.sessions
        .where('startedAt')
        .between(from, to, true, true)
        .toArray();
      return sessions.filter((s) => s.completedAt !== null);
    }, 'list sessions in range');
  }
}

export const sessionRepository = new SessionRepository();
