/**
 * CardStage — the flashcard front-and-center during an active session.
 *
 * Wraps <arc-card> (via the React wrapper) and adds the app-layer concerns
 * the design system must not know about: projected SM-2 intervals per rating
 * and the enter transition between cards. The wrapper div is keyed by card id
 * so each card mounts fresh — no leftover flip animation from the previous one.
 */

import { useCallback, useMemo } from 'react';
import type { ArcCardFlipDetail, ArcCardRateDetail } from '@arc/design-system';
import type { Card, Rating } from '@/types/domain';
import { calculateNextState, getNextReviewDate } from '@/engine/sm2';
import { ArcCard } from '@/lib/wrappers';
import { formatInterval } from '@/features/review/format';
import styles from './CardStage.module.css';

const RATING_ORDER = [1, 2, 3, 4] as const;

const RATING_LABELS: Readonly<Record<Rating, string>> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

interface CardStageProps {
  card: Card;
  revealed: boolean;
  onReveal(): void;
  onRate(rating: Rating): void;
}

export function CardStage({ card, revealed, onReveal, onRate }: CardStageProps) {
  // Projected next-review gap per rating, shown as captions aligned with the
  // rating buttons. calculateNextState is pure, so previewing all four
  // outcomes costs nothing and never touches persistence.
  const projected = useMemo(() => {
    const now = new Date();
    return RATING_ORDER.map((rating) => {
      const next = getNextReviewDate(calculateNextState(card, rating, now));
      return {
        rating,
        label: RATING_LABELS[rating],
        text: next === null ? 'now' : formatInterval(next.getTime() - now.getTime()),
      };
    });
  }, [card]);

  const handleFlip = useCallback(
    (event: CustomEvent<ArcCardFlipDetail>) => {
      // Only the front → back flip reveals; flipping back to peek at the
      // front never un-reveals a card.
      if (event.detail.side === 'back') onReveal();
    },
    [onReveal],
  );

  const handleRate = useCallback(
    (event: CustomEvent<ArcCardRateDetail>) => {
      onRate(event.detail.rating);
    },
    [onRate],
  );

  return (
    <div className={styles['stage']}>
      <div key={card.id} className={styles['enter']}>
        <ArcCard
          front={card.front}
          back={card.back}
          flipped={revealed}
          showRating={revealed}
          variant={card.state.status === 'new' ? 'new' : 'due'}
          onArcCardFlip={handleFlip}
          onArcCardRate={handleRate}
        />
        {revealed ? (
          <div
            className={styles['intervals']}
            role="note"
            aria-label={`Next review if rated: ${projected
              .map((p) => `${p.label} ${p.text}`)
              .join(', ')}`}
          >
            {projected.map((p) => (
              <span key={p.rating} className={styles['interval']} aria-hidden="true">
                {p.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
