/**
 * SessionSummary — end-of-session stats rendered from a results snapshot.
 *
 * The flow component snapshots results BEFORE calling finish() (which resets
 * the store), so this component owns no session state — it is a pure view of
 * an immutable ReviewResult[].
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Rating, ReviewResult } from '@/types/domain';
import { formatDuration } from '@/features/review/format';
import styles from './SessionSummary.module.css';

const RATING_META = [
  { rating: 1, label: 'Again', chipClass: 'chipAgain' },
  { rating: 2, label: 'Hard', chipClass: 'chipHard' },
  { rating: 3, label: 'Good', chipClass: 'chipGood' },
  { rating: 4, label: 'Easy', chipClass: 'chipEasy' },
] as const satisfies ReadonlyArray<{ rating: Rating; label: string; chipClass: string }>;

interface SessionSummaryProps {
  results: ReviewResult[];
  deckId: string;
  onReviewAgain(): void;
}

export function SessionSummary({ results, deckId, onReviewAgain }: SessionSummaryProps) {
  const { counts, totalMs } = useMemo(() => {
    const tally: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let elapsed = 0;
    for (const result of results) {
      tally[result.rating] += 1;
      elapsed += result.responseTimeMs;
    }
    return { counts: tally, totalMs: elapsed };
  }, [results]);

  const total = results.length;
  // Retention = anything the user recalled at all (Hard/Good/Easy); only
  // 'Again' counts as forgotten.
  const retained = counts[2] + counts[3] + counts[4];
  const retention = total > 0 ? Math.round((retained / total) * 100) : 0;
  const cardsPerMinute = totalMs > 0 ? ((total * 60_000) / totalMs).toFixed(1) : null;
  const hasLapses = counts[1] > 0;

  return (
    <section className={styles['summary']} aria-labelledby="review-summary-title">
      <h1 id="review-summary-title" className={styles['title']}>
        Session complete
      </h1>

      <p className={styles['retention']} aria-label={`${retention} percent retention`}>
        {retention}
        <span className={styles['retentionUnit']} aria-hidden="true">
          %
        </span>
      </p>
      <p className={styles['retentionCaption']}>retention this session</p>

      <ul className={styles['chips']} aria-label="Ratings breakdown">
        {RATING_META.map((meta) => (
          <li
            key={meta.rating}
            className={`${styles['chip'] ?? ''} ${styles[meta.chipClass] ?? ''} ${
              counts[meta.rating] === 0 ? (styles['chipEmpty'] ?? '') : ''
            }`}
          >
            {meta.label} <span className={styles['chipCount']}>{counts[meta.rating]}</span>
          </li>
        ))}
      </ul>

      <dl className={styles['stats']}>
        <div className={styles['stat']}>
          <dt className={styles['statLabel']}>Cards reviewed</dt>
          <dd className={styles['statValue']}>{total}</dd>
        </div>
        <div className={styles['stat']}>
          <dt className={styles['statLabel']}>Total time</dt>
          <dd className={styles['statValue']}>{formatDuration(totalMs)}</dd>
        </div>
        <div className={styles['stat']}>
          <dt className={styles['statLabel']}>Cards / min</dt>
          <dd className={styles['statValue']}>{cardsPerMinute ?? '—'}</dd>
        </div>
      </dl>

      <div className={styles['actions']}>
        {hasLapses ? (
          <button type="button" className={styles['primaryAction']} onClick={onReviewAgain}>
            Review again
          </button>
        ) : null}
        <Link
          className={hasLapses ? styles['secondaryAction'] : styles['primaryAction']}
          to={`/decks/${deckId}`}
        >
          Back to deck
        </Link>
        <Link className={styles['secondaryAction']} to="/">
          Home
        </Link>
      </div>
    </section>
  );
}
