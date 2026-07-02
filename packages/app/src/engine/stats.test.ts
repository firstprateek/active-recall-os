/**
 * Stats engine tests — fixed dates only, no real clock.
 *
 * Every fixture date is built with the LOCAL-time Date constructor
 * (new Date(y, m, d, hh, mm)) so the assertions hold in any machine
 * timezone: the functions bucket by local date parts, and so do the tests.
 */

import {
  currentStreak,
  dueForecast,
  retentionRate,
  reviewsPerDay,
  toLocalDateKey,
  totalReviews,
} from '@/engine/stats';
import type {
  Card,
  CardState,
  Rating,
  ReviewResult,
  ReviewSession,
} from '@/types/domain';

// Saturday 2026-06-20, local noon.
const NOW = new Date(2026, 5, 20, 12, 0, 0);

function makeResult(reviewedAt: Date, rating: Rating = 3): ReviewResult {
  return {
    cardId: 'card-1',
    rating,
    responseTimeMs: 1500,
    stateBefore: { status: 'new' },
    stateAfter: { status: 'learning', step: 0, nextReview: reviewedAt },
    reviewedAt,
  };
}

let sessionSeq = 0;
function makeSession(
  results: ReviewResult[],
  completedAt: Date | null,
): ReviewSession {
  sessionSeq += 1;
  return {
    id: `session-${sessionSeq}`,
    deckId: 'deck-1',
    startedAt: results[0]?.reviewedAt ?? completedAt ?? new Date(2026, 5, 1),
    completedAt,
    cardsReviewed: results,
  };
}

let cardSeq = 0;
function makeCard(state: CardState): Card {
  cardSeq += 1;
  return {
    id: `card-${cardSeq}`,
    deckId: 'deck-1',
    front: 'front',
    back: 'back',
    tags: [],
    state,
    createdAt: new Date(2026, 4, 1),
    updatedAt: new Date(2026, 4, 1),
  };
}

function reviewState(nextReview: Date): CardState {
  return { status: 'review', interval: 5, easeFactor: 2.5, nextReview };
}

describe('toLocalDateKey', () => {
  it('formats local date parts as yyyy-mm-dd with zero padding', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 0, 0, 1))).toBe('2026-01-05');
    expect(toLocalDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('reviewsPerDay', () => {
  it('returns a zero-filled continuous range of `days` entries ending today', () => {
    const result = reviewsPerDay([], 7, NOW);
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ date: '2026-06-14', count: 0, intensity: 0 });
    expect(result[6]).toEqual({ date: '2026-06-20', count: 0, intensity: 0 });
    // Continuous: every consecutive pair is exactly one calendar day apart.
    expect(result.map((d) => d.date)).toEqual([
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
    ]);
  });

  it('counts individual reviews bucketed by their local day', () => {
    const sessions = [
      makeSession(
        [
          makeResult(new Date(2026, 5, 18, 9, 0)),
          makeResult(new Date(2026, 5, 18, 9, 5)),
          makeResult(new Date(2026, 5, 20, 8, 0)),
        ],
        new Date(2026, 5, 20, 8, 30),
      ),
    ];
    const result = reviewsPerDay(sessions, 7, NOW);
    expect(result.find((d) => d.date === '2026-06-18')?.count).toBe(2);
    expect(result.find((d) => d.date === '2026-06-20')?.count).toBe(1);
    expect(result.find((d) => d.date === '2026-06-19')?.count).toBe(0);
  });

  it('buckets a 23:30 review on its local calendar day, never the UTC day', () => {
    // 23:30 local is already the NEXT day in UTC anywhere west of UTC —
    // bucketing via toISOString() would shift this review to June 20.
    // Local date parts keep it on the day the user actually studied.
    const sessions = [makeSession([makeResult(new Date(2026, 5, 19, 23, 30))], null)];
    const result = reviewsPerDay(sessions, 7, NOW);
    expect(result.find((d) => d.date === '2026-06-19')?.count).toBe(1);
    expect(result.find((d) => d.date === '2026-06-20')?.count).toBe(0);
  });

  it('buckets a 00:15 review on its local calendar day, never the UTC day', () => {
    // Mirror case: 00:15 local is still the PREVIOUS day in UTC anywhere
    // east of UTC.
    const sessions = [makeSession([makeResult(new Date(2026, 5, 20, 0, 15))], null)];
    const result = reviewsPerDay(sessions, 7, NOW);
    expect(result.find((d) => d.date === '2026-06-20')?.count).toBe(1);
    expect(result.find((d) => d.date === '2026-06-19')?.count).toBe(0);
  });

  it('counts reviews from in-progress (uncompleted) sessions', () => {
    const sessions = [makeSession([makeResult(new Date(2026, 5, 20, 10, 0))], null)];
    expect(reviewsPerDay(sessions, 1, NOW)[0]?.count).toBe(1);
  });

  it('aggregates multiple sessions on the same day', () => {
    const sessions = [
      makeSession([makeResult(new Date(2026, 5, 20, 9, 0))], new Date(2026, 5, 20, 9, 5)),
      makeSession([makeResult(new Date(2026, 5, 20, 21, 0))], new Date(2026, 5, 20, 21, 5)),
    ];
    expect(reviewsPerDay(sessions, 1, NOW)[0]?.count).toBe(2);
  });

  it('ignores reviews before the window', () => {
    const sessions = [makeSession([makeResult(new Date(2026, 5, 10, 9, 0))], null)];
    const result = reviewsPerDay(sessions, 7, NOW);
    expect(result.every((d) => d.count === 0)).toBe(true);
  });

  it('quantizes intensity into four equal ratio buckets against the window max', () => {
    const day = (dayOfMonth: number, reviews: number): ReviewResult[] =>
      Array.from({ length: reviews }, (_, i) =>
        makeResult(new Date(2026, 5, dayOfMonth, 9, i)),
      );
    // max = 8; ratios: 2/8=.25→1, 4/8=.5→2, 6/8=.75→3, 8/8=1→4, 0→0.
    const sessions = [
      makeSession(
        [...day(16, 8), ...day(17, 2), ...day(18, 4), ...day(19, 6)],
        null,
      ),
    ];
    const result = reviewsPerDay(sessions, 5, NOW);
    expect(result.map((d) => d.intensity)).toEqual([4, 1, 2, 3, 0]);
  });

  it('gives the only active day intensity 4 when it is the max', () => {
    const sessions = [makeSession([makeResult(new Date(2026, 5, 20, 9, 0))], null)];
    expect(reviewsPerDay(sessions, 3, NOW)[2]?.intensity).toBe(4);
  });

  it('returns [] for days <= 0', () => {
    expect(reviewsPerDay([], 0, NOW)).toEqual([]);
    expect(reviewsPerDay([], -3, NOW)).toEqual([]);
  });
});

