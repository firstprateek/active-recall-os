/**
 * CardRepository tests — denormalized cardCount maintenance, tag
 * normalization, state persistence, and review-queue ordering.
 * Fresh fake-indexeddb per test; all timestamps are fixed Date instances.
 */

import Dexie from 'dexie';
import { ActiveRecallDB } from '@/db/schema';
import { CardRepository } from '@/repositories/card.repository';
import { DeckRepository } from '@/repositories/deck.repository';
import type { AppError, Result } from '@/types/result';
import type { Card, CardState, Deck } from '@/types/domain';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-02T00:00:00Z');
const NOW = new Date('2026-01-10T00:00:00Z');

interface TestContext {
  db: ActiveRecallDB;
  decks: DeckRepository;
  cards: CardRepository;
}

/** All repos in one test share a single DB instance (matches app wiring). */
function createContext(): TestContext {
  // vitest.setup.ts swaps globalThis.indexedDB per test, but Dexie captures its
  // indexedDB dependency at module load — repoint it so each test opens a
  // genuinely clean database instead of leaking state across tests.
  Dexie.dependencies.indexedDB = globalThis.indexedDB;
  Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange;
  const db = new ActiveRecallDB();
  return { db, decks: new DeckRepository(db), cards: new CardRepository(db) };
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

async function seedDeck(name: string, now: Date = T0): Promise<Deck> {
  return unwrap(await ctx.decks.create({ name, description: '', color: 'deck-blue' }, now));
}

async function deckCount(deckId: string): Promise<number> {
  return unwrap(await ctx.decks.getById(deckId)).cardCount;
}

describe('CardRepository.create', () => {
  it('creates a new-state card and increments deck.cardCount per card', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(
      await ctx.cards.create({ deckId: deck.id, front: '  Q1  ', back: '  A1  ' }, T0),
    );
    expect(card.front).toBe('Q1'); // trimmed
    expect(card.back).toBe('A1');
    expect(card.state).toEqual({ status: 'new' });
    expect(card.tags).toEqual([]);
    expect(card.createdAt).toEqual(T0);
    expect(await deckCount(deck.id)).toBe(1);

    unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q2', back: 'A2' }, T1));
    expect(await deckCount(deck.id)).toBe(2);

    expect(unwrap(await ctx.cards.getById(card.id))).toEqual(card);
  });

  it('rejects a missing deck with NOT_FOUND and persists nothing', async () => {
    const error = unwrapErr(
      await ctx.cards.create({ deckId: 'no-such-deck', front: 'Q', back: 'A' }, T0),
    );
    expect(error.code).toBe('NOT_FOUND');
    expect(unwrap(await ctx.cards.getAll())).toHaveLength(0);
  });

  it('rejects an empty (whitespace-only) front with VALIDATION', async () => {
    const deck = await seedDeck('Deck');
    const error = unwrapErr(await ctx.cards.create({ deckId: deck.id, front: '   ', back: 'A' }, T0));
    expect(error.code).toBe('VALIDATION');
    expect(await deckCount(deck.id)).toBe(0);
  });

  it('normalizes tags: trims, lowercases, drops empties, dedupes (first occurrence wins)', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(
      await ctx.cards.create(
        {
          deckId: deck.id,
          front: 'Q',
          back: 'A',
          tags: ['  TS  ', 'ts', 'React', '', '   ', 'REACT', 'Hooks'],
        },
        T0,
      ),
    );
    expect(card.tags).toEqual(['ts', 'react', 'hooks']);
  });
});

describe('CardRepository.update', () => {
  it('moving a card between decks adjusts both denormalized cardCounts', async () => {
    const from = await seedDeck('From');
    const to = await seedDeck('To');
    const card = unwrap(await ctx.cards.create({ deckId: from.id, front: 'Q', back: 'A' }, T0));
    expect(await deckCount(from.id)).toBe(1);
    expect(await deckCount(to.id)).toBe(0);

    const moved = unwrap(await ctx.cards.update(card.id, { deckId: to.id }, T1));
    expect(moved.deckId).toBe(to.id);
    expect(await deckCount(from.id)).toBe(0);
    expect(await deckCount(to.id)).toBe(1);
    expect(unwrap(await ctx.cards.getById(card.id)).deckId).toBe(to.id);
  });

  it('moving to a missing deck fails with NOT_FOUND and changes nothing', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q', back: 'A' }, T0));

    const error = unwrapErr(await ctx.cards.update(card.id, { deckId: 'missing' }, T1));
    expect(error.code).toBe('NOT_FOUND');
    expect(await deckCount(deck.id)).toBe(1);
    expect(unwrap(await ctx.cards.getById(card.id)).deckId).toBe(deck.id);
  });

  it('updates partial fields without touching counts, normalizing tags', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(
      await ctx.cards.create({ deckId: deck.id, front: 'Q', back: 'A', tags: ['ts'] }, T0),
    );

    const updated = unwrap(
      await ctx.cards.update(card.id, { front: '  New Q  ', tags: [' React ', 'react'] }, T1),
    );
    expect(updated.front).toBe('New Q');
    expect(updated.back).toBe('A'); // untouched
    expect(updated.tags).toEqual(['react']);
    expect(updated.updatedAt).toEqual(T1);
    expect(await deckCount(deck.id)).toBe(1);
  });

  it('rejects an empty front with VALIDATION and returns NOT_FOUND for unknown cards', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q', back: 'A' }, T0));

    expect(unwrapErr(await ctx.cards.update(card.id, { front: '  ' }, T1)).code).toBe('VALIDATION');
    expect(unwrap(await ctx.cards.getById(card.id)).front).toBe('Q');
    expect(unwrapErr(await ctx.cards.update('missing', { front: 'X' }, T1)).code).toBe('NOT_FOUND');
  });
});

