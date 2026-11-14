import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      // The bake page is a dev-only tool; only the game is built.
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
