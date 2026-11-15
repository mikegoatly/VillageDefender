// Which kind of input the player used last, published on <html> as data-input / data-pad so CSS
// can show controller button prompts only while a controller is in use, with the right glyphs.

export type InputMode = 'gamepad' | 'keyboard' | 'touch';
export type PadStyle = 'xbox' | 'ps' | 'switch';

let installed = false;

export function setInputMode(mode: InputMode, style?: PadStyle): void {
  if (typeof document === 'undefined') return;
  const d = document.documentElement.dataset;
  if (d.input !== mode) d.input = mode;
  if (style && d.pad !== style) d.pad = style;
  installListeners();
}

export function inputMode(): InputMode | undefined {
  return typeof document === 'undefined' ? undefined : (document.documentElement.dataset.input as InputMode | undefined);
}

/** Keyboard or pointer use switches away from gamepad prompts. Installed once, on first use. */
function installListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', () => setInputMode('keyboard'), true);
  window.addEventListener('pointerdown', (e) => setInputMode(e.pointerType === 'mouse' ? 'keyboard' : 'touch'), true);
}
