/**
 * useDecks — deck list with stats, backed by the deck slice.
 * Loads once on first mount, then re-queries whenever any tab (including
 * this one via other components) mutates decks, cards, or sessions.
 */

import { useEffect } from 'react';
import type { DeckWithStats } from '@/types/domain';
import { syncBus } from '@/lib/sync/broadcast';
import { useAppStore } from '@/stores';

export function useDecks(): {
  decks: DeckWithStats[];
  loaded: boolean;
  refresh(): Promise<void>;
} {
  const decks = useAppStore((s) => s.decks);
  const loaded = useAppStore((s) => s.decksLoaded);
  const loadDecks = useAppStore((s) => s.deckActions.loadDecks);

  useEffect(() => {
    // getState() avoids re-running the effect as decksLoaded flips.
    if (!useAppStore.getState().decksLoaded) void loadDecks();
  }, [loadDecks]);

  useEffect(
    () =>
      syncBus.subscribe((message) => {
        if (
          message.type === 'deck:updated' ||
          message.type === 'card:updated' ||
          message.type === 'session:completed'
        ) {
          // Card reviews and session completions change due counts — re-query.
          void loadDecks();
        }
      }),
    [loadDecks],
  );

  return { decks, loaded, refresh: loadDecks };
}
