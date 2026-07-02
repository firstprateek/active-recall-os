/**
 * SM-2 spaced repetition engine — pure functions only.
 * No side effects, no database calls, no React/Zustand imports.
 *
 * Algorithm reference: SuperMemo SM-2 (Wozniak, 1987), adapted with
 * Anki-style learning/relearning steps. Every scheduling decision in the
 * app flows through this module.
 */

import type { Card, CardState, Rating } from '@/types/domain';

export const LEARNING_STEPS_MINUTES = [1, 10] as const;
export const RELEARNING_STEPS_MINUTES = [10] as const;
export const DEFAULT_EASE_FACTOR = 2.5;
export const MINIMUM_EASE_FACTOR = 1.3;
export const EASE_BONUS = 0.15; // Easy rating: EF += bonus
export const EASE_PENALTY_HARD = 0.15; // Hard rating: EF -= penalty
export const EASE_PENALTY_AGAIN = 0.2; // Again rating (lapse): EF -= penalty

const GRADUATING_INTERVAL_DAYS = 1; // learning → review (Good)
const EASY_GRADUATING_INTERVAL_DAYS = 4; // learning → review (Easy skips steps)
const SECOND_REVIEW_INTERVAL_DAYS = 6; // SM-2 spec: second successful review
const HARD_INTERVAL_MULTIPLIER = 1.2; // Hard: interval grows minimally
const EASY_INTERVAL_BONUS = 1.3; // Easy: extra multiplier on top of EF
const MAX_INTERVAL_DAYS = 36_500; // 100 years — sanity ceiling
/** Fraction of the lapsed interval retained when a card returns to review. */
const LAPSE_INTERVAL_FACTOR = 0.5;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function clampEase(ef: number): number {
  return Math.max(MINIMUM_EASE_FACTOR, ef);
}

function clampInterval(days: number): number {
  return Math.min(Math.max(1, Math.round(days)), MAX_INTERVAL_DAYS);
}

/**
 * Given the card's current state and a rating, compute the next state.
 * `now` is a parameter (not Date.now()) for testability.
 */
export function calculateNextState(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
): CardState {
  const { state } = card;

  switch (state.status) {
    case 'new':
      // First exposure behaves like entering the learning queue at step 0.
      return rateLearning({ step: 0, ease: DEFAULT_EASE_FACTOR }, rating, now);

    case 'learning':
      return rateLearning({ step: state.step, ease: DEFAULT_EASE_FACTOR }, rating, now);

    case 'review':
      return rateReview(state, rating, now);

    case 'relearning':
      return rateRelearning(state, rating, now);
  }
}

function rateLearning(
  ctx: { step: number; ease: number },
  rating: Rating,
  now: Date,
): CardState {
  switch (rating) {
    case 1:
      // Again — restart the learning steps.
      return {
        status: 'learning',
        step: 0,
        nextReview: addMinutes(now, LEARNING_STEPS_MINUTES[0]),
      };
    case 2: {
      // Hard — repeat the current step without advancing.
      const stepMinutes = LEARNING_STEPS_MINUTES[ctx.step] ?? LEARNING_STEPS_MINUTES[0];
      return {
        status: 'learning',
        step: ctx.step,
        nextReview: addMinutes(now, stepMinutes),
      };
    }
    case 3: {
      // Good — advance one step; graduate after the last step.
      const nextStep = ctx.step + 1;
      const stepMinutes = LEARNING_STEPS_MINUTES[nextStep];
      if (stepMinutes === undefined) {
        return {
          status: 'review',
          interval: GRADUATING_INTERVAL_DAYS,
          easeFactor: ctx.ease,
          nextReview: addDays(now, GRADUATING_INTERVAL_DAYS),
        };
      }
      return { status: 'learning', step: nextStep, nextReview: addMinutes(now, stepMinutes) };
    }
    case 4:
      // Easy — skip remaining steps and graduate immediately with a bonus interval.
      return {
        status: 'review',
        interval: EASY_GRADUATING_INTERVAL_DAYS,
        easeFactor: ctx.ease,
        nextReview: addDays(now, EASY_GRADUATING_INTERVAL_DAYS),
      };
  }
}

