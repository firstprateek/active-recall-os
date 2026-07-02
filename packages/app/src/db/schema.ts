/**
 * Dexie database schema. Version history lives in src/db/migrations/.
 * No React, no Zustand — data layer only.
 */

import Dexie, { type Table } from 'dexie';
import type { Card, Deck, ReviewSession } from '@/types/domain';

export class ActiveRecallDB extends Dexie {
  cards!: Table<Card, string>;
  decks!: Table<Deck, string>;
  sessions!: Table<ReviewSession, string>;

  constructor() {
    super('ActiveRecallOS');
    // v1 — initial schema.
    // '&id' = unique primary key (we supply crypto.randomUUID()).
    // '[state.status+state.nextReview]' = compound index for the core query:
    //   "all review-queue cards with nextReview <= now" without a table scan.
    //   'new' cards lack state.nextReview and are intentionally absent from
    //   this index — they're fetched via the state.status index instead.
    this.version(1).stores({
      cards: '&id, deckId, state.status, [deckId+state.status], [state.status+state.nextReview], createdAt',
      decks: '&id, name, createdAt',
      sessions: '&id, deckId, startedAt, completedAt',
    });
  }
}

/** Singleton DB instance for the app. Tests construct their own. */
export const db = new ActiveRecallDB();
