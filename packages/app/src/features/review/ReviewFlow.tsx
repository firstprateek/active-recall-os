/**
 * ReviewFlow — orchestrates one full review session for a deck.
 *
 * View machine layered over useReviewSession:
 *   preflight check → loading → active (card loop) → summary
 * with dedicated empty ("all caught up") and error states.
 *
 * Two store realities shape this component:
 * 1. startSession persists a session row BEFORE it knows the queue is empty,
 *    so we preflight cardRepository.getReviewQueue and never start a session
 *    for an empty queue — no orphaned empty session records.
 * 2. completeSession resets store results, so we snapshot results locally
 *    before calling finish(); the summary renders from the snapshot.
 *
 * Unmounting mid-session calls abandonSession, which completes the session
 * with its partial results — reviews already made are never lost.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Rating, ReviewResult } from '@/types/domain';
import { useReviewSession } from '@/hooks';
import { useAppStore } from '@/stores';
import { cardRepository } from '@/repositories/card.repository';
import { CardStage } from '@/features/review/CardStage';
import { KeyHints } from '@/features/review/KeyHints';
import { ReviewTopBar } from '@/features/review/ReviewTopBar';
import { SessionSummary } from '@/features/review/SessionSummary';
import styles from './ReviewFlow.module.css';

const KEY_TO_RATING: Readonly<Record<string, Rating>> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
};

type Gate = 'checking' | 'empty' | 'ready' | 'failed';

/** True when the key press belongs to a text-entry control, not the page. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True for controls where Enter/Space already mean "activate me". */
function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'BUTTON' || tag === 'A' || target.getAttribute('role') === 'button';
}

