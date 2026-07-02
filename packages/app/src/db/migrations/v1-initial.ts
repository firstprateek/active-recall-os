/**
 * v1 — initial schema (cards, decks, sessions).
 *
 * Dexie handles structural creation declaratively in schema.ts; this file
 * documents intent per the migration strategy in ARCHITECTURE.md. Future
 * versions that transform data get an `upgrade()` call and their own file.
 */
export const V1_TABLES = ['cards', 'decks', 'sessions'] as const;
