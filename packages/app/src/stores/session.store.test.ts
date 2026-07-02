import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { cardRepository } from '@/repositories/card.repository';
import { deckRepository } from '@/repositories/deck.repository';
import { sessionRepository } from '@/repositories/session.repository';
import { syncBus } from '@/lib/sync/broadcast';
import { useAppStore } from '@/stores';

// The store slices bind to the singleton repositories (which use the singleton
// db), so tests seed through those same singletons. The singleton keeps one
// Dexie connection across a test file, so we clear tables between tests rather
// than relying on the per-test IDBFactory swap alone.
beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.decks.clear(), db.sessions.clear()]);
  useAppStore.setState({
    decks: [],
    decksLoaded: false,
    activeSession: null,
    queue: [],
    currentIndex: 0,
    results: [],
  });
});

async function seedDeckWithCards(cardCount: number): Promise<{ deckId: string }> {
  const deck = await deckRepository.create({
    name: 'System Design',
    description: '',
    color: 'deck-violet',
  });
  if (!deck.ok) throw new Error('deck seed failed');
  for (let i = 0; i < cardCount; i += 1) {
    const card = await cardRepository.create({
      deckId: deck.value.id,
      front: `Q${i}`,
      back: `A${i}`,
    });
    if (!card.ok) throw new Error('card seed failed');
  }
  return { deckId: deck.value.id };
}

describe('session.store', () => {
  it('startSession persists a session and builds the review queue', async () => {
    const { deckId } = await seedDeckWithCards(3);

    const result = await useAppStore.getState().sessionActions.startSession(deckId);

    expect(result.ok).toBe(true);
    const state = useAppStore.getState();
    expect(state.activeSession).not.toBeNull();
    expect(state.activeSession?.deckId).toBe(deckId);
    expect(state.activeSession?.completedAt).toBeNull();
    expect(state.queue).toHaveLength(3);
    expect(state.currentIndex).toBe(0);
    expect(state.results).toHaveLength(0);

    if (result.ok) {
      const fromDb = await sessionRepository.getById(result.value.id);
      expect(fromDb.ok).toBe(true);
    }
  });

  it('startSession abandons an existing active session instead of double-starting', async () => {
    const { deckId } = await seedDeckWithCards(2);
    const first = await useAppStore.getState().sessionActions.startSession(deckId);
    if (!first.ok) throw new Error('first start failed');
    await useAppStore.getState().sessionActions.rateCard(3, 900);

    const second = await useAppStore.getState().sessionActions.startSession(deckId);

    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.id).not.toBe(first.value.id);

    // The abandoned session was completed with its partial results.
    const firstFromDb = await sessionRepository.getById(first.value.id);
    expect(firstFromDb.ok).toBe(true);
    if (firstFromDb.ok) {
      expect(firstFromDb.value.completedAt).not.toBeNull();
      expect(firstFromDb.value.cardsReviewed).toHaveLength(1);
    }

    const state = useAppStore.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.results).toHaveLength(0);
  });

  it('rateCard persists SM-2 state, appends the result, advances, and broadcasts', async () => {
    const { deckId } = await seedDeckWithCards(2);
    await useAppStore.getState().sessionActions.startSession(deckId);
    const first = useAppStore.getState().queue[0];
    if (first === undefined) throw new Error('queue unexpectedly empty');
    const publishSpy = vi.spyOn(syncBus, 'publish');

    const rated = await useAppStore.getState().sessionActions.rateCard(3, 1200);

    expect(rated.ok).toBe(true);
    // Rating a 'new' card Good enters the learning steps (SM-2 engine).
    if (rated.ok) expect(rated.value.state.status).toBe('learning');

    const state = useAppStore.getState();
    expect(state.currentIndex).toBe(1);
    expect(state.results).toHaveLength(1);
    expect(state.results[0]).toMatchObject({
      cardId: first.id,
      rating: 3,
      responseTimeMs: 1200,
      stateBefore: { status: 'new' },
    });
    expect(state.results[0]?.stateAfter.status).toBe('learning');
    expect(state.activeSession?.cardsReviewed).toHaveLength(1);

    const fromDb = await cardRepository.getById(first.id);
    expect(fromDb.ok).toBe(true);
    if (fromDb.ok) expect(fromDb.value.state.status).toBe('learning');

    expect(publishSpy).toHaveBeenCalledWith('card:updated', first.id);
    publishSpy.mockRestore();
  });

  it('rateCard without an active session returns CONFLICT', async () => {
    const result = await useAppStore.getState().sessionActions.rateCard(3, 500);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('rateCard past the end of the queue returns CONFLICT', async () => {
    const { deckId } = await seedDeckWithCards(1);
    await useAppStore.getState().sessionActions.startSession(deckId);
    const inQueue = await useAppStore.getState().sessionActions.rateCard(4, 800);
    expect(inQueue.ok).toBe(true);

    const exhausted = await useAppStore.getState().sessionActions.rateCard(4, 800);

    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.error.code).toBe('CONFLICT');
  });

  it('completeSession persists completedAt, clears state, and broadcasts', async () => {
    const { deckId } = await seedDeckWithCards(1);
    const started = await useAppStore.getState().sessionActions.startSession(deckId);
    if (!started.ok) throw new Error('start failed');
    await useAppStore.getState().sessionActions.rateCard(3, 1000);
    const publishSpy = vi.spyOn(syncBus, 'publish');

    const completed = await useAppStore.getState().sessionActions.completeSession();

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.completedAt).not.toBeNull();
      expect(completed.value.cardsReviewed).toHaveLength(1);
    }

    const state = useAppStore.getState();
    expect(state.activeSession).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.currentIndex).toBe(0);
    expect(state.results).toHaveLength(0);

    expect(publishSpy).toHaveBeenCalledWith('session:completed', started.value.id);
    publishSpy.mockRestore();
  });

  it('completeSession without an active session returns CONFLICT', async () => {
    const result = await useAppStore.getState().sessionActions.completeSession();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('abandonSession completes the session with partial results and clears state', async () => {
    const { deckId } = await seedDeckWithCards(2);
    const started = await useAppStore.getState().sessionActions.startSession(deckId);
    if (!started.ok) throw new Error('start failed');
    await useAppStore.getState().sessionActions.rateCard(2, 700);

    await useAppStore.getState().sessionActions.abandonSession();

    const state = useAppStore.getState();
    expect(state.activeSession).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.results).toHaveLength(0);

    const fromDb = await sessionRepository.getById(started.value.id);
    expect(fromDb.ok).toBe(true);
    if (fromDb.ok) {
      expect(fromDb.value.completedAt).not.toBeNull();
      expect(fromDb.value.cardsReviewed).toHaveLength(1);
    }
  });

  it('abandonSession with no active session is a no-op', async () => {
    await useAppStore.getState().sessionActions.abandonSession();

    const state = useAppStore.getState();
    expect(state.activeSession).toBeNull();
    expect(state.queue).toHaveLength(0);
  });
});
