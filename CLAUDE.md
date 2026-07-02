# Active Recall OS — Claude Code Project Spec

## What This Project Is

A local-first spaced repetition + knowledge retention system. Users capture concepts
(TypeScript patterns, system design, frontend architecture), the app schedules review
sessions using the SM-2 algorithm, tracks retention over time, and visualizes knowledge
health via dashboards and decay curves.

Built by a senior frontend engineer targeting L5 FAANG interviews. Every architectural
decision is intentional and defensible. This is not a tutorial project.

---

## Stack — Non-Negotiable

| Layer | Technology | Reason |
|---|---|---|
| Build | Vite + TypeScript (strict) | Fast iteration, explicit types everywhere |
| App framework | React 18 | Hooks, concurrent features, interview relevance |
| Design system | Lit 3 (web components) | Framework-agnostic primitives, used in production at author's workplace |
| State management | Zustand | Hooks-native, minimal boilerplate, slice pattern |
| Persistence | Dexie.js (IndexedDB) | Local-first, offline-capable, excellent TS support |
| Styling | CSS custom properties + CSS Modules | No Tailwind — design token system is intentional |
| Testing | Vitest + Testing Library | Co-located tests, no separate test folder |
| Real-time sync | BroadcastChannel API | Multi-tab sync without a backend |

**TypeScript config: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.**
No `any`. No `@ts-ignore` without an explanatory comment. Violations block PRs.

---

## Architecture Boundary — The Most Important Rule

```
┌─────────────────────────────────────────────────────┐
│  DESIGN SYSTEM (Lit Web Components)                 │
│  arc-card, arc-deck-badge, arc-progress-ring        │
│  arc-heatmap-cell, arc-streak-counter, arc-tag      │
│                                                     │
│  Rules: No React. No Zustand. No Dexie.             │
│  Pure rendering. Inputs via attributes/properties.  │
│  Outputs via CustomEvents only.                     │
└─────────────────────────────────────────────────────┘
           ↕  @lit-labs/react wrappers
┌─────────────────────────────────────────────────────┐
│  APPLICATION LAYER (React + Vite)                   │
│  Routes, pages, feature components, hooks           │
│  Zustand stores, Dexie queries, business logic      │
│                                                     │
│  Rules: No direct DOM manipulation.                 │
│  All persistence goes through the repository layer. │
│  All state mutations go through Zustand actions.    │
└─────────────────────────────────────────────────────┘
           ↕  typed repository interfaces
┌─────────────────────────────────────────────────────┐
│  DATA LAYER (Dexie.js + SM-2 engine)                │
│  CardRepository, DeckRepository, SessionRepository  │
│  SM2Engine (pure functions, zero side effects)      │
│                                                     │
│  Rules: No React imports. No Zustand imports.       │
│  All functions must be unit-testable in isolation.  │
└─────────────────────────────────────────────────────┘
```

**Never collapse these boundaries.** If you're writing Dexie queries inside a React
component, stop and create a repository method. If a Lit component is importing Zustand,
you've made an architectural error.

---

## Project Structure

```
active-recall-os/
├── CLAUDE.md                    ← you are here
├── ARCHITECTURE.md              ← full system design document
├── packages/
│   ├── design-system/           ← Lit web components (publishable standalone)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── arc-card/
│   │   │   │   ├── arc-progress-ring/
│   │   │   │   ├── arc-heatmap-cell/
│   │   │   │   └── arc-tag/
│   │   │   ├── tokens/          ← CSS custom properties (design tokens)
│   │   │   └── index.ts
│   │   └── package.json
│   └── app/                     ← React application
│       ├── src/
│       │   ├── db/              ← Dexie schema + migrations
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   ├── repositories/    ← Data access layer
│       │   │   ├── card.repository.ts
│       │   │   ├── deck.repository.ts
│       │   │   └── session.repository.ts
│       │   ├── engine/          ← SM-2 algorithm (pure functions)
│       │   │   ├── sm2.ts
│       │   │   └── sm2.test.ts
│       │   ├── stores/          ← Zustand slices
│       │   │   ├── deck.store.ts
│       │   │   ├── session.store.ts
│       │   │   └── ui.store.ts
│       │   ├── hooks/           ← Custom React hooks
│       │   ├── features/        ← Feature-scoped components
│       │   │   ├── review/
│       │   │   ├── dashboard/
│       │   │   └── editor/
│       │   ├── pages/
│       │   └── lib/
│       │       └── wrappers/    ← @lit-labs/react wrappers for web components
│       └── package.json
├── package.json                 ← workspace root
└── vite.config.ts
```

---

## Core Domain Types

These are the canonical types. Do not deviate. If you need to extend them, update this
file and ARCHITECTURE.md first, then implement.

```typescript
// Card states — discriminated union (not an enum)
type CardState =
  | { status: 'new' }
  | { status: 'learning'; step: number; nextReview: Date }
  | { status: 'review'; interval: number; easeFactor: number; nextReview: Date }
  // relearning carries easeFactor + interval so a lapsed card can graduate back
  // to 'review' with its (penalized) ease and a sensible restart interval.
  | { status: 'relearning'; step: number; easeFactor: number; interval: number; nextReview: Date };

interface Card {
  id: string;                    // crypto.randomUUID()
  deckId: string;
  front: string;                 // supports markdown
  back: string;                  // supports markdown
  tags: string[];
  state: CardState;
  createdAt: Date;
  updatedAt: Date;
}

interface Deck {
  id: string;
  name: string;
  description: string;
  color: string;                 // design token key, e.g. 'deck-blue'
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;             // denormalized, updated on card mutations
  dueCount: number;              // computed at query time, not stored
}

interface ReviewSession {
  id: string;
  deckId: string;
  startedAt: Date;
  completedAt: Date | null;
  cardsReviewed: ReviewResult[];
}

interface ReviewResult {
  cardId: string;
  rating: 1 | 2 | 3 | 4;        // Again | Hard | Good | Easy (SM-2 grades)
  responseTimeMs: number;
  stateBefore: CardState;
  stateAfter: CardState;
}
```

