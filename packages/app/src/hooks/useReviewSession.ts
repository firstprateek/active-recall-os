/**
 * useReviewSession — React-facing wrapper over the session slice.
 * Owns per-view concerns the store shouldn't know about: the loading/error
 * phase, front/back reveal, and the shownAt timestamp used to measure
 * responseTimeMs. Reports 'complete' when the queue is exhausted, but the
 * session is only persisted as completed when finish() is called.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, Rating, ReviewResult } from '@/types/domain';
import { useAppStore } from '@/stores';

type ReviewStatus = 'idle' | 'loading' | 'active' | 'complete' | 'error';

export function useReviewSession(deckId: string): {
  status: ReviewStatus;
  error: string | null;
  currentCard: Card | null;
  queueLength: number;
  reviewedCount: number;
  results: ReviewResult[];
  revealed: boolean;
  start(): Promise<void>;
  reveal(): void;
  rate(rating: Rating): Promise<void>;
  finish(): Promise<void>;
} {
  const queue = useAppStore((s) => s.queue);
  const currentIndex = useAppStore((s) => s.currentIndex);
  const results = useAppStore((s) => s.results);
  const sessionActions = useAppStore((s) => s.sessionActions);

  const [phase, setPhase] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const shownAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Switching decks resets the local machine (the store session, if any,
  // stays untouched — callers abandon/complete explicitly).
  useEffect(() => {
    setPhase('idle');
    setError(null);
    setRevealed(false);
  }, [deckId]);

  // Each advance shows a new card front: hide the back, restart the clock.
  useEffect(() => {
    setRevealed(false);
    shownAtRef.current = Date.now();
  }, [currentIndex]);

  const start = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setRevealed(false);
    const result = await sessionActions.startSession(deckId);
    if (!mountedRef.current) return;
    if (result.ok) {
      shownAtRef.current = Date.now();
      setPhase('active');
    } else {
      setError(result.error.message);
      setPhase('error');
    }
  }, [deckId, sessionActions]);

  const reveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const rate = useCallback(
    async (rating: Rating) => {
      const responseTimeMs = Math.max(0, Date.now() - shownAtRef.current);
      const result = await sessionActions.rateCard(rating, responseTimeMs);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setError(result.error.message);
        setPhase('error');
      }
    },
    [sessionActions],
  );

  const finish = useCallback(async () => {
    const result = await sessionActions.completeSession();
    if (!mountedRef.current) return;
    if (result.ok) {
      setPhase('idle');
      setRevealed(false);
    } else {
      setError(result.error.message);
      setPhase('error');
    }
  }, [sessionActions]);

  const exhausted = currentIndex >= queue.length;
  const status: ReviewStatus = phase === 'active' && exhausted ? 'complete' : phase;
  const currentCard = phase === 'active' && !exhausted ? (queue[currentIndex] ?? null) : null;

  return {
    status,
    error,
    currentCard,
    queueLength: queue.length,
    reviewedCount: results.length,
    results,
    revealed,
    start,
    reveal,
    rate,
    finish,
  };
}
