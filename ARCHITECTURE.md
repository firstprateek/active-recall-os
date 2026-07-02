# Active Recall OS — Architecture Document

> **Audience:** The author and any future collaborators. Also useful for interview prep —
> this document is the answer to "walk me through a system you designed."
>
> **Last updated:** February 2026
> **Status:** Pre-implementation (Milestone 0)

---

## Problem Statement

Learning is only useful if you can retrieve knowledge when you need it. Most note-taking
tools optimize for *capture* but neglect *retention*. You write something down, feel
productive, and never see it again. This is the illusion of learning.

Active Recall OS solves the retrieval problem by combining note capture with spaced
repetition scheduling — ensuring every concept you save is systematically surfaced
before it decays from memory.

**Target user:** Myself. A senior frontend engineer preparing for L5 interviews and
deepening TypeScript/architecture knowledge. The app is the practice.

---

## Core Design Principles

**1. Local-first.** Your knowledge lives on your device. No accounts, no sync conflicts,
no service outages blocking your review session the morning of an interview. IndexedDB
via Dexie.js is the primary store. Future cloud sync is an additive layer, not a
prerequisite.

**2. Strict architectural boundaries.** Three layers: design system, application,
data. Each layer has explicit rules about what it can and cannot import. This prevents
the most common frontend failure mode: spaghetti components that fetch, render, and
manage state simultaneously.

**3. TypeScript as documentation.** Types are not annotations — they are the spec.
The domain model in TypeScript is the single source of truth. If the type is wrong, the
system is wrong. Strict mode is non-negotiable.

**4. Lit for primitives, React for composition.** Web components for pure rendering
primitives (no framework coupling, works anywhere). React for application-level
composition, routing, and state orchestration. This is the correct division of
responsibility at scale — it's how design systems like Adobe Spectrum work in practice.

---

## System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         BROWSER                                │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Application (Vite)                                │  │
│  │                                                          │  │
│  │  Pages: Dashboard / Deck / Review / Editor               │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐  │  │
│  │  │  Zustand   │  │   Custom    │  │  Feature         │  │  │
│  │  │  Stores    │  │   Hooks     │  │  Components      │  │  │
│  │  └─────┬──────┘  └──────┬──────┘  └────────┬─────────┘  │  │
│  │        │                │                   │            │  │
│  │        └────────────────┼───────────────────┘            │  │
│  │                         ↓                                │  │
│  │              ┌──────────────────┐                        │  │
│  │              │  Repositories    │                        │  │
│  │              │  (Data Access)   │                        │  │
│  │              └────────┬─────────┘                        │  │
│  │                       ↓                                  │  │
│  │              ┌──────────────────┐                        │  │
│  │              │  Dexie.js        │                        │  │
│  │              │  (IndexedDB)     │                        │  │
│  │              └──────────────────┘                        │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  Design System (Lit Web Components)              │   │  │
│  │  │  arc-card · arc-progress-ring · arc-heatmap-cell │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────┐     ┌────────────────────────────────┐   │
│  │  Tab A          │◄────►  Tab B  (BroadcastChannel API)  │   │
│  └─────────────────┘     └────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Card State Machine

Cards move through states according to SM-2 scheduling. This is a strict state machine
— transitions are only valid in specific directions.

```
         ┌─────────────────────────────────────┐
         │                                     │
    ┌────▼─────┐   first review   ┌────────────┴──┐
    │   new    ├─────────────────►│   learning    │
    └──────────┘                  └───────┬───────┘
                                          │ passes learning steps
                                          ▼
                                  ┌───────────────┐
                            ┌────►│    review     │◄────┐
                            │     └───────┬───────┘     │
                            │             │ rating=1     │
                            │             ▼             │
                            │     ┌───────────────┐     │
                            │     │  relearning   │     │
                            │     └───────┬───────┘     │
                            │             │ passes steps │
                            └─────────────┘             │
                                          (loop)         │
                                                         │
                              (mature card, ease > 2.5) ─┘
```