---

## SM-2 Algorithm Contract

The SM-2 engine lives in `packages/app/src/engine/sm2.ts`. It is **pure functions only**.
No side effects, no database calls, no imports from React or Zustand.

```typescript
// The only two functions this module exports
function calculateNextState(card: Card, rating: 1 | 2 | 3 | 4): CardState
function isDue(card: Card, now?: Date): boolean
```

Every scheduling decision flows through these two functions. Never inline SM-2 logic
elsewhere.

---

## Zustand Store Pattern

Use the slice pattern. Each store file exports one slice. Compose at the store root.

```typescript
// ✅ Correct pattern
interface DeckSlice {
  decks: Deck[];
  selectedDeckId: string | null;
  actions: {
    selectDeck: (id: string) => void;
    loadDecks: () => Promise<void>;
    createDeck: (input: CreateDeckInput) => Promise<Deck>;
  };
}

// ❌ Never put async logic directly in set() calls
// ❌ Never access Dexie directly in store actions — use repositories
// ❌ Never store derived data — compute it with selectors
```

---

## Lit Component Contract

Every Lit component in the design system follows this contract:

```typescript
// ✅ Inputs: typed reactive properties
@property({ type: String }) variant: 'default' | 'due' | 'new' = 'default';

// ✅ Outputs: CustomEvents with typed detail
this.dispatchEvent(new CustomEvent<CardFlipEvent>('arc-card-flip', {
  bubbles: true,
  composed: true,  // crosses shadow DOM boundary
  detail: { cardId: this.cardId, side: 'back' }
}));

// ❌ Never import React, Zustand, or Dexie in a Lit component
// ❌ Never fetch data in a Lit component
// ❌ Never dispatch to global state from a Lit component
```

---

## BroadcastChannel Multi-Tab Sync

Multi-tab sync uses the BroadcastChannel API. No WebSocket, no backend.

```typescript
// Channel name convention: 'arc:' + store name
const channel = new BroadcastChannel('arc:decks');

// Message shape — always versioned
interface SyncMessage<T> {
  type: 'invalidate' | 'update' | 'delete';
  payload: T;
  sourceTabId: string;  // ignore messages from self
  timestamp: number;
}
```

When a card is reviewed in Tab A, Tab B's session store receives an invalidation
message and re-queries Dexie. The UI updates reactively. No shared memory, no conflicts.

---

## Coding Conventions

**Naming:**
- Components: PascalCase (`ReviewSession`, `DeckGrid`)
- Lit elements: kebab-case with `arc-` prefix (`arc-card`, `arc-progress-ring`)
- Hooks: `use` prefix, verb+noun (`useReviewSession`, `useDueCards`)
- Repositories: noun + `.repository.ts` (`card.repository.ts`)
- Stores: noun + `.store.ts` (`deck.store.ts`)
- Types/interfaces: PascalCase, no `I` prefix, no `Type` suffix

**Imports:** Absolute paths via Vite aliases. Never `../../../`.
```typescript
import { CardRepository } from '@/repositories/card.repository';
import { ArcCard } from '@arc/design-system';
```

**Error handling:** Never swallow errors silently. All async repository methods return
`Result<T, AppError>` (discriminated union, not thrown exceptions).

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

**Comments:** Explain *why*, not *what*. If the code is not self-explanatory, it needs
a refactor, not a comment. Exception: SM-2 algorithm steps should reference the spec.

---

## Milestones

Work through these in order. Do not jump ahead.

| # | Milestone | Key Learning |
|---|---|---|
| 1 | **Foundation** — monorepo setup, Dexie schema, SM-2 engine, core types | TS strict mode, pure functions, Dexie migrations |
| 2 | **Design System v1** — `arc-card`, `arc-tag`, `arc-progress-ring` in Lit | Lit 3 patterns, reactive properties, shadow DOM, CSS tokens |
| 3 | **Deck Management** — CRUD for decks and cards, React + Zustand wiring | Repository pattern, Zustand slices, optimistic updates |
| 4 | **Review Engine** — full review session loop, SM-2 scheduling live | Discriminated unions in practice, complex state machines |
| 5 | **Dashboard** — retention heatmap, forgetting curve, streak counter | Data viz, memoization, expensive computation patterns |
| 6 | **Multi-tab Sync** — BroadcastChannel integration across all stores | Browser APIs, event-driven architecture, tab coordination |
| 7 | **Performance Pass** — virtualization, bundle analysis, code splitting | React.memo, useMemo, Suspense, dynamic imports |
| 8 | **TypeScript Hardening** — mapped types, conditional types, inferred types | Advanced TS patterns, type-level programming |

---

## What Claude Should Never Do In This Project

- Do not introduce a backend, REST API, or cloud database without explicit instruction
- Do not add Tailwind, styled-components, or any CSS-in-JS library
- Do not use `any`, `unknown` without narrowing, or `as` casting without a comment
- Do not put business logic in React components — it belongs in stores or repositories
- Do not create files outside the defined project structure without asking first
- Do not skip writing tests for the SM-2 engine or repository layer
- Do not use `useEffect` for data fetching — use repository hooks instead
- When uncertain between two approaches, ask before implementing
