/**
 * DeckRepository tests — CRUD, stats, and cascade semantics against a fresh
 * fake-indexeddb per test. All timestamps are fixed Date instances.
 */

import Dexie from 'dexie';
import { ActiveRecallDB } from '@/db/schema';
import { DeckRepository } from '@/repositories/deck.repository';
import { CardRepository } from '@/repositories/card.repository';
import { SessionRepository } from '@/repositories/session.repository';
import type { AppError, Result } from '@/types/result';
import type { CardState } from '@/types/domain';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-02T00:00:00Z');
const T2 = new Date('2026-01-03T00:00:00Z');

interface TestContext {
  db: ActiveRecallDB;
  decks: DeckRepository;
  cards: CardRepository;
  sessions: SessionRepository;
}

/** All repos in one test share a single DB instance (matches app wiring). */
function createContext(): TestContext {
  // vitest.setup.ts swaps globalThis.indexedDB per test, but Dexie captures its
  // indexedDB dependency at module load — repoint it so each test opens a
  // genuinely clean database instead of leaking state across tests.
  Dexie.dependencies.indexedDB = globalThis.indexedDB;
  Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange;
  const db = new ActiveRecallDB();
  return {
    db,
    decks: new DeckRepository(db),
    cards: new CardRepository(db),
    sessions: new SessionRepository(db),
  };
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function unwrapErr<T>(result: Result<T>): AppError {
  if (result.ok) throw new Error('expected error result, got ok');
  return result.error;
}

let ctx: TestContext;
beforeEach(() => {
  ctx = createContext();
});

describe('DeckRepository.create', () => {
  it('creates a deck with trimmed name and description and zeroed cardCount', async () => {
    const deck = unwrap(
      await ctx.decks.create(
        { name: '  TypeScript Patterns  ', description: '  Advanced TS  ', color: 'deck-blue' },
        T0,
      ),
    );
    expect(deck.name).toBe('TypeScript Patterns');
    expect(deck.description).toBe('Advanced TS');
    expect(deck.color).toBe('deck-blue');
    expect(deck.cardCount).toBe(0);
    expect(deck.createdAt).toEqual(T0);
    expect(deck.updatedAt).toEqual(T0);

    const persisted = unwrap(await ctx.decks.getById(deck.id));
    expect(persisted).toEqual(deck);
  });

  it('rejects an empty (whitespace-only) name with VALIDATION and stores nothing', async () => {
    const error = unwrapErr(
      await ctx.decks.create({ name: '   ', description: 'x', color: 'deck-rose' }, T0),
    );
    expect(error.code).toBe('VALIDATION');
    expect(unwrap(await ctx.decks.getAll())).toHaveLength(0);
  });
});

describe('DeckRepository.getById', () => {
  it('returns NOT_FOUND for an unknown id', async () => {
    const error = unwrapErr(await ctx.decks.getById('no-such-deck'));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('DeckRepository.getAll', () => {
  it('orders decks by createdAt ascending regardless of insertion order', async () => {
    unwrap(await ctx.decks.create({ name: 'Third', description: '', color: 'deck-blue' }, T2));
    unwrap(await ctx.decks.create({ name: 'First', description: '', color: 'deck-blue' }, T0));
    unwrap(await ctx.decks.create({ name: 'Second', description: '', color: 'deck-blue' }, T1));

    const decks = unwrap(await ctx.decks.getAll());
    expect(decks.map((d) => d.name)).toEqual(['First', 'Second', 'Third']);
  });
});

describe('DeckRepository.getAllWithStats', () => {
  it('computes dueCount and newCount per deck from card states', async () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const deckA = unwrap(await ctx.decks.create({ name: 'A', description: '', color: 'deck-blue' }, T0));
    unwrap(await ctx.decks.create({ name: 'B', description: '', color: 'deck-rose' }, T1));

    const seedCard = async (deckId: string, front: string, state?: CardState): Promise<void> => {
      const card = unwrap(await ctx.cards.create({ deckId, front, back: 'a' }, T0));
      if (state !== undefined) unwrap(await ctx.cards.updateState(card.id, state, T0));
    };

    await seedCard(deckA.id, 'stays new');
    await seedCard(deckA.id, 'review overdue', {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-09T00:00:00Z'),
    });
    await seedCard(deckA.id, 'learning due at exact boundary', {
      status: 'learning',
      step: 1,
      nextReview: now,
    });
    await seedCard(deckA.id, 'review scheduled in the future', {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-15T00:00:00Z'),
    });
    await seedCard(deckA.id, 'relearning in the future', {
      status: 'relearning',
      step: 0,
      easeFactor: 2.3,
      interval: 10,
      nextReview: new Date('2026-01-11T00:00:00Z'),
    });

    const stats = unwrap(await ctx.decks.getAllWithStats(now));
    expect(stats.map((d) => d.name)).toEqual(['A', 'B']); // createdAt ordering preserved

    const [a, b] = stats;
    if (a === undefined || b === undefined) throw new Error('expected two decks');
    expect(a.dueCount).toBe(2); // overdue review + boundary learning
    expect(a.newCount).toBe(1);
    expect(a.cardCount).toBe(5);
    expect(b.dueCount).toBe(0);
    expect(b.newCount).toBe(0);
    expect(b.cardCount).toBe(0);
  });
});

describe('DeckRepository.update', () => {
  it('updates only the provided fields and bumps updatedAt', async () => {
    const deck = unwrap(
      await ctx.decks.create({ name: 'Original', description: 'Desc', color: 'deck-blue' }, T0),
    );

    const renamed = unwrap(await ctx.decks.update(deck.id, { name: '  Renamed  ' }, T1));
    expect(renamed.name).toBe('Renamed'); // trimmed
    expect(renamed.description).toBe('Desc');
    expect(renamed.color).toBe('deck-blue');
    expect(renamed.createdAt).toEqual(T0);
    expect(renamed.updatedAt).toEqual(T1);

    const recolored = unwrap(
      await ctx.decks.update(deck.id, { description: ' New desc ', color: 'deck-emerald' }, T2),
    );
    expect(recolored.name).toBe('Renamed');
    expect(recolored.description).toBe('New desc');
    expect(recolored.color).toBe('deck-emerald');
    expect(recolored.updatedAt).toEqual(T2);

    expect(unwrap(await ctx.decks.getById(deck.id))).toEqual(recolored);
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const error = unwrapErr(await ctx.decks.update('missing', { name: 'X' }, T1));
    expect(error.code).toBe('NOT_FOUND');
  });

  it('rejects an empty name with VALIDATION and leaves the deck untouched', async () => {
    const deck = unwrap(
      await ctx.decks.create({ name: 'Keep me', description: '', color: 'deck-blue' }, T0),
    );
    const error = unwrapErr(await ctx.decks.update(deck.id, { name: '   ' }, T1));
    expect(error.code).toBe('VALIDATION');
    expect(unwrap(await ctx.decks.getById(deck.id))).toEqual(deck);
  });
});

describe('DeckRepository.delete', () => {
  it('cascades: removes the deck plus all of its cards and sessions, sparing other decks', async () => {
    const doomed = unwrap(await ctx.decks.create({ name: 'Doomed', description: '', color: 'deck-blue' }, T0));
    const survivor = unwrap(await ctx.decks.create({ name: 'Survivor', description: '', color: 'deck-rose' }, T0));

    unwrap(await ctx.cards.create({ deckId: doomed.id, front: 'q1', back: 'a1' }, T0));
    unwrap(await ctx.cards.create({ deckId: doomed.id, front: 'q2', back: 'a2' }, T0));
    const keptCard = unwrap(await ctx.cards.create({ deckId: survivor.id, front: 'q3', back: 'a3' }, T0));
    unwrap(await ctx.sessions.start(doomed.id, T1));
    const keptSession = unwrap(await ctx.sessions.start(survivor.id, T1));

    unwrap(await ctx.decks.delete(doomed.id));

    expect(unwrapErr(await ctx.decks.getById(doomed.id)).code).toBe('NOT_FOUND');
    expect(unwrap(await ctx.cards.getByDeck(doomed.id))).toHaveLength(0);
    expect(unwrap(await ctx.sessions.getByDeck(doomed.id))).toHaveLength(0);

    expect(unwrap(await ctx.cards.getByDeck(survivor.id)).map((c) => c.id)).toEqual([keptCard.id]);
    expect(unwrap(await ctx.sessions.getByDeck(survivor.id)).map((s) => s.id)).toEqual([keptSession.id]);
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const error = unwrapErr(await ctx.decks.delete('missing'));
    expect(error.code).toBe('NOT_FOUND');
  });
});
