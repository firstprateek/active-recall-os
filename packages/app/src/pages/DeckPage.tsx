/**
 * DeckPage — a deck's home and its quick-capture surface.
 *
 * Header: deck identity + edit/delete + "Study N due" CTA + Add card
 * (keyboard shortcut: C). Below: a searchable card list — debounced
 * filtering over front/back/tags, virtualized via @tanstack/react-virtual
 * once it grows past 50 rows (fixed row height keeps measurement free).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Card } from '@/types/domain';
import { isDue } from '@/engine/sm2';
import { useAppStore } from '@/stores';
import { useCardsByDeck, useDecks } from '@/hooks';
import { ArcTag } from '@/lib/wrappers';
import { ModalHost } from '@/features/editor/ModalHost';
import styles from './DeckPage.module.css';

const SEARCH_DEBOUNCE_MS = 150;
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) — must match .row height in DeckPage.module.css. */
const ROW_HEIGHT = 76;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** 'in 3d' style humanization for a future review date. */
function formatUntil(date: Date, now: Date): string {
  const ms = Math.max(0, date.getTime() - now.getTime());
  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(ms / DAY_MS);
  if (days < 30) return `in ${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `in ${months}mo`;
  return `in ${Math.round(months / 12)}y`;
}

type ChipTone = 'chipNew' | 'chipLearning' | 'chipDue' | 'chipScheduled';

function describeState(card: Card, now: Date): { label: string; tone: ChipTone } {
  switch (card.state.status) {
    case 'new':
      return { label: 'New', tone: 'chipNew' };
    case 'learning':
    case 'relearning':
      return { label: 'Learning', tone: 'chipLearning' };
    case 'review':
      return isDue(card, now)
        ? { label: 'Due', tone: 'chipDue' }
        : { label: formatUntil(card.state.nextReview, now), tone: 'chipScheduled' };
  }
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CardRow({
  card,
  now,
  onEdit,
  onDelete,
}: {
  card: Card;
  now: Date;
  onEdit(): void;
  onDelete(): void;
}) {
  const chip = describeState(card, now);
  const front = oneLine(card.front);
  const shortFront = truncate(front, 60);

  return (
    <div className={styles['row']}>
      <button
        type="button"
        className={styles['rowMain']}
        onClick={onEdit}
        aria-label={`Edit card: ${shortFront}`}
      >
        <span className={styles['rowFront']}>{front}</span>
        <span className={styles['rowMeta']}>
          <span className={`${styles['chip']} ${styles[chip.tone]}`}>{chip.label}</span>
          {card.tags.map((tag) => (
            <ArcTag key={tag} label={tag} />
          ))}
        </span>
      </button>
      <button
        type="button"
        className={styles['rowDelete']}
        onClick={onDelete}
        aria-label={`Delete card: ${shortFront}`}
        title="Delete card"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading deck">
      <div className={styles['skeletonTitle']} />
      <div className={styles['skeletonLine']} />
      <ListSkeleton />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={styles['list']} aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className={styles['skeletonRow']}>
          <span
            className={styles['skeletonBar']}
            style={{ width: `${45 + ((index * 17) % 40)}%` }}
          />
          <span className={styles['skeletonChip']} />
        </div>
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className={styles['notFound']}>
      <h1 className={styles['notFoundTitle']}>Deck not found</h1>
      <p className={styles['notFoundText']}>
        This deck doesn&rsquo;t exist — it may have been deleted, or the link is stale.
      </p>
      <Link to="/" className={styles['notFoundLink']}>
        Back to dashboard
      </Link>
    </div>
  );
}

export default function DeckPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId ?? '';
  const navigate = useNavigate();
  const { decks, loaded } = useDecks();
  const { cards, loading, refresh } = useCardsByDeck(deckId);
  const openModal = useAppStore((s) => s.uiActions.openModal);

  const deck = useMemo(() => decks.find((d) => d.id === deckId), [decks, deckId]);
  const deckExists = deck !== undefined;

  // Debounced search over front/back/tags.
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setNeedle(query.trim().toLowerCase()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    if (needle === '') return cards;
    return cards.filter(
      (card) =>
        card.front.toLowerCase().includes(needle) ||
        card.back.toLowerCase().includes(needle) ||
        card.tags.some((tag) => tag.includes(needle)),
    );
  }, [cards, needle]);

  // Live due/new counts from the freshest card list (not the deck slice,
  // which only re-queries on cross-tab messages). Computed like useDeckStats;
  // sharing that hook would spawn a second query this page can't refresh.
  const stats = useMemo(() => {
    const now = new Date();
    let due = 0;
    let fresh = 0;
    for (const card of cards) {
      if (card.state.status === 'new') fresh += 1;
      else if (isDue(card, now)) due += 1;
    }
    return { due, fresh };
  }, [cards]);

  const openCardEditor = useCallback(
    (cardId?: string) => {
      openModal({ kind: 'card-editor', deckId, ...(cardId !== undefined ? { cardId } : {}) });
    },
    [openModal, deckId],
  );

  const requestCardDelete = useCallback(
    (card: Card) => {
      openModal({
        kind: 'confirm-delete',
        entity: 'card',
        id: card.id,
        name: truncate(oneLine(card.front), 60),
      });
    },
    [openModal],
  );

  // Quick-capture shortcut: press C anywhere (outside inputs/modals) to add a card.
  useEffect(() => {
    if (!deckExists) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'c' && event.key !== 'C') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (useAppStore.getState().activeModal !== null) return;
      event.preventDefault();
      openModal({ kind: 'card-editor', deckId });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deckExists, deckId, openModal]);

  // Virtualize only past the threshold; count 0 keeps the hook inert below it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtualize ? filtered.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Modals broadcast to other tabs only — this refreshes OUR card list.
  const handleDataChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  const now = new Date();

  const study =
    stats.due > 0
      ? { label: `Study ${stats.due} due`, disabled: false }
      : stats.fresh > 0
        ? { label: `Study ${stats.fresh} new`, disabled: false }
        : { label: 'Nothing due 🎉', disabled: true };

  let content;
  if (!loaded) {
    content = <PageSkeleton />;
  } else if (deck === undefined) {
    content = <NotFound />;
  } else {
    content = (
      <>
        <header className={styles['header']}>
          <div className={styles['titleRow']}>
            <span
              className={styles['deckDot']}
              style={{ backgroundColor: `var(--arc-color-${deck.color}, var(--arc-color-accent))` }}
              aria-hidden="true"
            />
            <h1 className={styles['deckName']}>{deck.name}</h1>
            <div className={styles['headerActions']}>
              <button
                type="button"
                className={styles['iconBtn']}
                onClick={() => openModal({ kind: 'deck-editor', deckId })}
                aria-label={`Edit deck ${deck.name}`}
                title="Edit deck"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className={`${styles['iconBtn']} ${styles['iconBtnDanger']}`}
                onClick={() =>
                  openModal({ kind: 'confirm-delete', entity: 'deck', id: deckId, name: deck.name })
                }
                aria-label={`Delete deck ${deck.name}`}
                title="Delete deck"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
          {deck.description !== '' && (
            <p className={styles['description']}>{deck.description}</p>
          )}
          <p className={styles['meta']}>
            {cards.length} {cards.length === 1 ? 'card' : 'cards'} · {stats.due} due ·{' '}
            {stats.fresh} new
          </p>
          <div className={styles['ctaRow']}>
            <button
              type="button"
              className={styles['studyBtn']}
              disabled={study.disabled}
              onClick={() => navigate(`/decks/${deckId}/review`)}
            >
              {study.label}
            </button>
            <button
              type="button"
              className={styles['addBtn']}
              onClick={() => openCardEditor()}
            >
              <span aria-hidden="true">+</span> Add card
              <kbd className={styles['kbd']} aria-hidden="true">
                C
              </kbd>
            </button>
          </div>
        </header>

        <section className={styles['listSection']} aria-label="Cards in this deck">
          {cards.length > 0 && (
            <input
              type="search"
              className={styles['search']}
              placeholder="Search cards…"
              aria-label="Search cards by front, back, or tag"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}

          {loading ? (
            <div role="status" aria-label="Loading cards">
              <ListSkeleton />
            </div>
          ) : cards.length === 0 ? (
            <div className={styles['empty']}>
              <p className={styles['emptyTitle']}>No cards yet</p>
              <p className={styles['emptyText']}>
                Press <kbd className={styles['kbd']}>C</kbd> or Add card to capture your first one.
              </p>
              <button
                type="button"
                className={styles['addBtn']}
                onClick={() => openCardEditor()}
              >
                <span aria-hidden="true">+</span> Add card
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles['empty']}>
              <p className={styles['emptyTitle']}>No matches</p>
              <p className={styles['emptyText']}>No cards match “{query.trim()}”.</p>
            </div>
          ) : virtualize ? (
            <div ref={scrollRef} className={`${styles['list']} ${styles['listVirtual']}`}>
              <div
                className={styles['virtualInner']}
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const card = filtered[item.index];
                  if (card === undefined) return null;
                  return (
                    <div
                      key={card.id}
                      className={styles['virtualRow']}
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <CardRow
                        card={card}
                        now={now}
                        onEdit={() => openCardEditor(card.id)}
                        onDelete={() => requestCardDelete(card)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles['list']}>
              {filtered.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  now={now}
                  onEdit={() => openCardEditor(card.id)}
                  onDelete={() => requestCardDelete(card)}
                />
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <div className={styles['page']}>
      {content}
      <ModalHost onDataChanged={handleDataChanged} />
    </div>
  );
}
