// HTML labels pinned to points in the 3D scene: damage numbers, floating text, building HP bars,
// rookie rank chevrons and role icons. Text stays crisp and costs no draw calls.

import type { Stage } from './Stage';

const LAYER_STYLE = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
const TEXT_STYLE =
  'position:absolute;left:0;top:0;white-space:nowrap;font-family:system-ui,sans-serif;font-weight:700;' +
  'paint-order:stroke fill;-webkit-text-stroke:0.22em #3b2418;will-change:transform';
const BAR = { width: 0.95, height: 0.11 };
/** Max simultaneous damage numbers (swarms would otherwise spawn hundreds). */
const MAX_NUMBERS = 40;
/** Never smaller than this on screen (phones). */
const MIN_FONT_PX = 11;

/** A label that follows a world point every frame. */
interface Pinned {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  /** Seen this frame (pinned labels not refreshed are hidden). */
  seen: boolean;
}

export class Labels {
  private readonly layer = document.createElement('div');
  private readonly pinned = new Map<string, Pinned>();
  private numbers = 0;

  constructor(private readonly stage: Stage, parent: HTMLElement) {
    this.layer.style.cssText = LAYER_STYLE;
    this.layer.className = 'vd-labels';
    parent.appendChild(this.layer);
  }

  /** Font size in px for `units` world units tall (labels scale with the view, like the sprites did). */
  private px(units: number): number {
    return Math.max(MIN_FONT_PX, units * this.stage.pixelsPerUnit());
  }

  /** Text that floats up and fades (level up, promotions, rally). */
  floatText(x: number, y: number, z: number, text: string, color = '#ffd75e') {
    this.float(x, y, z, text, color, this.px(0.36), 0.75, 1100);
  }

  /** Small damage number that pops up and fades. */
  damageNumber(x: number, y: number, z: number, n: number, heavy: boolean) {
    if (this.numbers >= MAX_NUMBERS) return;
    this.numbers++;
    const jitter = (Math.random() - 0.5) * 0.25;
    this.float(x + jitter, y, z - jitter, String(Math.round(n)), heavy ? '#ffb347' : '#ffffff', this.px(heavy ? 0.28 : 0.22), 0.5, 650, () => this.numbers--);
  }

  /** Building HP bar (fraction 0..1); hidden unless updated every frame. */
  bar(key: string, x: number, y: number, z: number, frac: number, color: string) {
    const p = this.pin(key, x, y, z, () => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;background:#3b2418;border-radius:2px;padding:2px;will-change:transform';
      el.appendChild(document.createElement('div')).style.cssText = 'height:100%;border-radius:1px';
      return el;
    });
    const w = BAR.width * this.stage.pixelsPerUnit();
    p.el.style.width = `${w}px`;
    p.el.style.height = `${Math.max(4, BAR.height * this.stage.pixelsPerUnit())}px`;
    const fill = p.el.firstChild as HTMLElement;
    fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    fill.style.background = color;
  }

  /** A text badge (rank chevrons, role icons); hidden unless updated every frame. */
  badge(key: string, x: number, y: number, z: number, text: string, color: string, units: number, background?: string) {
    const p = this.pin(key, x, y, z, () => {
      const el = document.createElement('div');
      el.style.cssText = TEXT_STYLE;
      if (background) {
        el.style.background = background;
        el.style.padding = '0 0.3em';
        el.style.borderRadius = '0.25em';
        el.style.webkitTextStroke = '0';
      }
      return el;
    });
    if (p.el.textContent !== text) p.el.textContent = text;
    p.el.style.color = color;
    p.el.style.fontSize = `${this.px(units)}px`;
  }

  /** Positions pinned labels and hides those not refreshed since the last call. */
  layout() {
    for (const [key, p] of this.pinned) {
      if (!p.seen) {
        p.el.remove();
        this.pinned.delete(key);
        continue;
      }
      p.seen = false;
      const s = this.stage.toScreen(p.x, p.y, p.z);
      // Anchor at bottom centre.
      p.el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
    }
  }

  destroy() {
    this.layer.remove();
    this.pinned.clear();
  }

  private pin(key: string, x: number, y: number, z: number, make: () => HTMLElement): Pinned {
    let p = this.pinned.get(key);
    if (!p) {
      p = { el: make(), x, y, z, seen: true };
      this.layer.appendChild(p.el);
      this.pinned.set(key, p);
    }
    p.x = x; p.y = y; p.z = z;
    p.seen = true;
    return p;
  }

  private float(x: number, y: number, z: number, text: string, color: string, fontPx: number, riseUnits: number, ms: number, done?: () => void) {
    const el = document.createElement('div');
    el.style.cssText = TEXT_STYLE;
    el.style.color = color;
    el.style.fontSize = `${fontPx}px`;
    el.textContent = text;
    this.layer.appendChild(el);
    const s = this.stage.toScreen(x, y, z);
    const rise = riseUnits * this.stage.pixelsPerUnit();
    const at = (dy: number) => `translate(${s.x}px,${s.y - dy}px) translate(-50%,-100%)`;
    const anim = el.animate(
      [{ transform: at(0), opacity: 1 }, { transform: at(rise), opacity: 0 }],
      { duration: ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      el.remove();
      done?.();
    };
  }
}
