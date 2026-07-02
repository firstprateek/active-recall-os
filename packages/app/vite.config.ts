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
    alias: {
      '@arc/design-system': `${dsSrc}/index.ts`,
      '@': appSrc,
    },
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
