import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { cardRepository } from '@/repositories/card.repository';
import { deckRepository } from '@/repositories/deck.repository';
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

const input = { name: 'TypeScript', description: 'TS patterns', color: 'deck-blue' };

describe('deck.store', () => {
  it('createDeck persists the deck and adds it to state with zeroed stats', async () => {
    const publishSpy = vi.spyOn(syncBus, 'publish');

    const result = await useAppStore.getState().deckActions.createDeck(input);

    expect(result.ok).toBe(true);
    const { decks } = useAppStore.getState();
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({
      name: 'TypeScript',
      color: 'deck-blue',
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
    });

    const stored = await deckRepository.getAll();
    expect(stored.ok).toBe(true);
    if (stored.ok) expect(stored.value).toHaveLength(1);

    if (result.ok) {
      expect(publishSpy).toHaveBeenCalledWith('deck:updated', result.value.id);
    }
    publishSpy.mockRestore();
  });

  it('createDeck with an empty name returns VALIDATION and leaves state unchanged', async () => {
    const result = await useAppStore.getState().deckActions.createDeck({ ...input, name: '  ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(useAppStore.getState().decks).toHaveLength(0);
  });

  it('loadDecks populates decks with query-time due/new stats', async () => {
    const deck = await deckRepository.create(input);
    if (!deck.ok) throw new Error('deck seed failed');
    await cardRepository.create({ deckId: deck.value.id, front: 'Q1', back: 'A1' });
    await cardRepository.create({ deckId: deck.value.id, front: 'Q2', back: 'A2' });

    await useAppStore.getState().deckActions.loadDecks();

    const state = useAppStore.getState();
    expect(state.decksLoaded).toBe(true);
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0]).toMatchObject({ cardCount: 2, newCount: 2, dueCount: 0 });
  });

  it('updateDeck renames locally and in the db, preserving computed stats', async () => {
    const deck = await deckRepository.create(input);
    if (!deck.ok) throw new Error('deck seed failed');
    await cardRepository.create({ deckId: deck.value.id, front: 'Q1', back: 'A1' });
    await useAppStore.getState().deckActions.loadDecks();

    const result = await useAppStore
      .getState()
      .deckActions.updateDeck(deck.value.id, { name: 'Renamed' });

    expect(result.ok).toBe(true);
    expect(useAppStore.getState().decks[0]).toMatchObject({ name: 'Renamed', newCount: 1 });

    const fromDb = await deckRepository.getById(deck.value.id);
    expect(fromDb.ok).toBe(true);
    if (fromDb.ok) expect(fromDb.value.name).toBe('Renamed');
  });

  it('deleteDeck removes the deck from state and db and broadcasts deck:updated', async () => {
    const created = await useAppStore.getState().deckActions.createDeck(input);
    if (!created.ok) throw new Error('deck seed failed');
    const publishSpy = vi.spyOn(syncBus, 'publish');

    const result = await useAppStore.getState().deckActions.deleteDeck(created.value.id);

    expect(result.ok).toBe(true);
    expect(useAppStore.getState().decks).toHaveLength(0);

    const fromDb = await deckRepository.getById(created.value.id);
    expect(fromDb.ok).toBe(false);
    if (!fromDb.ok) expect(fromDb.error.code).toBe('NOT_FOUND');

    expect(publishSpy).toHaveBeenCalledWith('deck:updated', created.value.id);
    publishSpy.mockRestore();
  });

  it('deleteDeck for a missing id returns NOT_FOUND and leaves state unchanged', async () => {
    const created = await useAppStore.getState().deckActions.createDeck(input);
    if (!created.ok) throw new Error('deck seed failed');

    const result = await useAppStore.getState().deckActions.deleteDeck('missing-id');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    expect(useAppStore.getState().decks).toHaveLength(1);
  });
});
