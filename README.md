# Active Recall OS

A **local-first spaced repetition + knowledge retention system**. Capture concepts fast, let the SM-2 algorithm schedule reviews before you forget, and watch your knowledge health on a retention dashboard.

**Live app:** https://firstprateek.github.io/active-recall-os/

> Learning is only useful if you can retrieve knowledge when you need it. Most tools optimize for *capture* and neglect *retention*. Active Recall OS closes the loop.

## Features

- **Quick capture** — add cards in seconds: `C` to open the editor, `⌘/Ctrl+Enter` to save & add another
- **SM-2 scheduling** — the battle-tested SuperMemo-2 algorithm with Anki-style learning/relearning steps, implemented as pure, fully-tested functions
- **Review sessions** — flip cards, rate recall (Again/Hard/Good/Easy) with keyboard `1–4`, see projected intervals before you rate
- **Retention dashboard** — activity heatmap, streak counter, retention rate, due forecast
- **Local-first** — everything lives in IndexedDB on your device; no accounts, no server, works offline
- **Multi-tab sync** — review in one tab, the other updates instantly via BroadcastChannel
- **Light/dark/system themes**, fully responsive (mobile + desktop)

## Architecture

Three strictly-bounded layers (see [ARCHITECTURE.md](ARCHITECTURE.md)):

| Layer | Tech | Rule |
|---|---|---|
| Design system | Lit 3 web components (`arc-*`) | Pure rendering. No React/Zustand/Dexie. |
| Application | React 18 + Zustand + React Router | No direct DOM. Persistence via repositories only. |
| Data | Dexie.js (IndexedDB) + SM-2 engine | Pure functions + `Result<T, E>` returns. No framework imports. |

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, zero `any`
- Card scheduling states modeled as a **discriminated union** — invalid transitions don't compile
- Multi-tab sync broadcasts **IDs, not payloads** — IndexedDB stays the single source of truth

## Development

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5175
npm test             # Vitest (unit + component tests)
npm run typecheck    # strict TS across all packages
npm run build        # production build (packages/app/dist)
```

### Monorepo layout

```
packages/
├── design-system/   # @arc/design-system — Lit components + design tokens
└── app/             # @arc/app — React application
    └── src/
        ├── engine/        # SM-2 (pure functions) + stats
        ├── db/            # Dexie schema + migrations
        ├── repositories/  # data access (Result<T, E>)
        ├── stores/        # Zustand slices
        ├── hooks/         # repository-backed hooks
        ├── features/      # review / dashboard / editor / layout
        └── pages/         # Dashboard, Deck, Review
```

## CI/CD

- **CI** ([ci.yml](.github/workflows/ci.yml)): typecheck → lint → test → build on every push/PR to `main`
- **Deploy** ([deploy.yml](.github/workflows/deploy.yml)): tests gate a Vite build published to GitHub Pages on every push to `main`
