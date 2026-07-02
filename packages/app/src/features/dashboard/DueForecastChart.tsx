/**
 * DueForecastChart — cards coming due per day as a Recharts bar chart.
 * Loaded exclusively via React.lazy from the dashboard so Recharts stays
 * out of the main bundle (code-splitting requirement) — never import this
 * module statically.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayForecast } from '@/engine/stats';
import styles from './DueForecastChart.module.css';

/** '2026-07-04' → '7/4' — compact ticks that survive 375px-wide screens. */
function formatTick(date: string): string {
  const [, month = '', day = ''] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export default function DueForecastChart({ data }: { data: DayForecast[] }) {
  if (data.every((day) => day.count === 0)) {
    return (
      <div className={styles['empty']}>
        Nothing scheduled yet — reviewed cards will show up here as they come due.
      </div>
    );
  }

  return (
    <div className={styles['chart']} role="img" aria-label="Bar chart of cards due per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--arc-color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatTick}
            tick={{ fill: 'var(--arc-color-text-secondary)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--arc-color-border)' }}
            minTickGap={12}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--arc-color-text-secondary)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--arc-color-surface-tertiary)' }}
            contentStyle={{
              backgroundColor: 'var(--arc-color-surface-raised)',
              border: '1px solid var(--arc-color-border)',
              borderRadius: 10,
              color: 'var(--arc-color-text-primary)',
            }}
            labelStyle={{ color: 'var(--arc-color-text-secondary)' }}
          />
          <Bar
            dataKey="count"
            name="Cards due"
            fill="var(--arc-color-accent)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
