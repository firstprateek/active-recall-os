/**
 * Review-feature formatting helpers — pure functions, no React.
 *
 * Interval buckets follow the review-page spec: minutes under an hour,
 * days under 30, months (30-day approximation) beyond that.
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;

/** Projected scheduling gap → 'Xm' | 'Xd' | 'X.Ymo'. */
export function formatInterval(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < HOUR_MS) return `${Math.max(1, Math.round(clamped / MINUTE_MS))}m`;
  if (clamped < MONTH_MS) return `${Math.max(1, Math.round(clamped / DAY_MS))}d`;
  return `${(clamped / MONTH_MS).toFixed(1)}mo`;
}

/** Elapsed-time sum → '42s' | '4m 12s' | '1h 03m'. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