### Database Schema (Dexie)

```typescript
class ActiveRecallDB extends Dexie {
  cards!: Table<Card>;
  decks!: Table<Deck>;
  sessions!: Table<ReviewSession>;

  constructor() {
    super('ActiveRecallOS');
    this.version(1).stores({
      // Dexie index syntax: '++id' = auto-increment, '&id' = unique
      cards:    '&id, deckId, [state.status+state.nextReview], createdAt',
      decks:    '&id, name, createdAt',
      sessions: '&id, deckId, startedAt, completedAt',
    });
  }
}
```

**Index strategy rationale:**
- `[state.status+state.nextReview]` — compound index enables the primary query:
  "give me all `review` cards where `nextReview <= now`, ordered by `nextReview`"
- This avoids a full table scan on every session start, which matters at 1000+ cards

### Migration Strategy

Each schema version gets a migration file in `src/db/migrations/`. Migrations are
additive only in early milestones. Schema changes that require data transformation
get their own migration function and version bump.

```typescript
// src/db/migrations/v2-add-tags.ts
export function migrateV2(db: ActiveRecallDB) {
  // Dexie handles structural migrations. This file documents intent.
  // If data transformation is needed, use db.transaction() here.
}
```

---

## SM-2 Algorithm

### Why SM-2

SM-2 (SuperMemo 2) is a 1987 spaced repetition algorithm that remains the de facto
standard because it's simple, effective, and has decades of empirical validation.
Anki uses a modified version. We implement a clean version as pure functions.

### Algorithm Summary

After each review, the user rates recall quality from 1–4:
- **1 (Again):** Complete failure. Card goes back to learning.
- **2 (Hard):** Recalled with difficulty. Interval increases minimally.
- **3 (Good):** Recalled with some effort. Normal interval increase.
- **4 (Easy):** Recalled perfectly. Interval increases with bonus.

**Ease Factor (EF):** Each card has an ease factor (default: 2.5) that scales the
interval. Hard ratings decrease it; Easy ratings increase it. Floors at 1.3.

**Interval calculation:**
```
First review:  interval = 1 day
Second review: interval = 6 days
Subsequent:    interval = previousInterval * easeFactor
```

### Implementation Contract

```typescript
// packages/app/src/engine/sm2.ts

const LEARNING_STEPS_MINUTES = [1, 10] as const;
const RELEARNING_STEPS_MINUTES = [10] as const;
const DEFAULT_EASE_FACTOR = 2.5;
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_BONUS = 0.15;
const EASE_PENALTY_HARD = 0.15;
const EASE_PENALTY_AGAIN = 0.2;

export function calculateNextState(card: Card, rating: 1 | 2 | 3 | 4): CardState {
  // Pure function. Given current state + rating, returns next state.
  // No Date.now() calls — accept `now` as parameter for testability.
}

export function isDue(card: Card, now = new Date()): boolean {
  // Returns true if this card should appear in today's review queue.
}

export function getNextReviewDate(state: CardState): Date | null {
  // Returns the next scheduled review date, or null for 'new' cards.
}
```

**Testing priority:** SM-2 is the core value of the application. Every transition
must have a unit test. Edge cases: ease factor floor, very long intervals, back-to-back
Again ratings.

---

## State Management Architecture

### Zustand Slice Pattern

The application state is divided into three slices composed into one store.

```
┌─────────────────────────────────────┐
│  useAppStore (composed root)        │
├─────────────────┬───────────────────┤
│  DeckSlice      │  SessionSlice     │
│  ─────────────  │  ───────────────  │
│  decks[]        │  activeSession    │
│  selectedDeckId │  queue: Card[]    │
│  actions        │  currentIndex     │
│                 │  results[]        │
├─────────────────┼───────────────────┤
│  UISlice                            │
│  ────────────────────────────────   │
│  theme: 'light' | 'dark' | 'system' │
│  sidebarOpen: boolean               │
│  activeModal: ModalType | null      │
└─────────────────────────────────────┘
```

