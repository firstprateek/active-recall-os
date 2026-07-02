/**
 * UI slice — theme preference + modal routing.
 * Theme persists to localStorage so it survives reloads; resolution of
 * 'system' to light/dark happens in useTheme (needs matchMedia).
 */

import type { StateCreator } from 'zustand';
import type { AppStore } from '@/stores';

export type Theme = 'light' | 'dark' | 'system';

export type ModalState =
  | { kind: 'card-editor'; deckId: string; cardId?: string }
  | { kind: 'deck-editor'; deckId?: string }
  | { kind: 'confirm-delete'; entity: 'deck' | 'card'; id: string; name: string }
  | null;

export interface UISlice {
  theme: Theme;
  activeModal: ModalState;
  uiActions: {
    setTheme(theme: Theme): void;
    openModal(modal: NonNullable<ModalState>): void;
    closeModal(): void;
  };
}

export const THEME_STORAGE_KEY = 'arc:theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** localStorage can throw (private-mode edge cases, headless test envs). */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export const createUISlice: StateCreator<AppStore, [], [], UISlice> = (set) => ({
  theme: readStoredTheme(),
  activeModal: null,
  uiActions: {
    setTheme(theme) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Storage unavailable — the preference still applies for this tab's lifetime.
      }
      set({ theme });
    },
    openModal(modal) {
      set({ activeModal: modal });
    },
    closeModal() {
      set({ activeModal: null });
    },
  },
});
