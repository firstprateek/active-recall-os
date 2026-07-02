import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/features/layout/AppShell';

// Route-level code splitting: each page is its own chunk.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const DeckPage = lazy(() => import('@/pages/DeckPage'));
const ReviewPage = lazy(() => import('@/pages/ReviewPage'));

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Loading page">
      <div className="route-spinner" aria-hidden="true" />
    </div>
  );
}

/** Per-route Suspense so the AppShell header stays mounted while a page chunk loads. */
function page(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

// HashRouter is required: GitHub Pages has no SPA fallback, so only
// hash-based deep links (/#/decks/abc) survive a hard refresh.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={page(<DashboardPage />)} />
          <Route path="/decks/:deckId" element={page(<DeckPage />)} />
          <Route path="/decks/:deckId/review" element={page(<ReviewPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
