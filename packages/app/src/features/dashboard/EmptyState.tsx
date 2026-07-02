/**
 * EmptyState — first-run hero shown when there are no decks: create one
 * from scratch (deck-editor modal) or seed the sample deck.
 */

import { useState } from 'react';
import { useAppStore } from '@/stores';
import { createSampleDeck } from '@/lib/seed';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  /** Called after the sample deck lands so the page can re-query everything. */
  onSeeded(): Promise<void>;
}

export function EmptyState({ onSeeded }: EmptyStateProps) {
  const openModal = useAppStore((s) => s.uiActions.openModal);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSample = async () => {
    setSeeding(true);
    setError(null);
    const result = await createSampleDeck();
    if (result.ok) {
      await onSeeded();
    } else {
      setError(result.error.message);
    }
    setSeeding(false);
  };

  return (
    <section className={styles['hero']} aria-label="Get started">
      <h1 className={styles['title']}>Capture what you learn. Never lose it.</h1>
      <p className={styles['subtitle']}>
        Create decks for the concepts you want to keep, review them on an SM-2
        schedule, and watch your retention climb.
      </p>
      <div className={styles['actions']}>
        <button
          type="button"
          className={styles['primary']}
          onClick={() => openModal({ kind: 'deck-editor' })}
          disabled={seeding}
        >
          Create your first deck
        </button>
        <button
          type="button"
          className={styles['secondary']}
          onClick={() => void loadSample()}
          disabled={seeding}
        >
          {seeding ? 'Loading sample…' : 'Load sample deck'}
        </button>
      </div>
      {error !== null && (
        <p className={styles['error']} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