export function ReviewFlow({ deckId }: { deckId: string }) {
  const {
    status,
    error,
    currentCard,
    queueLength,
    reviewedCount,
    results,
    revealed,
    start,
    reveal,
    rate,
    finish,
  } = useReviewSession(deckId);
  const navigate = useNavigate();

  const [gate, setGate] = useState<Gate>('checking');
  const [gateError, setGateError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReviewResult[] | null>(null);

  const beganRef = useRef(false); // StrictMode double-invoke guard
  const finishingRef = useRef(false); // completeSession fired exactly once
  const ratingInFlightRef = useRef(false); // no double-rating from rapid input

  const begin = useCallback(async () => {
    setGate('checking');
    setGateError(null);
    setSummary(null);
    finishingRef.current = false;
    // Preflight: the store's startSession would persist a session row even
    // for an empty queue, so check emptiness first and never start one.
    const queue = await cardRepository.getReviewQueue(deckId);
    if (!queue.ok) {
      setGateError(queue.error.message);
      setGate('failed');
      return;
    }
    if (queue.value.length === 0) {
      setGate('empty');
      return;
    }
    setGate('ready');
    await start();
  }, [deckId, start]);

  // Start exactly once on mount. The ref survives StrictMode's simulated
  // unmount/remount, so the effect's second invocation is a no-op.
  useEffect(() => {
    if (beganRef.current) return;
    beganRef.current = true;
    void begin();
  }, [begin]);

  // Leaving mid-session abandons it: partial results are completed and
  // persisted by the store (abandonSession → sessionRepository.complete).
  useEffect(() => {
    return () => {
      const { activeSession, sessionActions } = useAppStore.getState();
      if (activeSession !== null) {
        void sessionActions.abandonSession();
      }
    };
  }, []);

  // Queue exhausted → snapshot results, then persist completion. The
  // snapshot must happen first because finish() resets store results.
  useEffect(() => {
    if (status !== 'complete' || finishingRef.current) return;
    finishingRef.current = true;
    setSummary(results);
    void finish();
  }, [status, results, finish]);

  const safeRate = useCallback(
    async (rating: Rating) => {
      if (ratingInFlightRef.current) return;
      ratingInFlightRef.current = true;
      try {
        await rate(rating);
      } finally {
        ratingInFlightRef.current = false;
      }
    },
    [rate],
  );

  const handleCardRate = useCallback(
    (rating: Rating) => {
      void safeRate(rating);
    },
    [safeRate],
  );

  const endEarly = useCallback(() => {
    if (results.length === 0) {
      // Nothing reviewed — no summary to show. Navigating away unmounts the
      // flow, and the unmount cleanup abandons the session.
      navigate(`/decks/${deckId}`);
      return;
    }
    finishingRef.current = true;
    setSummary(results);
    void finish();
  }, [results, finish, navigate, deckId]);

  const reviewAgain = useCallback(() => {
    void begin();
  }, [begin]);

  // Global shortcuts: Space/Enter reveals, 1–4 rates. Skipped when the
  // arc-card already handled the key (it preventDefaults), when a modal is
  // open, or when focus sits in a text/interactive control.
  useEffect(() => {
    if (status !== 'active') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (useAppStore.getState().activeModal !== null) return;
      if (isTextEntry(event.target)) return;

      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        if (isActivatable(event.target)) return;
        event.preventDefault();
        reveal();
        return;
      }
      if (revealed) {
        const rating = KEY_TO_RATING[event.key];
        if (rating === undefined) return;
        event.preventDefault();
        void safeRate(rating);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [status, revealed, reveal, safeRate]);

  // --- Render ---------------------------------------------------------------

  if (summary !== null) {
    // Empty snapshot only happens if the queue emptied between preflight and
    // start (e.g. another tab reviewed the cards) — same as "caught up".
    if (summary.length === 0) return <CaughtUp deckId={deckId} />;
    return <SessionSummary results={summary} deckId={deckId} onReviewAgain={reviewAgain} />;
  }

  if (gate === 'empty') return <CaughtUp deckId={deckId} />;

  if (gate === 'failed' || status === 'error') {
    return (
      <ErrorState
        message={gateError ?? error}
        deckId={deckId}
        onRetry={() => void begin()}
      />
    );
  }

  // Transient frame between exhaustion and the auto-finish effect.
  if (status === 'complete') {
    if (results.length === 0) return <CaughtUp deckId={deckId} />;
    return <SessionSummary results={results} deckId={deckId} onReviewAgain={reviewAgain} />;
  }

  if (status === 'active' && currentCard !== null) {
    return (
      <div className={styles['screen']}>
        <ReviewTopBar reviewedCount={reviewedCount} total={queueLength} onEnd={endEarly} />
        <CardStage
          card={currentCard}
          revealed={revealed}
          onReveal={reveal}
          onRate={handleCardRate}
        />
        <KeyHints revealed={revealed} />
      </div>
    );
  }

  // 'checking' gate, 'loading', and the pre-effect 'idle' frame.
  return <Loading />;
}

function Loading() {
  return (
    <div className={styles['status']} role="status" aria-label="Preparing review session">
      <div className={styles['spinner']} aria-hidden="true" />
    </div>
  );
}

function CaughtUp({ deckId }: { deckId: string }) {
  return (
    <div className={styles['status']}>
      <p className={styles['celebrate']} aria-hidden="true">
        🎉
      </p>
      <h1 className={styles['statusTitle']}>All caught up</h1>
      <p className={styles['statusBody']}>No cards are due for review in this deck right now.</p>
      <div className={styles['statusActions']}>
        <Link className={styles['statusLink']} to={`/decks/${deckId}`}>
          Back to deck
        </Link>
        <Link className={styles['statusLinkQuiet']} to="/">
          Home
        </Link>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  deckId,
  onRetry,
}: {
  message: string | null;
  deckId: string;
  onRetry(): void;
}) {
  return (
    <div className={styles['status']} role="alert">
      <h1 className={styles['statusTitle']}>Couldn&rsquo;t run the review session</h1>
      <p className={styles['statusBody']}>{message ?? 'Something went wrong.'}</p>
      <div className={styles['statusActions']}>
        <button type="button" className={styles['statusLink']} onClick={onRetry}>
          Try again
        </button>
        <Link className={styles['statusLinkQuiet']} to={`/decks/${deckId}`}>
          Back to deck
        </Link>
      </div>
    </div>
  );
}