describe('currentStreak', () => {
  const completedOn = (...dates: Date[]): ReviewSession[] =>
    dates.map((d) => makeSession([makeResult(d)], d));

  it('is 0 with no sessions', () => {
    expect(currentStreak([], NOW)).toBe(0);
  });

  it('is 1 after completing a session today', () => {
    expect(currentStreak(completedOn(new Date(2026, 5, 20, 8, 0)), NOW)).toBe(1);
  });

  it('is still alive when the last completion was yesterday', () => {
    expect(currentStreak(completedOn(new Date(2026, 5, 19, 8, 0)), NOW)).toBe(1);
  });

  it('is 0 when the last completion was two days ago', () => {
    expect(currentStreak(completedOn(new Date(2026, 5, 18, 8, 0)), NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const sessions = completedOn(
      new Date(2026, 5, 18, 8, 0),
      new Date(2026, 5, 19, 8, 0),
      new Date(2026, 5, 20, 8, 0),
    );
    expect(currentStreak(sessions, NOW)).toBe(3);
  });

  it('stops at a gap', () => {
    const sessions = completedOn(
      new Date(2026, 5, 16, 8, 0), // gap on the 17th breaks the chain
      new Date(2026, 5, 18, 8, 0),
      new Date(2026, 5, 19, 8, 0),
      new Date(2026, 5, 20, 8, 0),
    );
    expect(currentStreak(sessions, NOW)).toBe(3);
  });

  it('counts multiple completions on one day as a single streak day', () => {
    const sessions = completedOn(
      new Date(2026, 5, 20, 8, 0),
      new Date(2026, 5, 20, 21, 0),
    );
    expect(currentStreak(sessions, NOW)).toBe(1);
  });

  it('ignores uncompleted sessions', () => {
    const sessions = [makeSession([makeResult(new Date(2026, 5, 20, 8, 0))], null)];
    expect(currentStreak(sessions, NOW)).toBe(0);
  });

  it('survives DST transitions via local-day arithmetic', () => {
    // 2026-03-08 is the US spring-forward date (a 23-hour local day).
    // Millisecond arithmetic (midnight - 24h) would land on the wrong day
    // in DST zones; constructor-based day math cannot. In zones without
    // DST this is simply a plain 3-day streak — the assertion holds anywhere.
    const dstNow = new Date(2026, 2, 9, 9, 0);
    const sessions = completedOn(
      new Date(2026, 2, 7, 8, 0),
      new Date(2026, 2, 8, 8, 0),
      new Date(2026, 2, 9, 8, 0),
    );
    expect(currentStreak(sessions, dstNow)).toBe(3);
  });
});

describe('retentionRate', () => {
  it('is 0 with no sessions or no reviews', () => {
    expect(retentionRate([])).toBe(0);
    expect(retentionRate([makeSession([], new Date(2026, 5, 20))])).toBe(0);
  });

  it('is 1 when every rating is Hard or better', () => {
    const t = new Date(2026, 5, 20, 9, 0);
    const sessions = [
      makeSession([makeResult(t, 2), makeResult(t, 3), makeResult(t, 4)], t),
    ];
    expect(retentionRate(sessions)).toBe(1);
  });

  it('counts Again (1) as forgotten', () => {
    const t = new Date(2026, 5, 20, 9, 0);
    const sessions = [
      makeSession([makeResult(t, 1), makeResult(t, 1), makeResult(t, 3), makeResult(t, 4)], t),
    ];
    expect(retentionRate(sessions)).toBe(0.5);
  });

  it('aggregates across sessions', () => {
    const t = new Date(2026, 5, 20, 9, 0);
    const sessions = [
      makeSession([makeResult(t, 1)], t),
      makeSession([makeResult(t, 3), makeResult(t, 3)], null),
    ];
    expect(retentionRate(sessions)).toBeCloseTo(2 / 3);
  });
});

describe('dueForecast', () => {
  it('returns `days` zero-filled entries starting today for no cards', () => {
    const result = dueForecast([], 14, NOW);
    expect(result).toHaveLength(14);
    expect(result[0]).toEqual({ date: '2026-06-20', count: 0 });
    expect(result[13]).toEqual({ date: '2026-07-03', count: 0 });
    expect(result.every((d) => d.count === 0)).toBe(true);
  });

  it('counts a card due later today on day 0', () => {
    const cards = [makeCard(reviewState(new Date(2026, 5, 20, 18, 0)))];
    expect(dueForecast(cards, 14, NOW)[0]?.count).toBe(1);
  });

  it('counts overdue cards on day 0', () => {
    const cards = [
      makeCard(reviewState(new Date(2026, 5, 15, 9, 0))),
      makeCard(reviewState(new Date(2026, 4, 1, 9, 0))),
    ];
    const result = dueForecast(cards, 14, NOW);
    expect(result[0]?.count).toBe(2);
    expect(totalCount(result)).toBe(2);
  });

  it('buckets future cards on their local due day', () => {
    const cards = [
      makeCard(reviewState(new Date(2026, 5, 21, 0, 30))), // tomorrow, just after midnight
      makeCard(reviewState(new Date(2026, 5, 21, 23, 45))), // tomorrow, late night
      makeCard(reviewState(new Date(2026, 5, 25, 12, 0))), // +5 days
    ];
    const result = dueForecast(cards, 14, NOW);
    expect(result[1]?.count).toBe(2);
    expect(result[5]?.count).toBe(1);
  });

  it('includes the last day of the horizon and drops cards beyond it', () => {
    const cards = [
      makeCard(reviewState(new Date(2026, 6, 3, 9, 0))), // day 13 — last included
      makeCard(reviewState(new Date(2026, 6, 4, 9, 0))), // day 14 — beyond horizon
    ];
    const result = dueForecast(cards, 14, NOW);
    expect(result[13]?.count).toBe(1);
    expect(totalCount(result)).toBe(1);
  });

  it('excludes new cards (nothing scheduled)', () => {
    const cards = [makeCard({ status: 'new' })];
    expect(totalCount(dueForecast(cards, 14, NOW))).toBe(0);
  });

  it('counts learning and relearning cards by their nextReview', () => {
    const cards = [
      makeCard({ status: 'learning', step: 0, nextReview: new Date(2026, 5, 20, 12, 10) }),
      makeCard({
        status: 'relearning',
        step: 0,
        easeFactor: 2.3,
        interval: 4,
        nextReview: new Date(2026, 5, 22, 9, 0),
      }),
    ];
    const result = dueForecast(cards, 14, NOW);
    expect(result[0]?.count).toBe(1);
    expect(result[2]?.count).toBe(1);
  });

  it('returns [] for days <= 0', () => {
    expect(dueForecast([], 0, NOW)).toEqual([]);
    expect(dueForecast([], -1, NOW)).toEqual([]);
  });
});

describe('totalReviews', () => {
  it('is 0 with no sessions', () => {
    expect(totalReviews([])).toBe(0);
  });

  it('sums reviews across all sessions, completed or not', () => {
    const t = new Date(2026, 5, 20, 9, 0);
    const sessions = [
      makeSession([makeResult(t), makeResult(t)], t),
      makeSession([makeResult(t)], null),
      makeSession([], t),
    ];
    expect(totalReviews(sessions)).toBe(3);
  });
});

function totalCount(days: Array<{ count: number }>): number {
  return days.reduce((sum, d) => sum + d.count, 0);
}
