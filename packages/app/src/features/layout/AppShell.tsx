import { Link, Outlet } from 'react-router-dom';
import { useTheme } from '@/hooks';
import styles from './AppShell.module.css';

const THEME_ORDER = ['light', 'dark', 'system'] as const;
type ThemeMode = (typeof THEME_ORDER)[number];

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  switch (mode) {
    case 'light':
      // Sun
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case 'dark':
      // Moon
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'system':
      // Monitor
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 21h8m-4-3v3" />
        </svg>
      );
  }
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const index = THEME_ORDER.indexOf(theme);
  const current: ThemeMode = THEME_ORDER[index === -1 ? 0 : index] ?? 'light';
  const next: ThemeMode = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] ?? 'light';

  return (
    <button
      type="button"
      className={styles['themeToggle']}
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}. Switch to ${next} theme.`}
      title={`Switch to ${next} theme`}
    >
      <ThemeIcon mode={current} />
    </button>
  );
}

export function AppShell() {
  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <div className={styles['headerInner']}>
          <Link to="/" className={styles['title']}>
            Active Recall
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className={styles['main']}>
        <Outlet />
      </main>
    </div>
  );
}
