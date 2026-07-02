/**
 * Deck slice — deck list with stats + CRUD actions.
 * All persistence flows through deckRepository; local state updates
 * optimistically from returned values; every mutation broadcasts
 * 'deck:updated' so other tabs re-query Dexie.
 */

import type { StateCreator } from 'zustand';
import type {
  CreateDeckInput,
  Deck,
  DeckWithStats,
  UpdateDeckInput,
} from '@/types/domain';
import type { Result } from '@/types/result';
import { deckRepository } from '@/repositories/deck.repository';
import { syncBus } from '@/lib/sync/broadcast';
import type { AppStore } from '@/stores';

export interface DeckSlice {
  decks: DeckWithStats[];
  decksLoaded: boolean;
  deckActions: {
    loadDecks(): Promise<void>;
    createDeck(input: CreateDeckInput): Promise<Result<Deck>>;
    updateDeck(id: string, input: UpdateDeckInput): Promise<Result<Deck>>;
    deleteDeck(id: string): Promise<Result<void>>;
  };
}

export const createDeckSlice: StateCreator<AppStore, [], [], DeckSlice> = (set, get) => ({
  decks: [],
  decksLoaded: false,
  deckActions: {
    async loadDecks() {
      const result = await deckRepository.getAllWithStats();
      if (result.ok) {
        set({ decks: result.value, decksLoaded: true });
      } else {
        // loadDecks returns void, so the Result error channel isn't available
        // here — log rather than swallow; the UI keeps its previous list.
        console.error('loadDecks failed:', result.error);
      }
    },

    async createDeck(input) {
      const result = await deckRepository.create(input);
      if (result.ok) {
        // A brand-new deck has no cards, so its stats are known without a re-query.
        const created: DeckWithStats = { ...result.value, dueCount: 0, newCount: 0 };
        set({ decks: [...get().decks, created] });
        syncBus.publish('deck:updated', result.value.id);
      }
      return result;
    },

    async updateDeck(id, input) {
      const result = await deckRepository.update(id, input);
      if (result.ok) {
        const updated = result.value;
        set({
          decks: get().decks.map((deck) =>
            deck.id === id
              ? // Metadata edits never change card scheduling — keep existing stats.
                { ...updated, dueCount: deck.dueCount, newCount: deck.newCount }
              : deck,
          ),
        });
        syncBus.publish('deck:updated', id);
      }
      return result;
    },

    async deleteDeck(id) {
      const result = await deckRepository.delete(id);
      if (result.ok) {
        set({ decks: get().decks.filter((deck) => deck.id !== id) });
        syncBus.publish('deck:updated', id);
      }
      return result;
    },
  },
});
