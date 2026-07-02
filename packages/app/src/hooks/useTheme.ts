/**
 * useTheme — theme preference + system resolution.
 * The preference lives in the UI slice (persisted to localStorage there);
 * this hook resolves 'system' via matchMedia and applies the data-theme
 * attribute that the design tokens key off.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores';
import type { Theme } from '@/stores';

function systemPrefersDark(): boolean {
  // matchMedia is missing in some test environments — default to light.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme(): {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme(t: Theme): void;
} {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.uiActions.setTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemDark(event.matches);
    };
    // Guard: older engines expose MediaQueryList without addEventListener.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  return { theme, resolved, setTheme };
}