### Data Flow: Card Review

This sequence diagram shows the complete flow of a single card review rating.
Understanding this flow is the answer to "how does your state management work?"

```
User rates card (e.g. "Good")
        │
        ▼
SessionStore.rateCard(cardId, rating: 3)
        │
        ├─► SM2Engine.calculateNextState(card, 3)  [pure computation]
        │           │
        │           └─► returns new CardState
        │
        ├─► CardRepository.update(cardId, { state: newState })  [persist]
        │           │
        │           └─► Dexie.cards.put(...)
        │
        ├─► SessionStore updates local results[]  [optimistic]
        │
        ├─► BroadcastChannel.postMessage(invalidate)  [multi-tab]
        │
        └─► SessionStore.advanceQueue()  [next card]
```

### Selector Pattern

Derived state (due count, deck health score, cards due today) is never stored — it's
computed by selectors. Selectors are memoized with `useMemo` at the component level
or via Zustand's `subscribeWithSelector`.

```typescript
// ✅ Correct: computed, not stored
const dueCards = useAppStore(
  useShallow((state) => state.decks.cards.filter(c => isDue(c)))
);

// ❌ Wrong: storing derived data invites stale state bugs
const dueCount = useAppStore((s) => s.dueCount); // never store this
```

---

## Design System Architecture

### Component Inventory

| Component | Inputs | Events | Complexity |
|---|---|---|---|
| `arc-card` | front, back, state, flipped | `arc-flip`, `arc-rate` | High — CSS flip animation, state variants |
| `arc-progress-ring` | value, max, size, color | none | Medium — SVG, CSS custom props |
| `arc-heatmap-cell` | date, intensity, label | `arc-cell-hover` | Low — pure display |
| `arc-tag` | label, color, removable | `arc-remove` | Low |
| `arc-deck-badge` | name, dueCount, color | `arc-click` | Medium |
| `arc-streak-counter` | count, active | none | Low |

### Design Token System

All visual values flow from CSS custom properties defined in `tokens/`. Components
consume tokens, never hardcoded values. This enables theming (light/dark) without
component changes.

```css
/* tokens/colors.css */
:root {
  --arc-color-surface-primary: #ffffff;
  --arc-color-surface-secondary: #f5f5f5;
  --arc-color-text-primary: #1a1a1a;
  --arc-color-text-secondary: #6b7280;
  --arc-color-accent: #6366f1;      /* indigo — the primary brand color */
  --arc-color-due: #f59e0b;         /* amber — cards due for review */
  --arc-color-new: #10b981;         /* emerald — new cards */
  --arc-color-danger: #ef4444;      /* red — Again rating */
}

[data-theme="dark"] {
  --arc-color-surface-primary: #0f0f0f;
  --arc-color-text-primary: #f5f5f5;
  /* ... */
}
```

### Shadow DOM Styling Strategy

Lit components use Shadow DOM. External styles cannot pierce the shadow boundary
without explicit piercing points. We define piercing points via CSS parts:

```typescript
// In arc-card component template
html`<div part="card-front">${this.front}</div>`

// In consuming React app CSS
arc-card::part(card-front) {
  font-family: var(--arc-font-reading);
}
```

---

## Multi-Tab Sync

### Why BroadcastChannel

BroadcastChannel is a browser-native API for same-origin tab communication. It requires
no backend, no WebSocket server, and has excellent browser support. For a local-first
app with no server, it's the correct tool.

### Sync Protocol

```typescript
type SyncMessageType = 'card:updated' | 'deck:updated' | 'session:completed';

interface SyncMessage {
  type: SyncMessageType;
  payload: { id: string };       // just the ID — receiver re-queries Dexie
  sourceTabId: string;           // crypto.randomUUID() generated at app init
  timestamp: number;             // Date.now()
}
```

