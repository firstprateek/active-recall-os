/**
 * Dashboard data hooks — repository-backed local state (per-view data, not
 * global store state), invalidated by cross-tab sync messages. Same pattern
 * as useCardsByDeck: an epoch counter discards in-flight results after
 * unmount so stale data never lands.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, ReviewSession } from '@/types/domain';
import type { Result } from '@/types/result';
import { cardRepository } from '@/repositories/card.repository';
import { sessionRepository } from '@/repositories/session.repository';
import { syncBus, type SyncMessageType } from '@/lib/sync/broadcast';

interface RepositoryQuery<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

function useRepositoryQuery<T>(
  load: () => Promise<Result<T[]>>,
  invalidateOn: readonly SyncMessageType[],
): RepositoryQuery<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const epochRef = useRef(0);

  const refresh = useCallback(async () => {
    const epoch = epochRef.current;
    const result = await load();
    if (epoch !== epochRef.current) return; // unmounted — drop the result
    if (result.ok) {
      setItems(result.value);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }, [load]);

  useEffect(() => {
    const epoch = epochRef.current;
    void refresh().then(() => {
      if (epoch === epochRef.current) setLoading(false);
    });

    const unsubscribe = syncBus.subscribe((message) => {
      if (invalidateOn.includes(message.type)) void refresh();
    });
    return () => {
      epochRef.current += 1;
      unsubscribe();
    };
  }, [refresh, invalidateOn]);

  return { items, loading, error, refresh };
}

/*
 * Module-level constants keep the effect dependencies referentially stable
 * (a literal array per render would tear down and recreate the subscription
 * every render). Sessions also react to 'card:updated' — each rating appends
 * a result mid-session — and both react to 'deck:updated' because deleting
 * a deck cascades to its cards and sessions.
 */
const SESSION_EVENTS: readonly SyncMessageType[] = [
  'session:completed',
  'card:updated',
  'deck:updated',
];
const CARD_EVENTS: readonly SyncMessageType[] = ['card:updated', 'deck:updated'];

const loadSessions = (): Promise<Result<ReviewSession[]>> => sessionRepository.getAll();
const loadCards = (): Promise<Result<Card[]>> => cardRepository.getAll();

export function useAllSessions(): {
  sessions: ReviewSession[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
} {
  const { items, loading, error, refresh } = useRepositoryQuery(loadSessions, SESSION_EVENTS);
  return { sessions: items, loading, error, refresh };
}

export function useAllCards(): {
  cards: Card[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
} {
  const { items, loading, error, refresh } = useRepositoryQuery(loadCards, CARD_EVENTS);
  return { cards: items, loading, error, refresh };
}
