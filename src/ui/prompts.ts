// Controller button prompts (Kenney Input Prompts, CC0): a glyph per logical button, styled per
// controller family via <html data-pad>, and a prompt bar shown only while <html data-input> is
// "gamepad" (see input/inputMode.ts). Elements with class "kb-only" hide while a pad is in use.

import type { PadButton } from '../input/PadNav';
import type { PadStyle } from '../input/inputMode';

export type GlyphName = PadButton | 'dpad' | 'stick';

const GLYPHS: GlyphName[] = ['a', 'b', 'x', 'y', 'lb', 'rb', 'start', 'back', 'dpad', 'stick'];
const STYLES: PadStyle[] = ['xbox', 'ps', 'switch'];
const ROOT = `${import.meta.env.BASE_URL}assets/ui/prompts`;

function glyphRules(): string {
  const rules: string[] = [];
  for (const style of STYLES) {
    // Xbox glyphs are the default until a pad has identified itself.
    const scope = style === 'xbox' ? '' : `:root[data-pad=${style}] `;
    for (const g of GLYPHS) rules.push(`${scope}.vd-glyph[data-btn=${g}] { background-image: url("${ROOT}/${style}/${g}.svg"); }`);
  }
  return rules.join('\n');
}

const STYLE = `
.vd-glyph { display: inline-block; width: 1.7em; height: 1.7em; margin: -0.35em 0.05em; vertical-align: middle;
  background: center / contain no-repeat; flex: none; }
.vd-prompts { display: none; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap;
  background: #3b2418e6; color: #f3e3d0; border-radius: 8px; padding: 4px 12px; font: 600 14px system-ui, sans-serif;
  pointer-events: none; }
.vd-prompts .p { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.vd-glyph.pad-only { display: none; }
:root[data-input=gamepad] .vd-prompts { display: flex; }
:root[data-input=gamepad] .vd-glyph.pad-only { display: inline-block; }
/* Inside light buttons the white glyphs need a dark backing. */
button .vd-glyph { background-color: #3b2418; border-radius: 50%; background-size: 115%; margin-right: 0.3em; }
:root[data-input=gamepad] .kb-only { display: none !important; }
${glyphRules()}
`;

export function ensurePromptStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('vd-prompt-style')) return;
  const s = document.createElement('style');
  s.id = 'vd-prompt-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** One button glyph. `padOnly` hides it unless a controller is in use (for glyphs inside buttons). */
export function glyph(name: GlyphName, padOnly = false): HTMLSpanElement {
  ensurePromptStyle();
  const g = document.createElement('span');
  g.className = `vd-glyph${padOnly ? ' pad-only' : ''}`;
  g.dataset.btn = name;
  g.setAttribute('aria-hidden', 'true');
  return g;
}

/** A row of "[glyph] label" hints, visible only while a controller is in use. */
export function promptBar(items: [GlyphName | GlyphName[], string][], cls = ''): HTMLDivElement {
  ensurePromptStyle();
  const bar = document.createElement('div');
  bar.className = `vd-prompts${cls ? ` ${cls}` : ''}`;
  for (const [names, label] of items) {
    const p = document.createElement('span');
    p.className = 'p';
    for (const n of Array.isArray(names) ? names : [names]) p.appendChild(glyph(n));
    p.appendChild(document.createTextNode(` ${label}`));
    bar.appendChild(p);
  }
  return bar;
}
