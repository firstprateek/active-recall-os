/**
 * Canonical domain types for Active Recall OS.
 * These mirror CLAUDE.md exactly — the types ARE the spec.
 */

// Card states — discriminated union (not an enum).
// The compiler enforces valid property access per branch: you cannot read
// `interval` on a 'learning' card because that branch doesn't carry it.
export type CardState =
  | { status: 'new' }
  | { status: 'learning'; step: number; nextReview: Date }
  | { status: 'review'; interval: number; easeFactor: number; nextReview: Date }
  | { status: 'relearning'; step: number; easeFactor: number; interval: number; nextReview: Date };

export type CardStatus = CardState['status'];

/** SM-2 grades: 1 Again | 2 Hard | 3 Good | 4 Easy */
export type Rating = 1 | 2 | 3 | 4;

export interface Card {
  id: string; // crypto.randomUUID()
  deckId: string;
  front: string; // supports markdown
  back: string; // supports markdown
  tags: string[];
  state: CardState;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  color: string; // design token key, e.g. 'deck-blue'
  createdAt: Date;
  updatedAt: Date;
  cardCount: number; // denormalized, updated on card mutations
}

/** Deck plus query-time computed fields — never stored. */
export interface DeckWithStats extends Deck {
  dueCount: number;
  newCount: number;
}

export interface ReviewResult {
  cardId: string;
  rating: Rating;
  responseTimeMs: number;
  stateBefore: CardState;
  stateAfter: CardState;
  reviewedAt: Date;
}

export interface ReviewSession {
  id: string;
  deckId: string;
  startedAt: Date;
  completedAt: Date | null;
  cardsReviewed: ReviewResult[];
}

/** Mapped creation inputs — server-assigned fields omitted. */
export type CreateDeckInput = Pick<Deck, 'name' | 'description' | 'color'>;
export type CreateCardInput = Pick<Card, 'deckId' | 'front' | 'back'> & {
  tags?: string[];
};
export type UpdateCardInput = Partial<Pick<Card, 'front' | 'back' | 'tags' | 'deckId'>>;
export type UpdateDeckInput = Partial<Pick<Deck, 'name' | 'description' | 'color'>>;

/** Deck color token keys available in the design system. */
export const DECK_COLORS = [
  'deck-blue',
  'deck-emerald',
  'deck-amber',
  'deck-rose',
  'deck-violet',
  'deck-cyan',
] as const;
export type DeckColor = (typeof DECK_COLORS)[number];
