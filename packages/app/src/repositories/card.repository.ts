/**
 * CardRepository — all card persistence flows through here.
 * Data layer: no React, no Zustand. Returns Result<T, AppError>, never throws.
 *
 * Deck.cardCount is denormalized; every card mutation that changes membership
 * updates it inside the same transaction.
 */

import type { ActiveRecallDB } from '@/db/schema';
import { db as defaultDb } from '@/db/schema';
import type {
  Card,
  CardState,
  CreateCardInput,
  UpdateCardInput,
} from '@/types/domain';
import { err, ok, tryStorage, type Result } from '@/types/result';
import { isDue } from '@/engine/sm2';

export class CardRepository {
  constructor(private readonly db: ActiveRecallDB = defaultDb) {}

  async create(input: CreateCardInput, now: Date = new Date()): Promise<Result<Card>> {
    const front = input.front.trim();
    if (front.length === 0) return err('VALIDATION', 'Card front cannot be empty');

    const card: Card = {
      id: crypto.randomUUID(),
      deckId: input.deckId,
      front,
      back: input.back.trim(),
      tags: normalizeTags(input.tags ?? []),
      state: { status: 'new' },
      createdAt: now,
      updatedAt: now,
    };

    return this.db
      .transaction('rw', [this.db.cards, this.db.decks], async () => {
        const deck = await this.db.decks.get(input.deckId);
        if (deck === undefined) return err('NOT_FOUND', `Deck ${input.deckId} not found`);
        await this.db.cards.add(card);
        await this.db.decks.put({ ...deck, cardCount: deck.cardCount + 1, updatedAt: now });
        return ok(card);
      })
      .catch((cause: unknown) => err('STORAGE', 'create card failed', cause));
  }

  async getById(id: string): Promise<Result<Card>> {
    const found = await tryStorage(() => this.db.cards.get(id), 'get card');
    if (!found.ok) return found;
    if (found.value === undefined) return err('NOT_FOUND', `Card ${id} not found`);
    return ok(found.value);
  }

  async getByDeck(deckId: string): Promise<Result<Card[]>> {
    return tryStorage(
      () => this.db.cards.where('deckId').equals(deckId).sortBy('createdAt'),
      'list cards by deck',
    );
  }

  async getAll(): Promise<Result<Card[]>> {
    return tryStorage(() => this.db.cards.toArray(), 'list all cards');
  }

  /**
   * The review queue for a deck: due learning/review/relearning cards first
   * (most overdue first), then new cards (oldest first, capped).
   */
  async getReviewQueue(
    deckId: string,
    opts: { now?: Date; newCardLimit?: number } = {},
  ): Promise<Result<Card[]>> {
    const now = opts.now ?? new Date();
    const newCardLimit = opts.newCardLimit ?? 20;
    return tryStorage(async () => {
      const cards = await this.db.cards.where('deckId').equals(deckId).toArray();
      const due = cards
        .filter((c) => c.state.status !== 'new' && isDue(c, now))
        .sort((a, b) => nextReviewTime(a.state) - nextReviewTime(b.state));
      const fresh = cards
        .filter((c) => c.state.status === 'new')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, newCardLimit);
      return [...due, ...fresh];
    }, 'build review queue');
  }

  async update(id: string, input: UpdateCardInput, now: Date = new Date()): Promise<Result<Card>> {
    if (input.front !== undefined && input.front.trim().length === 0) {
      return err('VALIDATION', 'Card front cannot be empty');
    }
    return this.db
      .transaction('rw', [this.db.cards, this.db.decks], async () => {
        const existing = await this.db.cards.get(id);
        if (existing === undefined) return err('NOT_FOUND', `Card ${id} not found`);

        // Moving a card between decks adjusts both denormalized counts.
        if (input.deckId !== undefined && input.deckId !== existing.deckId) {
          const [from, to] = await Promise.all([
            this.db.decks.get(existing.deckId),
            this.db.decks.get(input.deckId),
          ]);
          if (to === undefined) return err('NOT_FOUND', `Deck ${input.deckId} not found`);
          if (from !== undefined) {
            await this.db.decks.put({ ...from, cardCount: Math.max(0, from.cardCount - 1), updatedAt: now });
          }
          await this.db.decks.put({ ...to, cardCount: to.cardCount + 1, updatedAt: now });
        }

        const updated: Card = {
          ...existing,
          ...(input.front !== undefined ? { front: input.front.trim() } : {}),
          ...(input.back !== undefined ? { back: input.back.trim() } : {}),
          ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
          ...(input.deckId !== undefined ? { deckId: input.deckId } : {}),
          updatedAt: now,
        };
        await this.db.cards.put(updated);
        return ok(updated);
      })
      .catch((cause: unknown) => err('STORAGE', 'update card failed', cause));
  }

  /** Persist a new scheduling state (called by the session store after rating). */
  async updateState(id: string, state: CardState, now: Date = new Date()): Promise<Result<Card>> {
    return this.db
      .transaction('rw', this.db.cards, async () => {
        const existing = await this.db.cards.get(id);
        if (existing === undefined) return err('NOT_FOUND', `Card ${id} not found`);
        const updated: Card = { ...existing, state, updatedAt: now };
        await this.db.cards.put(updated);
        return ok(updated);
      })
      .catch((cause: unknown) => err('STORAGE', 'update card state failed', cause));
  }

  async delete(id: string, now: Date = new Date()): Promise<Result<void>> {
    return this.db
      .transaction('rw', [this.db.cards, this.db.decks], async () => {
        const existing = await this.db.cards.get(id);
        if (existing === undefined) return err('NOT_FOUND', `Card ${id} not found`);
        await this.db.cards.delete(id);
        const deck = await this.db.decks.get(existing.deckId);
        if (deck !== undefined) {
          await this.db.decks.put({ ...deck, cardCount: Math.max(0, deck.cardCount - 1), updatedAt: now });
        }
        return ok(undefined);
      })
      .catch((cause: unknown) => err('STORAGE', 'delete card failed', cause));
  }
}

function nextReviewTime(state: CardState): number {
  return state.status === 'new' ? 0 : state.nextReview.getTime();
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))];
}

export const cardRepository = new CardRepository();
