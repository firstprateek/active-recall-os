/**
 * DashboardPage — the "later analysis" surface: today's progress, streak,
 * retention, deck overview, 12-week activity heatmap, and a 14-day due-load
 * forecast. All heavy computation is memoized pure functions from the stats
 * engine; Recharts is code-split behind React.lazy.
 */

import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecks } from '@/hooks';
import { useAppStore } from '@/stores';
import { isDue } from '@/engine/sm2';
import {
  currentStreak,
  dueForecast,
  retentionRate,
  reviewsPerDay,
  totalReviews,
} from '@/engine/stats';
import { ModalHost } from '@/features/editor/ModalHost';
import { StatsRow } from '@/features/dashboard/StatsRow';
import { DeckGrid } from '@/features/dashboard/DeckGrid';
import { ActivityHeatmap } from '@/features/dashboard/ActivityHeatmap';
import { EmptyState } from '@/features/dashboard/EmptyState';
import { useAllCards, useAllSessions } from '@/features/dashboard/useDashboardData';
import styles from './DashboardPage.module.css';

// Bundle-splitting requirement: Recharts loads only when this page renders
// the forecast — never in the main chunk.
const DueForecastChart = lazy(() => import('@/features/dashboard/DueForecastChart'));

const HEATMAP_DAYS = 84; // 12 weeks
const FORECAST_DAYS = 14;

function ErrorNotice({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className={styles['errorBox']} role="alert">
      <span>{message}</span>
      <button type="button" className={styles['retry']} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { decks, loaded, refresh } = useDecks();
  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsError,
    refresh: refreshSessions,
  } = useAllSessions();
  const {
    cards,
    loading: cardsLoading,
    error: cardsError,
    refresh: refreshCards,
  } = useAllCards();
  const openModal = useAppStore((s) => s.uiActions.openModal);

  // syncBus messages only reach OTHER tabs — after a modal mutates data in
  // THIS tab, re-query the page-local data (decks refresh via the store).
  const handleDataChanged = () => {
    void refresh();
    void refreshCards();
    void refreshSessions();
  };

  const stats = useMemo(() => {
    const now = new Date();
    const activity = reviewsPerDay(sessions, HEATMAP_DAYS, now);
    const reviewedToday = activity[activity.length - 1]?.count ?? 0;
    const dueNow = cards.filter((c) => c.state.status !== 'new' && isDue(c, now)).length;
    return {
      activity,
      reviewedToday,
      // Target = work already done + what is still due, so the ring fills
      // toward 100% as the user clears today's queue.
      dueTarget: reviewedToday + dueNow,
      streak: currentStreak(sessions, now),
      retention: retentionRate(sessions),
      reviews: totalReviews(sessions),
      forecast: dueForecast(cards, FORECAST_DAYS, now),
    };
  }, [sessions, cards]);

  if (!loaded) {
    return (
      <div className={styles['loading']} role="status" aria-label="Loading dashboard">
        <div className={styles['spinner']} aria-hidden="true" />
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <>
        <EmptyState
          onSeeded={async () => {
            await Promise.all([refresh(), refreshCards(), refreshSessions()]);
          }}
        />
        <ModalHost onDataChanged={handleDataChanged} />
      </>
    );
  }

  return (
    <div className={styles['page']}>
      <h1 className={styles['srOnly']}>Dashboard</h1>

      <StatsRow
        reviewedToday={stats.reviewedToday}
        dueTarget={stats.dueTarget}
        streak={stats.streak}
        retention={stats.retention}
        hasReviews={stats.reviews > 0}
        totalCards={cards.length}
      />

      <section aria-labelledby="decks-heading">
        <h2 id="decks-heading" className={styles['heading']}>
          Your decks
        </h2>
        <DeckGrid
          decks={decks}
          onDeckClick={(deckId) => navigate(`/decks/${deckId}`)}
          onNewDeck={() => openModal({ kind: 'deck-editor' })}
        />
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className={styles['heading']}>
          Activity
        </h2>
        <div className={styles['panel']}>
          {sessionsError !== null ? (
            <ErrorNotice message={sessionsError} onRetry={() => void refreshSessions()} />
          ) : sessionsLoading ? (
            <div className={styles['skeleton']} role="status" aria-label="Loading activity" />
          ) : (
            <>
              <ActivityHeatmap days={stats.activity} />
              {stats.reviews === 0 && (
                <p className={styles['muted']}>
                  No reviews yet — your daily activity will show up here.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="forecast-heading">
        <h2 id="forecast-heading" className={styles['heading']}>
          Due forecast — next {FORECAST_DAYS} days
        </h2>
        <div className={styles['panel']}>
          {cardsError !== null ? (
            <ErrorNotice message={cardsError} onRetry={() => void refreshCards()} />
          ) : cardsLoading ? (
            <div className={styles['skeleton']} role="status" aria-label="Loading forecast" />
          ) : (
            <Suspense
              fallback={
                <div
                  className={styles['chartFallback']}
                  role="status"
                  aria-label="Loading chart"
                >
                  <div className={styles['spinner']} aria-hidden="true" />
                </div>
              }
            >
              <DueForecastChart data={stats.forecast} />
            </Suspense>
          )}
        </div>
      </section>

      <ModalHost onDataChanged={handleDataChanged} />
    </div>
  );
}
