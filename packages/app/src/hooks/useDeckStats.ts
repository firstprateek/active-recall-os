/**
 * useDeckStats — derived card counts for one deck.
 * Derived state is computed (memoized), never stored — per ARCHITECTURE.md.
 */

import { useMemo } from 'react';
import { isDue } from '@/engine/sm2';
import { useCardsByDeck } from '@/hooks/useCardsByDeck';

export function useDeckStats(deckId: string): {
  total: number;
  due: number;
  fresh: number;
  mature: number;
} {
  const { cards } = useCardsByDeck(deckId);

  return useMemo(() => {
    const now = new Date();
    let due = 0;
    let fresh = 0;
    let mature = 0;
    for (const card of cards) {
      if (card.state.status === 'new') {
        fresh += 1;
        continue;
      }
      if (isDue(card, now)) due += 1;
      // Mature = graduated to the long-term review queue
      // (excludes learning/relearning cards still in short steps).
      if (card.state.status === 'review') mature += 1;
    }
    return { total: cards.length, due, fresh, mature };
  }, [cards]);
}