function rateReview(
  state: Extract<CardState, { status: 'review' }>,
  rating: Rating,
  now: Date,
): CardState {
  switch (rating) {
    case 1: {
      // Lapse — ease penalty, drop into relearning; interval will restart
      // at a fraction of the lapsed interval on graduation.
      const ease = clampEase(state.easeFactor - EASE_PENALTY_AGAIN);
      return {
        status: 'relearning',
        step: 0,
        easeFactor: ease,
        interval: state.interval,
        nextReview: addMinutes(now, RELEARNING_STEPS_MINUTES[0]),
      };
    }
    case 2: {
      // Hard — minimal growth, ease penalty. Interval must still move
      // forward at least 1 day past the previous interval.
      const ease = clampEase(state.easeFactor - EASE_PENALTY_HARD);
      const interval = clampInterval(
        Math.max(state.interval + 1, state.interval * HARD_INTERVAL_MULTIPLIER),
      );
      return { status: 'review', interval, easeFactor: ease, nextReview: addDays(now, interval) };
    }
    case 3: {
      // Good — SM-2 core: 1 → 6 → previous * EF.
      const interval = clampInterval(nextGoodInterval(state.interval, state.easeFactor));
      return {
        status: 'review',
        interval,
        easeFactor: state.easeFactor,
        nextReview: addDays(now, interval),
      };
    }
    case 4: {
      // Easy — ease bonus plus an extra interval multiplier.
      const ease = clampEase(state.easeFactor + EASE_BONUS);
      const interval = clampInterval(
        nextGoodInterval(state.interval, state.easeFactor) * EASY_INTERVAL_BONUS,
      );
      return { status: 'review', interval, easeFactor: ease, nextReview: addDays(now, interval) };
    }
  }
}

/** SM-2 interval ladder: first review 1d, second 6d, then previous * EF. */
function nextGoodInterval(previousInterval: number, ease: number): number {
  if (previousInterval < 1) return 1;
  if (previousInterval === 1) return SECOND_REVIEW_INTERVAL_DAYS;
  return previousInterval * ease;
}

function rateRelearning(
  state: Extract<CardState, { status: 'relearning' }>,
  rating: Rating,
  now: Date,
): CardState {
  switch (rating) {
    case 1:
      // Still failing — restart relearning steps, apply another ease penalty.
      return {
        status: 'relearning',
        step: 0,
        easeFactor: clampEase(state.easeFactor - EASE_PENALTY_AGAIN),
        interval: state.interval,
        nextReview: addMinutes(now, RELEARNING_STEPS_MINUTES[0]),
      };
    case 2: {
      // Hard — repeat current relearning step.
      const stepMinutes = RELEARNING_STEPS_MINUTES[state.step] ?? RELEARNING_STEPS_MINUTES[0];
      return { ...state, nextReview: addMinutes(now, stepMinutes) };
    }
    case 3: {
      // Good — advance; graduate back to review at a fraction of the lapsed interval.
      const nextStep = state.step + 1;
      const stepMinutes = RELEARNING_STEPS_MINUTES[nextStep];
      if (stepMinutes === undefined) {
        const interval = clampInterval(Math.max(1, state.interval * LAPSE_INTERVAL_FACTOR));
        return {
          status: 'review',
          interval,
          easeFactor: state.easeFactor,
          nextReview: addDays(now, interval),
        };
      }
      return { ...state, step: nextStep, nextReview: addMinutes(now, stepMinutes) };
    }
    case 4: {
      // Easy — graduate immediately with the full lapse-restart interval + 1 day.
      const interval = clampInterval(Math.max(2, state.interval * LAPSE_INTERVAL_FACTOR + 1));
      return {
        status: 'review',
        interval,
        easeFactor: clampEase(state.easeFactor + EASE_BONUS),
        nextReview: addDays(now, interval),
      };
    }
  }
}

/** True if this card should appear in today's review queue. */
export function isDue(card: Card, now: Date = new Date()): boolean {
  const next = getNextReviewDate(card.state);
  // 'new' cards are always available to study.
  if (next === null) return true;
  return next.getTime() <= now.getTime();
}

/** Next scheduled review date, or null for 'new' cards. */
export function getNextReviewDate(state: CardState): Date | null {
  return state.status === 'new' ? null : state.nextReview;
}
