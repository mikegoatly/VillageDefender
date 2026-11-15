import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { pwaPlugin } from './tools/pwa-plugin.mjs';

export default defineConfig({
  // Relative asset URLs, so the build runs from any sub-path (GitHub Pages serves /VillageDefender/).
  base: './',
  plugins: [pwaPlugin()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
