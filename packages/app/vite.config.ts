import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const appSrc = fileURLToPath(new URL('./src', import.meta.url));
const dsSrc = fileURLToPath(new URL('../design-system/src', import.meta.url));

// GitHub Pages serves the site from /<repo-name>/ — the base must match.
// Locally (dev/preview) we stay at '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/active-recall-os/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    // Order matters: the subpath alias must precede the bare-package alias,
    // otherwise '@arc/design-system/tokens/*' would resolve into index.ts.
    alias: [
      { find: '@arc/design-system/tokens', replacement: `${dsSrc}/tokens` },
      { find: '@arc/design-system', replacement: `${dsSrc}/index.ts` },
      { find: '@', replacement: appSrc },
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
