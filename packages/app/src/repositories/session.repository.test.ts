/**
 * SessionRepository tests — lifecycle (start / append / complete), the
 * completed-session guard, and range/deck queries.
 * Fresh fake-indexeddb per test; all timestamps are fixed Date instances.
 */

import Dexie from 'dexie';
import { ActiveRecallDB } from '@/db/schema';
import { SessionRepository } from '@/repositories/session.repository';
import type { AppError, Result } from '@/types/result';
import type { Rating, ReviewResult } from '@/types/domain';

const JAN_01 = new Date('2026-01-01T00:00:00Z');
const JAN_03 = new Date('2026-01-03T00:00:00Z');
const JAN_05 = new Date('2026-01-05T00:00:00Z');
const JAN_06 = new Date('2026-01-06T00:00:00Z');
const JAN_10 = new Date('2026-01-10T00:00:00Z');

interface TestContext {
  db: ActiveRecallDB;
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
  return { db, sessions: new SessionRepository(db) };
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

function makeResult(cardId: string, rating: Rating, reviewedAt: Date): ReviewResult {
  return {
    cardId,
    rating,
    responseTimeMs: 1200,
    stateBefore: { status: 'new' },
    stateAfter: {
      status: 'learning',
      step: 1,
      nextReview: new Date(reviewedAt.getTime() + 10 * 60_000),
    },
    reviewedAt,
  };
}

let ctx: TestContext;
beforeEach(() => {
  ctx = createContext();
});

describe('SessionRepository.start', () => {
  it('persists an in-progress session with no results', async () => {
    const session = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    expect(session.deckId).toBe('deck-1');
    expect(session.startedAt).toEqual(JAN_01);
    expect(session.completedAt).toBeNull();
    expect(session.cardsReviewed).toEqual([]);

    expect(unwrap(await ctx.sessions.getById(session.id))).toEqual(session);
  });
});

describe('SessionRepository.appendResult', () => {
  it('accumulates results in append order', async () => {
    const session = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    const r1 = makeResult('card-a', 3, new Date('2026-01-01T00:01:00Z'));
    const r2 = makeResult('card-b', 1, new Date('2026-01-01T00:02:00Z'));
    const r3 = makeResult('card-c', 4, new Date('2026-01-01T00:03:00Z'));

    unwrap(await ctx.sessions.appendResult(session.id, r1));
    unwrap(await ctx.sessions.appendResult(session.id, r2));
    const afterThird = unwrap(await ctx.sessions.appendResult(session.id, r3));

    expect(afterThird.cardsReviewed).toEqual([r1, r2, r3]);
    expect(unwrap(await ctx.sessions.getById(session.id)).cardsReviewed).toEqual([r1, r2, r3]);
  });

  it('rejects appends to a completed session with CONFLICT and does not mutate it', async () => {
    const session = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    unwrap(await ctx.sessions.appendResult(session.id, makeResult('card-a', 3, JAN_01)));
    unwrap(await ctx.sessions.complete(session.id, JAN_03));

    const error = unwrapErr(
      await ctx.sessions.appendResult(session.id, makeResult('card-b', 2, JAN_03)),
    );
    expect(error.code).toBe('CONFLICT');
    expect(unwrap(await ctx.sessions.getById(session.id)).cardsReviewed).toHaveLength(1);
  });

  it('returns NOT_FOUND for an unknown session', async () => {
    const error = unwrapErr(await ctx.sessions.appendResult('missing', makeResult('c', 3, JAN_01)));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('SessionRepository.complete', () => {
  it('sets completedAt to the provided time and persists it', async () => {
    const session = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    const completed = unwrap(await ctx.sessions.complete(session.id, JAN_03));
    expect(completed.completedAt).toEqual(JAN_03);
    expect(completed.startedAt).toEqual(JAN_01);
    expect(unwrap(await ctx.sessions.getById(session.id)).completedAt).toEqual(JAN_03);
  });

  it('returns NOT_FOUND for an unknown session', async () => {
    const error = unwrapErr(await ctx.sessions.complete('missing', JAN_03));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('SessionRepository.getCompletedBetween', () => {
  it('returns only completed sessions started within the inclusive range', async () => {
    // Started at both range boundaries and inside it — all completed.
    const atFrom = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    const inside = unwrap(await ctx.sessions.start('deck-1', JAN_05));
    const atTo = unwrap(await ctx.sessions.start('deck-1', JAN_06));
    // Inside the range but never completed — must be filtered out.
    const incomplete = unwrap(await ctx.sessions.start('deck-1', JAN_03));
    // Completed but started after the range — must be filtered out.
    const outside = unwrap(await ctx.sessions.start('deck-1', JAN_10));

    unwrap(await ctx.sessions.complete(atFrom.id, JAN_01));
    unwrap(await ctx.sessions.complete(inside.id, JAN_05));
    unwrap(await ctx.sessions.complete(atTo.id, JAN_06));
    unwrap(await ctx.sessions.complete(outside.id, JAN_10));

    const found = unwrap(await ctx.sessions.getCompletedBetween(JAN_01, JAN_06));
    expect(found.map((s) => s.id).sort()).toEqual(
      [atFrom.id, inside.id, atTo.id].sort(),
    );
    expect(found.map((s) => s.id)).not.toContain(incomplete.id);
    expect(found.map((s) => s.id)).not.toContain(outside.id);
  });
});

describe('SessionRepository.getByDeck', () => {
  it('returns only the deck\'s sessions sorted by startedAt ascending', async () => {
    const third = unwrap(await ctx.sessions.start('deck-1', JAN_05));
    const first = unwrap(await ctx.sessions.start('deck-1', JAN_01));
    const second = unwrap(await ctx.sessions.start('deck-1', JAN_03));
    unwrap(await ctx.sessions.start('deck-2', JAN_01)); // different deck — excluded

    const sessions = unwrap(await ctx.sessions.getByDeck('deck-1'));
    expect(sessions.map((s) => s.id)).toEqual([first.id, second.id, third.id]);
  });
});
