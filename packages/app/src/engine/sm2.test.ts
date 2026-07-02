/**
 * SM-2 engine tests — every state transition, with fixed Date instances.
 * No real clock: `now` is always passed explicitly.
 */

import {
  calculateNextState,
  getNextReviewDate,
  isDue,
  DEFAULT_EASE_FACTOR,
  EASE_BONUS,
  EASE_PENALTY_AGAIN,
  EASE_PENALTY_HARD,
  LEARNING_STEPS_MINUTES,
  MINIMUM_EASE_FACTOR,
  RELEARNING_STEPS_MINUTES,
} from '@/engine/sm2';
import type { Card, CardState } from '@/types/domain';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
// Not exported by sm2.ts — mirror of its internal constants (spec values).
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_GRADUATING_INTERVAL_DAYS = 4;
const SECOND_REVIEW_INTERVAL_DAYS = 6;
const MAX_INTERVAL_DAYS = 36_500;

const NOW = new Date('2026-01-01T00:00:00Z');
const CREATED = new Date('2025-12-01T00:00:00Z');

function minutesFrom(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * MINUTE_MS);
}

function daysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function makeCard(state: CardState): Card {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    front: 'What is a discriminated union?',
    back: 'A union narrowed by a literal tag property.',
    tags: [],
    state,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

/** Narrow a CardState to one branch or fail the test loudly. */
function expectStatus<S extends CardState['status']>(
  state: CardState,
  status: S,
): Extract<CardState, { status: S }> {
  if (state.status !== status) {
    throw new Error(`expected status '${status}', got '${state.status}'`);
  }
  // Safe cast: the guard above proves state.status === status, but TS cannot
  // narrow a union by a generic literal parameter.
  return state as Extract<CardState, { status: S }>;
}

describe('calculateNextState — new cards', () => {
  const card = makeCard({ status: 'new' });

  it('Again enters learning at step 0, due after the first learning step', () => {
    const next = expectStatus(calculateNextState(card, 1, NOW), 'learning');
    expect(next.step).toBe(0);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[0]));
  });

  it('Hard enters learning and repeats step 0', () => {
    const next = expectStatus(calculateNextState(card, 2, NOW), 'learning');
    expect(next.step).toBe(0);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[0]));
  });

  it('Good enters learning and advances to step 1', () => {
    const next = expectStatus(calculateNextState(card, 3, NOW), 'learning');
    expect(next.step).toBe(1);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[1]));
  });

  it('Easy graduates immediately to review with the easy interval', () => {
    const next = expectStatus(calculateNextState(card, 4, NOW), 'review');
    expect(next.interval).toBe(EASY_GRADUATING_INTERVAL_DAYS);
    expect(next.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(next.nextReview).toEqual(daysFrom(NOW, EASY_GRADUATING_INTERVAL_DAYS));
  });
});

