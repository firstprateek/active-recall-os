import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Reset the fake IndexedDB between tests so repositories start from a clean DB.
// `fake-indexeddb/auto` installs a global indexedDB; we recreate it per test to
// avoid cross-test state leakage.
beforeEach(async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  cleanup();
});
