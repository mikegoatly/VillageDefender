import { startThreeGame } from './render3d/ThreeGame';

// The game draws with three.js and the Kenney 3D models (docs/PORT_3D_PLAN.md).
void startThreeGame(document.getElementById('game')!);

// Offline install: the service worker (written at build time by tools/pwa-plugin.mjs) precaches the whole game.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  });
}
