/**
 * DeckGrid — 'Your decks' overview: one arc-deck-badge per deck plus a
 * dashed 'New deck' tile. Navigation/modal wiring is injected by the page.
 */

import type { DeckWithStats } from '@/types/domain';
import { ArcDeckBadge } from '@/lib/wrappers';
import styles from './DeckGrid.module.css';

interface DeckGridProps {
  decks: DeckWithStats[];
  onDeckClick(deckId: string): void;
  onNewDeck(): void;
}

export function DeckGrid({ decks, onDeckClick, onNewDeck }: DeckGridProps) {
  return (
    <div className={styles['grid']}>
      {decks.map((deck) => (
        <ArcDeckBadge
          key={deck.id}
          deckId={deck.id}
          name={deck.name}
          dueCount={deck.dueCount}
          newCount={deck.newCount}
          color={deck.color}
          onArcDeckClick={(event) => onDeckClick(event.detail.deckId)}
        />
      ))}
      <button
        type="button"
        className={styles['newTile']}
        onClick={onNewDeck}
        aria-label="Create a new deck"
      >
        <span className={styles['plus']} aria-hidden="true">
          +
        </span>
        New deck
      </button>
    </div>
  );
}
