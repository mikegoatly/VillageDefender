// Touch overlay: floating left-half joystick + right-side attack/dodge buttons.
// All styling lives in STYLE below so Phase 2 can swap in Kenney art in one place.

const STYLE = `
.vd-touch { position: absolute; inset: 0; pointer-events: none; display: none; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; z-index: 50; }
.vd-touch.vd-touch-on { display: block; }
.vd-touch-zone { position: absolute; left: 0; top: 0; width: 50%; height: 100%; pointer-events: auto; touch-action: none; }
.vd-touch-base, .vd-touch-knob, .vd-touch-btn {
  position: absolute; border-radius: 50%; box-sizing: border-box;
  background: rgba(59, 36, 24, 0.35); border: 2px solid rgba(255, 240, 220, 0.55); }
.vd-touch-base { width: 120px; height: 120px; margin: -60px 0 0 -60px; display: none; pointer-events: none; }
.vd-touch-knob { width: 56px; height: 56px; margin: -28px 0 0 -28px; background: rgba(59, 36, 24, 0.55); pointer-events: none; }
.vd-touch-btn { pointer-events: auto; touch-action: none; display: flex; align-items: center; justify-content: center;
  color: rgba(255, 240, 220, 0.9); font: 600 28px sans-serif; }
.vd-touch-btn.vd-pressed { background: rgba(120, 76, 50, 0.6); border-color: rgba(255, 255, 255, 0.9); }
.vd-touch-attack { width: 88px; height: 88px;
  right: calc(24px + env(safe-area-inset-right, 0px)); bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
.vd-touch-dodge { width: 64px; height: 64px; font-size: 24px;
  right: calc(24px + 88px + 16px + env(safe-area-inset-right, 0px)); bottom: calc(24px + 70px + env(safe-area-inset-bottom, 0px)); }
`;

export const JOYSTICK_RADIUS = 60;

export interface TouchState {
  move: { x: number; y: number };
  attack: boolean;
  dodge: boolean;
}

function injectStyle(): void {
  if (document.getElementById('vd-touch-style')) return;
  const el = document.createElement('style');
  el.id = 'vd-touch-style';
  el.textContent = STYLE;
  document.head.appendChild(el);
}

export class TouchControls {
  readonly state: TouchState = { move: { x: 0, y: 0 }, attack: false, dodge: false };
  private readonly el: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly cleanups: Array<() => void> = [];
  /** pointerIds currently down on the overlay (joystick or buttons). */
  private readonly pointers = new Set<number>();
  private stickId: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(root: HTMLElement) {
    injectStyle();
    this.el = document.createElement('div');
    this.el.className = 'vd-touch';
    const zone = this.div('vd-touch-zone', this.el);
    this.base = this.div('vd-touch-base', zone);
    this.knob = this.div('vd-touch-knob', this.base);
    // Knob sits at the base centre; translate() moves it from there.
    this.knob.style.left = '50%';
    this.knob.style.top = '50%';
    const attack = this.div('vd-touch-btn vd-touch-attack', this.el, '⚔');
    const dodge = this.div('vd-touch-btn vd-touch-dodge', this.el, '»');
    this.bindStick(zone);
    this.bindButton(attack, (v) => {
      this.state.attack = v;
    });
    this.bindButton(dodge, (v) => {
      this.state.dodge = v;
    });
    // The overlay is absolutely positioned, so root must be a containing block.
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    root.appendChild(this.el);
  }

  isTouched(): boolean {
    return this.pointers.size > 0;
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('vd-touch-on', v);
    if (!v) this.releaseAll();
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.el.remove();
  }

  private div(cls: string, parent: HTMLElement, text?: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    parent.appendChild(d);
    return d;
  }

  private on(t: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', fn: (e: PointerEvent) => void): void {
    t.addEventListener(type, fn as EventListener);
    this.cleanups.push(() => t.removeEventListener(type, fn as EventListener));
  }

  private capture(t: HTMLElement, id: number): void {
    try {
      t.setPointerCapture(id);
    } catch {
      /* unsupported or pointer already gone */
    }
  }

  private bindStick(zone: HTMLElement): void {
    this.on(zone, 'pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.pointers.add(e.pointerId);
      this.capture(zone, e.pointerId);
      // Base is positioned in zone-local coordinates.
      const r = zone.getBoundingClientRect();
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.style.display = 'block';
      this.setKnob(0, 0);
    });
    this.on(zone, 'pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.originX;
      let dy = e.clientY - this.originY;
      const len = Math.hypot(dx, dy);
      if (len > JOYSTICK_RADIUS) {
        dx = (dx / len) * JOYSTICK_RADIUS;
        dy = (dy / len) * JOYSTICK_RADIUS;
      }
      this.setKnob(dx, dy);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.pointers.delete(e.pointerId);
      this.base.style.display = 'none';
      this.state.move = { x: 0, y: 0 };
    };
    this.on(zone, 'pointerup', end);
    this.on(zone, 'pointercancel', end);
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.state.move = { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS };
  }

  private bindButton(btn: HTMLElement, set: (v: boolean) => void): void {
    let id: number | null = null;
    this.on(btn, 'pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      this.pointers.add(e.pointerId);
      this.capture(btn, e.pointerId);
      btn.classList.add('vd-pressed');
      set(true);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = null;
      this.pointers.delete(e.pointerId);
      btn.classList.remove('vd-pressed');
      set(false);
    };
    this.on(btn, 'pointerup', end);
    this.on(btn, 'pointercancel', end);
  }

  /** Hidden overlay: drop any in-flight touches. */
  private releaseAll(): void {
    this.pointers.clear();
    this.stickId = null;
    this.base.style.display = 'none';
    this.state.move = { x: 0, y: 0 };
    this.state.attack = false;
    this.state.dodge = false;
    this.el.querySelectorAll('.vd-pressed').forEach((n) => n.classList.remove('vd-pressed'));
  }
}
