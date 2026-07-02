/**
 * Composed application store — slice pattern per CLAUDE.md.
 * Slices never import each other; cross-slice access goes through get()
 * typed as the composed AppStore.
 */

import { create } from 'zustand';
import { createDeckSlice } from '@/stores/deck.store';
import { createSessionSlice } from '@/stores/session.store';
import { createUISlice } from '@/stores/ui.store';
import type { DeckSlice } from '@/stores/deck.store';
import type { SessionSlice } from '@/stores/session.store';
import type { UISlice } from '@/stores/ui.store';

export type AppStore = DeckSlice & SessionSlice & UISlice;

export const useAppStore = create<AppStore>()((...args) => ({
  ...createDeckSlice(...args),
  ...createSessionSlice(...args),
  ...createUISlice(...args),
}));

export type { DeckSlice } from '@/stores/deck.store';
export type { SessionSlice } from '@/stores/session.store';
export type { UISlice, ModalState, Theme } from '@/stores/ui.store';
