/**
 * Multi-tab sync over BroadcastChannel.
 *
 * Design (ARCHITECTURE.md): we broadcast IDs, not payloads. Receivers
 * re-query Dexie — IndexedDB stays the single source of truth, zero merge
 * conflicts. Tab IDs live in sessionStorage so each tab gets its own.
 */

export type SyncMessageType = 'card:updated' | 'deck:updated' | 'session:completed';

export interface SyncMessage {
  type: SyncMessageType;
  payload: { id: string };
  sourceTabId: string;
  timestamp: number;
}

const CHANNEL_NAME = 'arc:sync';
const TAB_ID_KEY = 'arc:tab-id';

function resolveTabId(): string {
  // sessionStorage → fresh ID per tab (localStorage would share across tabs).
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing !== null) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    // Storage unavailable (private mode edge cases) — fall back to in-memory.
    return crypto.randomUUID();
  }
}

export const tabId = resolveTabId();

type Listener = (message: SyncMessage) => void;

class SyncBus {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    // BroadcastChannel is broadly supported, but guard for odd embedders/tests.
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const message = event.data;
        if (message.sourceTabId === tabId) return; // ignore self
        for (const listener of this.listeners) listener(message);
      };
    }
  }

  publish(type: SyncMessageType, id: string): void {
    this.channel?.postMessage({
      type,
      payload: { id },
      sourceTabId: tabId,
      timestamp: Date.now(),
    } satisfies SyncMessage);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const syncBus = new SyncBus();