**Design decision:** We broadcast IDs, not payloads. The receiving tab re-queries
Dexie instead of applying the payload directly. This avoids merge conflicts and keeps
Dexie as the single source of truth. Slightly more I/O, zero conflict risk.

### Tab ID Management

Each tab generates a UUID on mount, stored in `sessionStorage` (not `localStorage` —
we want a fresh ID per tab, not per browser). Tabs ignore messages where
`sourceTabId === myTabId`.

---

## Performance Architecture

### Virtualization

The card list in deck view can contain 500+ cards. Rendering all of them is a
performance cliff. We use `@tanstack/react-virtual` (formerly `react-virtual`) for
windowed rendering — only DOM nodes in the viewport are rendered.

**Threshold:** Virtualize any list expected to exceed 50 items.

### Memoization Strategy

```typescript
// Expensive computations are memoized at the hook level
function useDeckStats(deckId: string): DeckStats {
  const cards = useCardsByDeck(deckId);

  return useMemo(() => ({
    total: cards.length,
    due: cards.filter(isDue).length,
    new: cards.filter(c => c.state.status === 'new').length,
    mature: cards.filter(c =>
      c.state.status === 'review' && c.state.interval > 21
    ).length,
    healthScore: calculateHealthScore(cards),  // expensive
  }), [cards]);
}
```

**Rule:** `useMemo` for computations >1ms or arrays/objects used as dependencies.
`useCallback` for functions passed as props to memoized children.

### Bundle Splitting Strategy

```
Entry chunk:     ~50kb  (React, Zustand, routing)
Design system:   ~30kb  (Lit — lazy loaded after first paint)
Review route:    ~20kb  (loaded when user enters review mode)
Dashboard route: ~40kb  (Recharts — only loaded on dashboard)
Editor route:    ~25kb  (Markdown parser — only loaded in editor)
```

Recharts and the markdown parser are the two largest dependencies. Both are behind
dynamic `import()` with `React.lazy` + `Suspense`.

---

## TypeScript Progression Plan

The codebase is designed to teach advanced TypeScript through natural use, not exercises.

| Milestone | TypeScript concept introduced | Where it appears |
|---|---|---|
| 1 | Discriminated unions | `CardState` type |
| 1 | `Result<T, E>` pattern | Repository return types |
| 2 | Template literal types | CSS custom property keys |
| 3 | Mapped types | `CreateInput<T>` (Omit + Partial) |
| 4 | Conditional types | `StateFor<CardStatus>` |
| 5 | `infer` keyword | Extracting payload types from events |
| 8 | Type-level programming | Full review — utility type library |

---

## Interview Talking Points

When asked "tell me about a project you're proud of," this architecture gives you
answers at every depth:

**Surface level:** "A spaced repetition app I use daily for interview prep."

**Mid level:** "It's a local-first app with a Lit web component design system and a
React application layer. I separated them deliberately — the design system is
framework-agnostic and the application handles all state and routing."

**Deep level:** "The most interesting architectural decision was the state machine for
card scheduling. Cards have four statuses — new, learning, review, relearning — and I
modeled them as a discriminated union rather than an enum. This means the TypeScript
compiler enforces valid state transitions at compile time. For example, you can't access
`interval` on a `learning` card because that property doesn't exist in the union branch."

**System design angle:** "For multi-tab sync, I used BroadcastChannel instead of a
backend. When you rate a card in one tab, it broadcasts an invalidation message with just
the card ID. The other tab receives it, re-queries IndexedDB, and updates the Zustand
store. I intentionally broadcast IDs rather than payloads to keep IndexedDB as the
single source of truth and avoid merge conflicts."

---

## What This Project Is Not

- Not a Anki clone. The scheduling algorithm is the same, the product is entirely different.
- Not a backend project. There is no server. Any future sync layer is additive.
- Not a "learn React" project. React is a tool here, not the subject.
- Not finished when it works. It's finished when it's defensible — when every decision
  has a reason and every abstraction earns its keep.
