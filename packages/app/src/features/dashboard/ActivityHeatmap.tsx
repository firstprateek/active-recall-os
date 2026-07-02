/**
 * ActivityHeatmap — 12-week review activity as a GitHub-style grid:
 * columns are weeks, rows are Mon–Sun, cells are arc-heatmap-cell.
 * Month labels mark week columns where the month changes; the whole grid
 * scrolls horizontally on narrow screens.
 */

import { useMemo } from 'react';
import type { DayActivity } from '@/engine/stats';
import { ArcHeatmapCell } from '@/lib/wrappers';
import styles from './ActivityHeatmap.module.css';

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''] as const;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Parse a local yyyy-mm-dd key back into a local Date. */
function parseLocalDate(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Mon=0 … Sun=6 (ISO week rows). */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

interface WeekColumn {
  /** Month label shown above the column; '' when the month hasn't changed. */
  label: string;
  /** Exactly 7 slots, Mon–Sun; null = outside the data range. */
  days: Array<DayActivity | null>;
}

function buildWeeks(days: DayActivity[]): WeekColumn[] {
  const weeks: Array<Array<DayActivity | null>> = [];
  let current: Array<DayActivity | null> = [];

  const first = days[0];
  if (first !== undefined) {
    // Pad so the first day lands on its weekday row.
    const offset = weekdayIndex(parseLocalDate(first.date));
    for (let i = 0; i < offset; i += 1) current.push(null);
  }
  for (const day of days) {
    current.push(day);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  let previousMonth = -1;
  return weeks.map((weekDays) => {
    const firstDay = weekDays.find((day) => day !== null);
    const month = firstDay ? parseLocalDate(firstDay.date).getMonth() : -1;
    const label = month !== -1 && month !== previousMonth ? (MONTH_LABELS[month] ?? '') : '';
    if (month !== -1) previousMonth = month;
    return { label, days: weekDays };
  });
}

export function ActivityHeatmap({ days }: { days: DayActivity[] }) {
  const weeks = useMemo(() => buildWeeks(days), [days]);

  return (
    <div
      className={styles['scroller']}
      role="group"
      aria-label={`Review activity for the last ${days.length} days`}
    >
      <div className={styles['layout']}>
        <div className={styles['weekdays']} aria-hidden="true">
          <span className={styles['monthSpacer']} />
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className={styles['weekday']}>
              {label}
            </span>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles['week']}>
            <span className={styles['month']} aria-hidden="true">
              {week.label}
            </span>
            {week.days.map((day, dayIndex) =>
              day === null ? (
                <span key={dayIndex} className={styles['pad']} aria-hidden="true" />
              ) : (
                <ArcHeatmapCell
                  key={day.date}
                  date={day.date}
                  count={day.count}
                  intensity={day.intensity}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
