/**
 * DeckRepository — all deck persistence flows through here.
 * Data layer: no React, no Zustand. Returns Result<T, AppError>, never throws.
 */

import type { ActiveRecallDB } from '@/db/schema';
import { db as defaultDb } from '@/db/schema';
import type {
  CreateDeckInput,
  Deck,
  DeckWithStats,
  UpdateDeckInput,
} from '@/types/domain';
import { err, ok, tryStorage, type Result } from '@/types/result';
import { isDue } from '@/engine/sm2';

export class DeckRepository {
  constructor(private readonly db: ActiveRecallDB = defaultDb) {}

  async create(input: CreateDeckInput, now: Date = new Date()): Promise<Result<Deck>> {
    const name = input.name.trim();
    if (name.length === 0) return err('VALIDATION', 'Deck name cannot be empty');

    const deck: Deck = {
      id: crypto.randomUUID(),
      name,
      description: input.description.trim(),
      color: input.color,
      createdAt: now,
      updatedAt: now,
      cardCount: 0,
    };
    return tryStorage(async () => {
      await this.db.decks.add(deck);
      return deck;
    }, 'create deck');
  }

  async getById(id: string): Promise<Result<Deck>> {
    const found = await tryStorage(() => this.db.decks.get(id), 'get deck');
    if (!found.ok) return found;
    if (found.value === undefined) return err('NOT_FOUND', `Deck ${id} not found`);
    return ok(found.value);
  }

  async getAll(): Promise<Result<Deck[]>> {
    return tryStorage(() => this.db.decks.orderBy('createdAt').toArray(), 'list decks');
  }

  /** Decks with query-time dueCount/newCount — computed, never stored. */
  async getAllWithStats(now: Date = new Date()): Promise<Result<DeckWithStats[]>> {
    return tryStorage(async () => {
      const decks = await this.db.decks.orderBy('createdAt').toArray();
      const withStats: DeckWithStats[] = [];
      for (const deck of decks) {
        const cards = await this.db.cards.where('deckId').equals(deck.id).toArray();
        withStats.push({
          ...deck,
          dueCount: cards.filter((c) => c.state.status !== 'new' && isDue(c, now)).length,
          newCount: cards.filter((c) => c.state.status === 'new').length,
        });
      }
      return withStats;
    }, 'list decks with stats');
  }

  async update(id: string, input: UpdateDeckInput, now: Date = new Date()): Promise<Result<Deck>> {
    if (input.name !== undefined && input.name.trim().length === 0) {
      return err('VALIDATION', 'Deck name cannot be empty');
    }
    return this.db.transaction('rw', this.db.decks, async () => {
      const existing = await this.db.decks.get(id);
      if (existing === undefined) return err('NOT_FOUND', `Deck ${id} not found`);
      const updated: Deck = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: now,
      };
      await this.db.decks.put(updated);
      return ok(updated);
    }).catch((cause: unknown) => err('STORAGE', 'update deck failed', cause));
  }

  /** Deletes the deck AND all its cards + sessions atomically. */
  async delete(id: string): Promise<Result<void>> {
    return this.db
      .transaction('rw', [this.db.decks, this.db.cards, this.db.sessions], async () => {
        const existing = await this.db.decks.get(id);
        if (existing === undefined) return err('NOT_FOUND', `Deck ${id} not found`);
        await this.db.cards.where('deckId').equals(id).delete();
        await this.db.sessions.where('deckId').equals(id).delete();
        await this.db.decks.delete(id);
        return ok(undefined);
      })
      .catch((cause: unknown) => err('STORAGE', 'delete deck failed', cause));
  }
}

export const deckRepository = new DeckRepository();
