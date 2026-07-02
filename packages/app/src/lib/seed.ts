/**
 * Sample content seeding — gives a first-run user something real to study.
 * App-layer lib: all persistence flows through the repositories, and a sync
 * message is published at the end so other tabs re-query.
 */

import type { Deck } from '@/types/domain';
import { ok, type Result } from '@/types/result';
import { deckRepository } from '@/repositories/deck.repository';
import { cardRepository } from '@/repositories/card.repository';
import { syncBus } from '@/lib/sync/broadcast';

interface SampleCard {
  front: string;
  back: string;
  tags: string[];
}

const SAMPLE_CARDS: readonly SampleCard[] = [
  {
    front: 'What is a **discriminated union**, and which property makes it work?',
    back:
      'A union of object types sharing a literal *discriminant* property (e.g. `kind`). ' +
      'Checking the discriminant — `if (shape.kind === "circle")` — narrows the union to ' +
      'one branch, enabling exhaustive, type-safe `switch` handling without casts.',
    tags: ['unions', 'narrowing'],
  },
  {
    front: 'What does a **mapped type** like `{ [K in keyof T]: T[K] | null }` produce?',
    back:
      'A new object type built by iterating the keys of `T` and transforming each property ' +
      'type. Modifiers can be added or removed (`readonly`, `?`, `-readonly`, `-?`), and ' +
      '`as` re-maps keys — the mechanism behind `Partial`, `Readonly`, and `Pick`.',
    tags: ['mapped-types'],
  },
  {
    front: 'How does `satisfies T` differ from a type annotation `: T`?',
    back:
      '`satisfies` checks assignability to `T` but keeps the value\'s *inferred* type instead ' +
      'of replacing it with `T`. You keep exact keys and per-property types (e.g. a tuple ' +
      'stays a tuple) while still validating the overall shape at the declaration site.',
    tags: ['satisfies', 'inference'],
  },
  {
    front: 'Why are function **parameters contravariant**? What would break if they were covariant?',
    back:
      'A function handling a *broader* input can substitute for one handling a narrower ' +
      'input — never the reverse. If `(d: Dog) => void` could stand in for `(a: Animal) => void`, ' +
      'a caller passing a `Cat` would reach code assuming `Dog`. `strictFunctionTypes` enforces ' +
      'this (method shorthand stays bivariant for pragmatism).',
    tags: ['variance', 'functions'],
  },
  {
    front: 'What does `infer` do in a conditional type? Show how to unwrap a `Promise`.',
    back:
      '`infer` declares a type variable bound from the position it matches: ' +
      '`type Unwrap<T> = T extends Promise<infer U> ? U : T` binds `U` to the resolved type. ' +
      'It lets conditional types *extract* structure instead of just testing it.',
    tags: ['conditional-types', 'infer'],
  },
  {
    front: 'What can **template literal types** express? Example: `` `on${Capitalize<K>}` ``',
    back:
      'String types assembled from literals and unions — the compiler distributes over each ' +
      'union member. Great for derived event-handler names, dotted object paths, and CSS ' +
      'units; combined with `infer` they can even parse strings at the type level.',
    tags: ['template-literals'],
  },
  {
    front: 'What three things does `as const` change about an inferred type?',
    back:
      '1) Literals stay literal types (no widening), 2) properties become `readonly`, ' +
      '3) arrays become readonly tuples. Ideal for token lists: ' +
      '`const COLORS = ["red", "blue"] as const; type Color = (typeof COLORS)[number]`.',
    tags: ['const-assertions', 'inference'],
  },
  {
    front: 'What is a **type predicate**, and when do you need one?',
    back:
      'A boolean function whose return type is `arg is T`: ' +
      '`function isCard(x: unknown): x is Card`. A `true` result narrows the argument to `T` ' +
      'at the call site — required when narrowing logic lives in a helper, because TS does ' +
      'not propagate narrowing across function boundaries automatically.',
    tags: ['narrowing', 'type-guards'],
  },
  {
    front: '`unknown` vs `any` — what is the practical difference?',
    back:
      'Both accept every value. `any` disables checking at every *use site* and silently ' +
      'infects everything it touches; `unknown` forbids all operations until you narrow it ' +
      '(`typeof`, `instanceof`, a predicate). `unknown` is the type-safe top type — prefer it ' +
      'at every untrusted boundary.',
    tags: ['unknown', 'safety'],
  },
  {
    front: 'How do you get compile-time **exhaustiveness checking** on a discriminated union `switch`?',
    back:
      'In the `default` branch, assign the value to `never`: ' +
      '`default: { const _exhaustive: never = state; throw new Error(...); }`. ' +
      'Adding a new union member makes that assignment fail to compile, pointing straight at ' +
      'the unhandled case.',
    tags: ['never', 'unions'],
  },
  {
    front: 'When do conditional types **distribute** over unions, and how do you stop it?',
    back:
      'Distribution happens when the checked type is a *naked* type parameter: ' +
      '`T extends U ? X : Y` applied to `A | B` evaluates per member. Wrap both sides in a ' +
      'one-tuple — `[T] extends [U] ? X : Y` — to treat the union as a single type.',
    tags: ['conditional-types', 'unions'],
  },
  {
    front: 'What is a **branded (nominal) type** in structural TypeScript, and why use one?',
    back:
      'An intersection with a phantom marker: `type UserId = string & { readonly __brand: "UserId" }`. ' +
      'It is structurally unique, so a plain `string` (or a `PostId`) is no longer assignable — ' +
      'preventing mixed-up ids and units that share a runtime representation. Construct it in ' +
      'one factory function with a single documented cast.',
    tags: ['branded-types', 'safety'],
  },
];

/**
 * Creates the 'TypeScript Patterns' sample deck with its cards.
 * Stops (and returns the error) on the first failure — a partially seeded
 * deck is still a valid deck, just smaller.
 */
export async function createSampleDeck(): Promise<Result<Deck>> {
  const deckResult = await deckRepository.create({
    name: 'TypeScript Patterns',
    description: 'Advanced TypeScript idioms worth keeping in working memory.',
    color: 'deck-blue',
  });
  if (!deckResult.ok) return deckResult;
  const deck = deckResult.value;

  for (const { front, back, tags } of SAMPLE_CARDS) {
    const cardResult = await cardRepository.create({ deckId: deck.id, front, back, tags });
    if (!cardResult.ok) return cardResult;
  }

  syncBus.publish('deck:updated', deck.id);
  return ok(deck);
}
