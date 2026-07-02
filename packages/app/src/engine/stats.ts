/**
 * Dashboard statistics engine — pure functions only.
 * No React, no Zustand, no Dexie; every function takes its inputs (including
 * `now`) as parameters so it is unit-testable with fixed dates.
 *
 * Date bucketing uses LOCAL date parts (getFullYear/getMonth/getDate), never
 * toISOString(): a review done at 23:30 local time is often already
 * "tomorrow" in UTC (any zone west of UTC), and one done at 00:30 is still
 * "yesterday" in UTC east of it. Users think in local calendar days — the
 * heatmap, streak, and forecast must bucket the same way.
 */

import type { Card, ReviewSession } from '@/types/domain';
import { getNextReviewDate } from '@/engine/sm2';

export type HeatIntensity = 0 | 1 | 2 | 3 | 4;

export interface DayActivity {
  /** ISO calendar date (yyyy-mm-dd) in LOCAL time. */
  date: string;
  count: number;
  intensity: HeatIntensity;
}

export interface DayForecast {
  /** ISO calendar date (yyyy-mm-dd) in LOCAL time. */
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** yyyy-mm-dd from LOCAL date parts (see module docblock for why not ISO/UTC). */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local midnight of the given date. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Day arithmetic via the Date constructor's overflow normalization: unlike
 * adding n * 24h of milliseconds, this stays on local midnights across DST
 * transitions (23- and 25-hour days).
 */
function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Review counts per local day for a zero-filled continuous range of `days`
 * days ending today. Counts every recorded review — including those from
 * sessions still in progress — because the heatmap shows activity, not
 * completion (completion is the streak's concern).
 *
 * Intensity is quantized against the window's max count into four equal
 * ratio buckets; 0 is reserved for "no reviews".
 */
export function reviewsPerDay(
  sessions: ReviewSession[],
  days: number,
  now: Date,
): DayActivity[] {
  if (days <= 0) return [];

  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const result of session.cardsReviewed) {
      const key = toLocalDateKey(result.reviewedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const start = addLocalDays(startOfLocalDay(now), -(days - 1));
  const range: Array<{ date: string; count: number }> = [];
  let max = 0;
  for (let i = 0; i < days; i += 1) {
    const date = toLocalDateKey(addLocalDays(start, i));
    const count = counts.get(date) ?? 0;
    if (count > max) max = count;
    range.push({ date, count });
  }

  return range.map(({ date, count }) => ({
    date,
    count,
    intensity: quantizeIntensity(count, max),
  }));
}

function quantizeIntensity(count: number, max: number): HeatIntensity {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * Consecutive local days with at least one COMPLETED session, ending today
 * or yesterday. A streak whose last completion was yesterday is still alive
 * (the user hasn't missed a day until today ends without a review), but a
 * gap of two or more days breaks it.
 */
export function currentStreak(sessions: ReviewSession[], now: Date): number {
  const completedDays = new Set<string>();
  for (const session of sessions) {
    if (session.completedAt !== null) {
      completedDays.add(toLocalDateKey(session.completedAt));
    }
  }

  let cursor = startOfLocalDay(now);
  if (!completedDays.has(toLocalDateKey(cursor))) {
    cursor = addLocalDays(cursor, -1);
    if (!completedDays.has(toLocalDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (completedDays.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}

/**
 * Fraction of all reviews rated Hard or better (>= 2), i.e. the card was
 * recalled at all. 0 when there are no reviews — callers should render
 * "no data" rather than a misleading 0%.
 */
export function retentionRate(sessions: ReviewSession[]): number {
  let total = 0;
  let retained = 0;
  for (const session of sessions) {
    for (const result of session.cardsReviewed) {
      total += 1;
      if (result.rating >= 2) retained += 1;
    }
  }
  return total === 0 ? 0 : retained / total;
}

/**
 * Cards becoming due per local day for `days` days starting today (day 0).
 * Already-overdue cards pile onto day 0 — they are work for "today".
 * 'new' cards have no scheduled date and are excluded; cards due beyond the
 * horizon are dropped.
 */
export function dueForecast(cards: Card[], days: number, now: Date): DayForecast[] {
  if (days <= 0) return [];

  const today = startOfLocalDay(now);
  const counts = new Array<number>(days).fill(0);

  for (const card of cards) {
    const next = getNextReviewDate(card.state);
    if (next === null) continue; // 'new' — nothing scheduled
    const dueDay = startOfLocalDay(next);
    // Round, don't floor: DST makes some local-midnight gaps 23h or 25h.
    const offset = Math.round((dueDay.getTime() - today.getTime()) / DAY_MS);
    const index = Math.max(0, offset); // overdue → day 0
    if (index < days) counts[index] = (counts[index] ?? 0) + 1;
  }

  return counts.map((count, i) => ({
    date: toLocalDateKey(addLocalDays(today, i)),
    count,
  }));
}

/** Total recorded reviews across all sessions. */
export function totalReviews(sessions: ReviewSession[]): number {
  return sessions.reduce((sum, session) => sum + session.cardsReviewed.length, 0);
}