describe('calculateNextState — learning', () => {
  const atStep = (step: number): Card =>
    makeCard({ status: 'learning', step, nextReview: NOW });

  it('Again resets to step 0 from a later step', () => {
    const next = expectStatus(calculateNextState(atStep(1), 1, NOW), 'learning');
    expect(next.step).toBe(0);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[0]));
  });

  it('Hard repeats the current step without advancing (step 0)', () => {
    const next = expectStatus(calculateNextState(atStep(0), 2, NOW), 'learning');
    expect(next.step).toBe(0);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[0]));
  });

  it('Hard repeats the current step without advancing (step 1)', () => {
    const next = expectStatus(calculateNextState(atStep(1), 2, NOW), 'learning');
    expect(next.step).toBe(1);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[1]));
  });

  it('Good advances one step within the learning queue', () => {
    const next = expectStatus(calculateNextState(atStep(0), 3, NOW), 'learning');
    expect(next.step).toBe(1);
    expect(next.nextReview).toEqual(minutesFrom(NOW, LEARNING_STEPS_MINUTES[1]));
  });

  it('Good on the last step graduates to review at 1 day with default ease', () => {
    const lastStep = LEARNING_STEPS_MINUTES.length - 1;
    const next = expectStatus(calculateNextState(atStep(lastStep), 3, NOW), 'review');
    expect(next.interval).toBe(GRADUATING_INTERVAL_DAYS);
    expect(next.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(next.nextReview).toEqual(daysFrom(NOW, GRADUATING_INTERVAL_DAYS));
  });

  it('Good through both steps graduates: new -> step 1 -> review interval 1', () => {
    const afterFirst = expectStatus(
      calculateNextState(makeCard({ status: 'new' }), 3, NOW),
      'learning',
    );
    expect(afterFirst.step).toBe(1);

    const secondRating = minutesFrom(NOW, LEARNING_STEPS_MINUTES[1]);
    const afterSecond = expectStatus(
      calculateNextState(makeCard(afterFirst), 3, secondRating),
      'review',
    );
    expect(afterSecond.interval).toBe(GRADUATING_INTERVAL_DAYS);
    expect(afterSecond.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(afterSecond.nextReview).toEqual(daysFrom(secondRating, GRADUATING_INTERVAL_DAYS));
  });

  it('Easy skips remaining steps and graduates at 4 days', () => {
    const next = expectStatus(calculateNextState(atStep(0), 4, NOW), 'review');
    expect(next.interval).toBe(EASY_GRADUATING_INTERVAL_DAYS);
    expect(next.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(next.nextReview).toEqual(daysFrom(NOW, EASY_GRADUATING_INTERVAL_DAYS));
  });
});

describe('calculateNextState — review', () => {
  const review = (interval: number, easeFactor: number): Card =>
    makeCard({ status: 'review', interval, easeFactor, nextReview: NOW });

  it('Good ladder first rung: interval 1 -> 6, ease unchanged', () => {
    const next = expectStatus(calculateNextState(review(1, DEFAULT_EASE_FACTOR), 3, NOW), 'review');
    expect(next.interval).toBe(SECOND_REVIEW_INTERVAL_DAYS);
    expect(next.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(next.nextReview).toEqual(daysFrom(NOW, SECOND_REVIEW_INTERVAL_DAYS));
  });

  it('Good ladder second rung: interval 6 -> round(6 * EF)', () => {
    const next = expectStatus(calculateNextState(review(6, 2.5), 3, NOW), 'review');
    expect(next.interval).toBe(Math.round(6 * 2.5)); // 15
    expect(next.easeFactor).toBe(2.5);
    expect(next.nextReview).toEqual(daysFrom(NOW, 15));
  });

  it('Good rounds fractional products to whole days', () => {
    const next = expectStatus(calculateNextState(review(10, 2.35), 3, NOW), 'review');
    expect(next.interval).toBe(24); // 10 * 2.35 = 23.5 -> round -> 24
    expect(next.easeFactor).toBe(2.35);
  });

  it('Hard grows minimally: prev * 1.2 wins for larger intervals, ease -0.15', () => {
    const next = expectStatus(calculateNextState(review(10, 2.0), 2, NOW), 'review');
    expect(next.interval).toBe(12); // max(11, 12)
    expect(next.easeFactor).toBeCloseTo(2.0 - EASE_PENALTY_HARD, 10);
    expect(next.nextReview).toEqual(daysFrom(NOW, 12));
  });

  it('Hard still moves forward at least 1 day past the previous interval', () => {
    const next = expectStatus(calculateNextState(review(1, DEFAULT_EASE_FACTOR), 2, NOW), 'review');
    expect(next.interval).toBe(2); // max(2, 1.2)
    expect(next.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR - EASE_PENALTY_HARD, 10);
  });

  it('Hard never pushes ease below the floor', () => {
    const next = expectStatus(
      calculateNextState(review(5, MINIMUM_EASE_FACTOR), 2, NOW),
      'review',
    );
    expect(next.easeFactor).toBe(MINIMUM_EASE_FACTOR);
  });

  it('Easy adds the ease bonus and an extra 1.3x on the Good interval', () => {
    const next = expectStatus(calculateNextState(review(6, 2.5), 4, NOW), 'review');
    // Interval uses the pre-bonus ease: round(6 * 2.5 * 1.3) = round(19.5) = 20.
    expect(next.interval).toBe(20);
    expect(next.easeFactor).toBeCloseTo(2.5 + EASE_BONUS, 10);
    expect(next.nextReview).toEqual(daysFrom(NOW, 20));
  });

  it('Easy from interval 1 applies the bonus to the 6-day rung', () => {
    const next = expectStatus(calculateNextState(review(1, 2.5), 4, NOW), 'review');
    expect(next.interval).toBe(8); // round(6 * 1.3) = round(7.8)
    expect(next.easeFactor).toBeCloseTo(2.5 + EASE_BONUS, 10);
  });

  it('Again lapses into relearning with penalized ease and the old interval carried', () => {
    const next = expectStatus(calculateNextState(review(20, 2.5), 1, NOW), 'relearning');
    expect(next.step).toBe(0);
    expect(next.easeFactor).toBeCloseTo(2.5 - EASE_PENALTY_AGAIN, 10);
    expect(next.interval).toBe(20); // carried for the lapse restart on graduation
    expect(next.nextReview).toEqual(minutesFrom(NOW, RELEARNING_STEPS_MINUTES[0]));
  });

  it('Again clamps ease at the floor on lapse', () => {
    const next = expectStatus(calculateNextState(review(20, 1.4), 1, NOW), 'relearning');
    expect(next.easeFactor).toBe(MINIMUM_EASE_FACTOR);
  });

  it('Good caps the interval at the 36500-day ceiling', () => {
    const next = expectStatus(
      calculateNextState(review(MAX_INTERVAL_DAYS, 2.5), 3, NOW),
      'review',
    );
    expect(next.interval).toBe(MAX_INTERVAL_DAYS);
    expect(next.nextReview).toEqual(daysFrom(NOW, MAX_INTERVAL_DAYS));
  });

  it('Easy and Hard also respect the interval ceiling', () => {
    const easy = expectStatus(calculateNextState(review(30_000, 2.5), 4, NOW), 'review');
    expect(easy.interval).toBe(MAX_INTERVAL_DAYS);
    const hard = expectStatus(calculateNextState(review(MAX_INTERVAL_DAYS, 2.5), 2, NOW), 'review');
    expect(hard.interval).toBe(MAX_INTERVAL_DAYS);
  });
});

describe('calculateNextState — relearning', () => {
  const relearning = (opts: { step?: number; easeFactor?: number; interval?: number } = {}): Card =>
    makeCard({
      status: 'relearning',
      step: opts.step ?? 0,
      easeFactor: opts.easeFactor ?? 2.3,
      interval: opts.interval ?? 20,
      nextReview: NOW,
    });

  it('Again restarts the steps and applies another ease penalty', () => {
    const next = expectStatus(calculateNextState(relearning({ easeFactor: 2.3 }), 1, NOW), 'relearning');
    expect(next.step).toBe(0);
    expect(next.easeFactor).toBeCloseTo(2.3 - EASE_PENALTY_AGAIN, 10);
    expect(next.interval).toBe(20); // lapsed interval still carried
    expect(next.nextReview).toEqual(minutesFrom(NOW, RELEARNING_STEPS_MINUTES[0]));
  });

  it('Hard repeats the current step with ease and interval untouched', () => {
    const next = expectStatus(calculateNextState(relearning(), 2, NOW), 'relearning');
    expect(next.step).toBe(0);
    expect(next.easeFactor).toBe(2.3);
    expect(next.interval).toBe(20);
    expect(next.nextReview).toEqual(minutesFrom(NOW, RELEARNING_STEPS_MINUTES[0]));
  });

  it('Good graduates back to review at half the lapsed interval, ease carried', () => {
    const next = expectStatus(calculateNextState(relearning({ interval: 20 }), 3, NOW), 'review');
    expect(next.interval).toBe(10); // 20 * 0.5
    expect(next.easeFactor).toBe(2.3);
    expect(next.nextReview).toEqual(daysFrom(NOW, 10));
  });

  it('Good graduation rounds the halved interval', () => {
    const next = expectStatus(calculateNextState(relearning({ interval: 5 }), 3, NOW), 'review');
    expect(next.interval).toBe(3); // round(2.5) rounds half up
  });

  it('Good graduation never drops below 1 day', () => {
    const next = expectStatus(calculateNextState(relearning({ interval: 1 }), 3, NOW), 'review');
    expect(next.interval).toBe(1); // max(1, 0.5)
  });

  it('Easy graduates at half the lapsed interval + 1 day with an ease bonus', () => {
    const next = expectStatus(calculateNextState(relearning({ interval: 20, easeFactor: 2.3 }), 4, NOW), 'review');
    expect(next.interval).toBe(11); // 20 * 0.5 + 1
    expect(next.easeFactor).toBeCloseTo(2.3 + EASE_BONUS, 10);
    expect(next.nextReview).toEqual(daysFrom(NOW, 11));
  });

  it('Easy graduation never drops below 2 days', () => {
    const next = expectStatus(calculateNextState(relearning({ interval: 1 }), 4, NOW), 'review');
    expect(next.interval).toBe(2); // max(2, 1.5)
  });
});

describe('ease floor', () => {
  it('many consecutive Agains never push ease below 1.3', () => {
    // Review lapse first, then repeated relearning failures.
    let state: CardState = { status: 'review', interval: 10, easeFactor: 1.5, nextReview: NOW };
    state = calculateNextState(makeCard(state), 1, NOW);

    for (let i = 0; i < 10; i += 1) {
      state = calculateNextState(makeCard(state), 1, NOW);
      const narrowed = expectStatus(state, 'relearning');
      expect(narrowed.easeFactor).toBeGreaterThanOrEqual(MINIMUM_EASE_FACTOR);
    }
    expect(expectStatus(state, 'relearning').easeFactor).toBe(MINIMUM_EASE_FACTOR);
  });
});

describe('isDue', () => {
  it('new cards are always due', () => {
    expect(isDue(makeCard({ status: 'new' }), NOW)).toBe(true);
    expect(isDue(makeCard({ status: 'new' }), new Date('2020-01-01T00:00:00Z'))).toBe(true);
  });

  it('learning: due exactly at nextReview (boundary), past due, not before', () => {
    const state: CardState = { status: 'learning', step: 0, nextReview: NOW };
    expect(isDue(makeCard(state), NOW)).toBe(true); // nextReview === now IS due
    expect(isDue(makeCard(state), new Date(NOW.getTime() + 1))).toBe(true);
    expect(isDue(makeCard(state), new Date(NOW.getTime() - 1))).toBe(false);
  });

  it('review: due exactly at nextReview (boundary), not when scheduled in the future', () => {
    const state: CardState = { status: 'review', interval: 6, easeFactor: 2.5, nextReview: NOW };
    expect(isDue(makeCard(state), NOW)).toBe(true);
    expect(isDue(makeCard(state), minutesFrom(NOW, -1))).toBe(false);
    expect(isDue(makeCard(state), daysFrom(NOW, 1))).toBe(true);
  });

  it('relearning: due exactly at nextReview (boundary), not before', () => {
    const state: CardState = {
      status: 'relearning',
      step: 0,
      easeFactor: 2.3,
      interval: 20,
      nextReview: NOW,
    };
    expect(isDue(makeCard(state), NOW)).toBe(true);
    expect(isDue(makeCard(state), new Date(NOW.getTime() - 1))).toBe(false);
  });
});

describe('getNextReviewDate', () => {
  it('returns null for new cards', () => {
    expect(getNextReviewDate({ status: 'new' })).toBeNull();
  });

  it('returns the scheduled date for learning, review, and relearning', () => {
    const when = new Date('2026-02-14T08:30:00Z');
    expect(getNextReviewDate({ status: 'learning', step: 1, nextReview: when })).toEqual(when);
    expect(
      getNextReviewDate({ status: 'review', interval: 6, easeFactor: 2.5, nextReview: when }),
    ).toEqual(when);
    expect(
      getNextReviewDate({
        status: 'relearning',
        step: 0,
        easeFactor: 2.3,
        interval: 20,
        nextReview: when,
      }),
    ).toEqual(when);
  });
});
