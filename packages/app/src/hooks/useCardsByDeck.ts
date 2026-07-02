/**
 * useCardsByDeck — repository-backed card list for one deck.
 * Local state (not the store): card lists are per-view data, re-queried on
 * cross-tab 'card:updated' messages. An epoch counter invalidates in-flight
 * loads on unmount or deck change so stale results never land.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '@/types/domain';
import { cardRepository } from '@/repositories/card.repository';
import { syncBus } from '@/lib/sync/broadcast';

export function useCardsByDeck(deckId: string): {
  cards: Card[];
  loading: boolean;
  refresh(): Promise<void>;
} {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const epochRef = useRef(0);

  const refresh = useCallback(async () => {
    const epoch = epochRef.current;
    const result = await cardRepository.getByDeck(deckId);
    if (epoch !== epochRef.current) return; // stale: deck changed or unmounted
    if (result.ok) {
      setCards(result.value);
    } else {
      console.error('useCardsByDeck: loading cards failed:', result.error);
    }
  }, [deckId]);

  useEffect(() => {
    const epoch = epochRef.current;
    setCards([]);
    setLoading(true);
    void refresh().then(() => {
      if (epoch === epochRef.current) setLoading(false);
    });

    const unsubscribe = syncBus.subscribe((message) => {
      if (message.type === 'card:updated') void refresh();
    });
    return () => {
      epochRef.current += 1; // invalidate any in-flight load
      unsubscribe();
    };
  }, [refresh]);

  return { cards, loading, refresh };
}
