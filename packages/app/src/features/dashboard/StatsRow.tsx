/**
 * StatsRow — the dashboard's headline numbers: today's progress ring,
 * streak, retention, and total cards. Pure presentation; all values are
 * computed upstream by the stats engine.
 */

import { ArcProgressRing, ArcStreakCounter } from '@/lib/wrappers';
import styles from './StatsRow.module.css';

interface StatsRowProps {
  reviewedToday: number;
  /** Reviews done today + cards still due right now. */
  dueTarget: number;
  streak: number;
  /** Fraction 0..1; only meaningful when hasReviews. */
  retention: number;
  hasReviews: boolean;
  totalCards: number;
}

export function StatsRow({
  reviewedToday,
  dueTarget,
  streak,
  retention,
  hasReviews,
  totalCards,
}: StatsRowProps) {
  const retentionLabel = hasReviews ? `${Math.round(retention * 100)}%` : '—';

  return (
    <section className={styles['row']} aria-label="Study statistics">
      <div className={styles['card']}>
        <ArcProgressRing
          value={reviewedToday}
          max={dueTarget}
          size={84}
          label={`${reviewedToday}/${dueTarget}`}
        />
        <span className={styles['caption']}>Reviewed today</span>
      </div>

      <div className={styles['card']}>
        <ArcStreakCounter count={streak} active={streak > 0} />
      </div>

      <div className={styles['card']}>
        <span className={styles['value']} aria-hidden="true">
          {retentionLabel}
        </span>
        <span
          className={styles['caption']}
          aria-label={
            hasReviews
              ? `Retention ${Math.round(retention * 100)} percent`
              : 'Retention: no reviews yet'
          }
        >
          Retention
        </span>
      </div>

      <div className={styles['card']}>
        <span className={styles['value']}>{totalCards}</span>
        <span className={styles['caption']}>Total cards</span>
      </div>
    </section>
  );
}