describe('CardRepository.updateState', () => {
  it('persists the new scheduling state and bumps updatedAt', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q', back: 'A' }, T0));

    const state: CardState = {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-08T00:00:00Z'),
    };
    const updated = unwrap(await ctx.cards.updateState(card.id, state, T1));
    expect(updated.state).toEqual(state);
    expect(updated.updatedAt).toEqual(T1);
    expect(unwrap(await ctx.cards.getById(card.id)).state).toEqual(state);
  });

  it('returns NOT_FOUND for an unknown card', async () => {
    const error = unwrapErr(await ctx.cards.updateState('missing', { status: 'new' }, T1));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('CardRepository.delete', () => {
  it('decrements deck.cardCount and removes the card', async () => {
    const deck = await seedDeck('Deck');
    const card1 = unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q1', back: 'A' }, T0));
    unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q2', back: 'A' }, T0));
    expect(await deckCount(deck.id)).toBe(2);

    unwrap(await ctx.cards.delete(card1.id, T1));
    expect(await deckCount(deck.id)).toBe(1);
    expect(unwrapErr(await ctx.cards.getById(card1.id)).code).toBe('NOT_FOUND');
  });

  it('never drives cardCount below 0, even if the count has drifted', async () => {
    const deck = await seedDeck('Deck');
    const card = unwrap(await ctx.cards.create({ deckId: deck.id, front: 'Q', back: 'A' }, T0));
    // Simulate denormalization drift directly in storage — no repository API
    // should ever produce this, which is exactly why delete must clamp.
    await ctx.db.decks.update(deck.id, { cardCount: 0 });

    unwrap(await ctx.cards.delete(card.id, T1));
    expect(await deckCount(deck.id)).toBe(0);
  });

  it('returns NOT_FOUND for an unknown card', async () => {
    const error = unwrapErr(await ctx.cards.delete('missing', T1));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('CardRepository.getReviewQueue', () => {
  async function seedCardWithState(
    deckId: string,
    front: string,
    createdAt: Date,
    state?: CardState,
  ): Promise<Card> {
    const card = unwrap(await ctx.cards.create({ deckId, front, back: 'a' }, createdAt));
    if (state === undefined) return card;
    return unwrap(await ctx.cards.updateState(card.id, state, createdAt));
  }

  interface QueueFixture {
    deckId: string;
    overdueReview: Card;
    overdueLearning: Card;
    boundaryRelearning: Card;
    new1: Card;
    new2: Card;
    new3: Card;
  }

  /** NOW = 2026-01-10. Due cards at 01-05 / 01-07 / 01-10; one future at 01-12. */
  async function seedQueue(): Promise<QueueFixture> {
    const deck = await seedDeck('Queue deck');
    const other = await seedDeck('Other deck');

    const new1 = await seedCardWithState(deck.id, 'new oldest', new Date('2025-12-01T00:00:00Z'));
    const new2 = await seedCardWithState(deck.id, 'new middle', new Date('2025-12-02T00:00:00Z'));
    const new3 = await seedCardWithState(deck.id, 'new newest', new Date('2025-12-03T00:00:00Z'));

    const overdueReview = await seedCardWithState(deck.id, 'most overdue', T0, {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-05T00:00:00Z'),
    });
    const overdueLearning = await seedCardWithState(deck.id, 'less overdue', T0, {
      status: 'learning',
      step: 1,
      nextReview: new Date('2026-01-07T00:00:00Z'),
    });
    const boundaryRelearning = await seedCardWithState(deck.id, 'due exactly now', T0, {
      status: 'relearning',
      step: 0,
      easeFactor: 2.3,
      interval: 10,
      nextReview: NOW,
    });
    // Future-scheduled — must never appear in the queue.
    await seedCardWithState(deck.id, 'future review', T0, {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-12T00:00:00Z'),
    });
    // Due card in a different deck — must never appear in this deck's queue.
    await seedCardWithState(other.id, 'other deck due', T0, {
      status: 'review',
      interval: 6,
      easeFactor: 2.5,
      nextReview: new Date('2026-01-01T00:00:00Z'),
    });

    return { deckId: deck.id, overdueReview, overdueLearning, boundaryRelearning, new1, new2, new3 };
  }

  it('orders overdue first (by nextReview asc, boundary inclusive), then new by createdAt asc', async () => {
    const f = await seedQueue();
    const queue = unwrap(await ctx.cards.getReviewQueue(f.deckId, { now: NOW }));
    expect(queue.map((c) => c.id)).toEqual([
      f.overdueReview.id,
      f.overdueLearning.id,
      f.boundaryRelearning.id,
      f.new1.id,
      f.new2.id,
      f.new3.id,
    ]);
  });

  it('caps new cards at newCardLimit without touching due cards', async () => {
    const f = await seedQueue();
    const queue = unwrap(await ctx.cards.getReviewQueue(f.deckId, { now: NOW, newCardLimit: 2 }));
    expect(queue.map((c) => c.id)).toEqual([
      f.overdueReview.id,
      f.overdueLearning.id,
      f.boundaryRelearning.id,
      f.new1.id,
      f.new2.id,
    ]);

    const dueOnly = unwrap(await ctx.cards.getReviewQueue(f.deckId, { now: NOW, newCardLimit: 0 }));
    expect(dueOnly.map((c) => c.id)).toEqual([
      f.overdueReview.id,
      f.overdueLearning.id,
      f.boundaryRelearning.id,
    ]);
  });
});
