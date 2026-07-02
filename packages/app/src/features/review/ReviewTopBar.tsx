/**
 * ReviewTopBar — progress readout plus a quiet early-exit control.
 * Pure presentation; the flow component owns what "End session" means.
 */

import { ArcProgressRing } from '@/lib/wrappers';
import styles from './ReviewTopBar.module.css';

interface ReviewTopBarProps {
  reviewedCount: number;
  total: number;
  onEnd(): void;
}

export function ReviewTopBar({ reviewedCount, total, onEnd }: ReviewTopBarProps) {
  const current = Math.min(reviewedCount + 1, total);

  return (
    <div className={styles['topbar']}>
      <div className={styles['progress']}>
        <ArcProgressRing value={reviewedCount} max={total} size={30} />
        <span className={styles['progressText']} aria-live="polite">
          {current} of {total}
        </span>
      </div>
      <button
        type="button"
        className={styles['endButton']}
        onClick={onEnd}
        aria-label="End session early"
      >
        End session
      </button>
    </div>
  );
}
