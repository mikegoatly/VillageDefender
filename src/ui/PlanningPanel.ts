// Planning-phase overlay: before a town starts, the player turns houses into role buildings.
// DOM only; the scene handles map clicks, highlighting and roofs. Mouse/touch via buttons,
// keyboard and gamepad like LevelUpPanel (300 ms guard after the panel appears).

import type { RoleKind } from '../data/roles';

export const PLANNING_INPUT_GUARD_MS = 300;
const STICK_THRESHOLD = 0.5;

export interface PlanningRoleOption {
  kind: RoleKind;
  name: string;
  description: string;
  cost: number;
  icon: string;
  locked: boolean;
  lockHint?: string;
}

export interface PlanningView {
  townName: string;
  pointsLeft: number;
  pointsTotal: number;
  /** Selected house, or null when nothing is selected. */
  selected: { id: number; label: string; role: RoleKind | null } | null;
  roles: PlanningRoleOption[];
  /** Short summary of assigned roles, e.g. "Barracks, Chapel". */
  assigned: string;
}

export interface PlanningCallbacks {
  /** null = back to a plain house. */
  onAssign(buildingId: number, role: RoleKind | null): void;
  onSelectNext(delta: 1 | -1): void;
  onStart(): void;
}

const STYLE = `
.vd-plan { position: fixed; inset: 0; z-index: 90; display: none; pointer-events: none; color: #3b2418;
  font: 600 14px system-ui, sans-serif; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.vd-plan.show { display: block; }
.vd-plan .banner { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  pointer-events: auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
  background: #f3e3d0ee; border: 2px solid #3b2418; border-radius: 10px; padding: 6px 12px; max-width: 96vw; box-sizing: border-box; }
.vd-plan .banner .title { font-weight: 800; font-size: 16px; }
.vd-plan .pips { letter-spacing: 2px; }
.vd-plan .pip.on { color: #c47a00; }
.vd-plan .assigned { font-weight: 500; font-size: 13px; opacity: 0.85; }
.vd-plan .hint { position: absolute; top: calc(max(8px, env(safe-area-inset-top)) + 56px); left: 50%; transform: translateX(-50%);
  background: #3b2418cc; color: #f3e3d0; padding: 4px 12px; border-radius: 6px; font-weight: 500; white-space: nowrap; }
.vd-plan button { font: inherit; cursor: pointer; border: 2px solid #3b2418; border-radius: 8px; color: #3b2418; }
.vd-plan .start { background: #ffd75e; font-weight: 800; font-size: 16px; padding: 6px 18px; }
.vd-plan .card { position: absolute; bottom: max(8px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);
  pointer-events: auto; background: #f3e3d0f2; border: 3px solid #3b2418; border-radius: 10px; padding: 8px 10px;
  max-width: 98vw; max-height: 60vh; box-sizing: border-box; overflow: auto; }
.vd-plan .card .head { font-weight: 800; margin-bottom: 6px; text-align: center; }
.vd-plan .opts { display: flex; gap: 8px; justify-content: center; align-items: stretch; }
.vd-plan .opt { background: #fff7ea; padding: 6px 8px; width: 150px; flex: 0 1 150px; min-width: 0; display: flex;
  flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.vd-plan .opt .ic { font-size: 20px; line-height: 1; }
.vd-plan .opt .nm { font-weight: 800; }
.vd-plan .opt .ds { font-weight: 500; font-size: 11px; line-height: 1.2; }
.vd-plan .opt .note { font-size: 11px; color: #b8322c; font-weight: 700; }
.vd-plan .opt.cur { background: #ffd75e; }
.vd-plan .opt.focus { outline: 4px solid #ffd75e; outline-offset: 2px; box-shadow: 0 0 10px 3px #ffd75ecc; }
.vd-plan .opt:disabled { opacity: 0.55; cursor: not-allowed; }
@media (max-height: 420px) {
  .vd-plan .banner { padding: 4px 10px; gap: 8px; }
  .vd-plan .banner .title { font-size: 14px; }
  .vd-plan .start { padding: 3px 14px; font-size: 14px; }
  .vd-plan .hint { top: calc(max(8px, env(safe-area-inset-top)) + 44px); }
  .vd-plan .card { padding: 4px 6px; }
  .vd-plan .card .head { margin-bottom: 3px; font-size: 13px; }
  .vd-plan .opt { width: 120px; flex-basis: 120px; padding: 3px 4px; }
  .vd-plan .opt .ds { font-size: 10px; }
}
`;

interface Opt {
  role: RoleKind | null;
  enabled: boolean;
  el: HTMLButtonElement;
}

function now(): number {
  return performance.now();
}

export class PlanningPanel {
  private readonly el: HTMLDivElement;
  private view: PlanningView | null = null;
  private viewKey = '';
  private opts: Opt[] = [];
  private focus = 0;
  private padUsed = false;
  private shownAt = 0;
  private raf: number | null = null;
  private prevPad: boolean[] = [];
  private padDir = 0;
  private padVert = 0;
  private _visible = false;

  constructor(root: HTMLElement, private readonly cb: PlanningCallbacks) {
    if (!document.getElementById('vd-plan-style')) {
      const s = document.createElement('style');
      s.id = 'vd-plan-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'vd-plan';
    root.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
  }

  get visible(): boolean {
    return this._visible;
  }

  show(view: PlanningView): void {
    const key = JSON.stringify(view);
    if (!this._visible) {
      this._visible = true;
      this.shownAt = now();
      this.prevPad = Array(16).fill(true); // assume held until observed released
      this.padDir = 0;
      this.padVert = 0;
      this.padUsed = false;
      this.el.classList.add('show');
      this.startPadLoop();
    } else if (key === this.viewKey) {
      return;
    }
    const prev = this.view;
    this.view = view;
    this.viewKey = key;
    const sameTarget = prev?.selected?.id === view.selected?.id && prev?.selected?.role === view.selected?.role;
    this.build(!sameTarget);
  }

  hide(): void {
    this._visible = false;
    this.viewKey = '';
    this.el.classList.remove('show');
    this.stopPadLoop();
  }

  destroy(): void {
    this.hide();
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }

  // ------------------------------------------------------------ rendering

  private build(resetFocus: boolean): void {
    const v = this.view!;
    this.el.replaceChildren();
    this.opts = [];

    const banner = document.createElement('div');
    banner.className = 'banner';
    const pips = Array.from({ length: v.pointsTotal }, (_, i) =>
      i < v.pointsLeft ? '<span class="pip on">●</span>' : '<span class="pip">○</span>').join('');
    banner.innerHTML = `<span class="title"></span><span class="pips">${pips}</span><span class="pts"></span>
      <span class="assigned"></span><button type="button" class="start">Start ▶</button>`;
    banner.querySelector('.title')!.textContent = `Plan your defences — ${v.townName}`;
    banner.querySelector('.pts')!.textContent = `${v.pointsLeft}/${v.pointsTotal} points`;
    banner.querySelector('.assigned')!.textContent = v.assigned;
    banner.querySelector('.start')!.addEventListener('click', () => this.cb.onStart());
    this.el.appendChild(banner);

    if (!v.selected) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Tap a house to give it a role';
      this.el.appendChild(hint);
      return;
    }

    const sel = v.selected;
    const refund = sel.role ? (v.roles.find((r) => r.kind === sel.role)?.cost ?? 0) : 0;
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = sel.label;
    const row = document.createElement('div');
    row.className = 'opts';
    card.append(head, row);

    const plain = this.makeOpt(row, null, true, sel.role === null, '', 'Plain house', '', '');
    this.opts.push({ role: null, enabled: true, el: plain });
    plain.addEventListener('click', () => this.assign(null));
    v.roles.forEach((r, i) => {
      const affordable = r.cost <= v.pointsLeft + refund || sel.role === r.kind;
      const enabled = !r.locked && affordable;
      const note = r.locked ? `🔒 ${r.lockHint ?? 'Locked'}` : !affordable ? 'Not enough points' : '';
      const btn = this.makeOpt(row, r.kind, enabled, sel.role === r.kind, `${i + 1}. ${r.icon}`,
        r.name, `${r.cost} pt${r.cost === 1 ? '' : 's'} · ${r.description}`, note);
      btn.addEventListener('click', () => this.assign(r.kind));
      this.opts.push({ role: r.kind, enabled, el: btn });
    });
    this.el.appendChild(card);

    if (resetFocus || this.focus >= this.opts.length) {
      this.focus = Math.max(0, this.opts.findIndex((o) => o.role === sel.role));
    }
    this.applyFocus();
  }

  private makeOpt(row: HTMLElement, _role: RoleKind | null, enabled: boolean, current: boolean,
    icon: string, name: string, desc: string, note: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (current ? ' cur' : '');
    b.disabled = !enabled;
    b.innerHTML = '<span class="ic"></span><span class="nm"></span><span class="ds"></span><span class="note"></span>';
    b.querySelector('.ic')!.textContent = icon;
    b.querySelector('.nm')!.textContent = name;
    b.querySelector('.ds')!.textContent = desc;
    b.querySelector('.note')!.textContent = note;
    row.appendChild(b);
    return b;
  }

  private applyFocus(): void {
    this.opts.forEach((o, i) => o.el.classList.toggle('focus', this.padUsed && i === this.focus));
  }

  // ------------------------------------------------------------ actions

  private assign(role: RoleKind | null): void {
    const sel = this.view?.selected;
    if (!this._visible || !sel) return;
    this.cb.onAssign(sel.id, role);
  }

  private assignOpt(o: Opt | undefined): void {
    if (o?.enabled) this.assign(o.role);
  }

  private guardOpen(): boolean {
    return now() - this.shownAt >= PLANNING_INPUT_GUARD_MS;
  }

  // ------------------------------------------------------------ keyboard

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const handled = /^[0-4]$/.test(k) || ['ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Enter'].includes(k);
    if (!handled) return;
    e.preventDefault();
    if (!this.guardOpen() || e.repeat) return;
    if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) this.cb.onSelectNext(-1);
    else if (k === 'ArrowRight' || k === 'Tab') this.cb.onSelectNext(1);
    else if (k === 'Enter') this.cb.onStart();
    else if (k === '0' || k === 'Backspace') this.assignOpt(this.opts[0]);
    else this.assignOpt(this.opts[Number(k)]); // opts[0] is "Plain house", so 1..4 line up with roles
  };

  // ------------------------------------------------------------ gamepad

  private startPadLoop(): void {
    if (this.raf !== null) return;
    const tick = (): void => {
      this.raf = null;
      if (!this._visible) return;
      this.pollPad();
      if (this._visible) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopPadLoop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private pollPad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]?.connected) { pad = pads[i]; break; }
    }
    if (!pad) {
      this.padDir = 0;
      this.padVert = 0;
      return;
    }
    const down = (i: number): boolean => !!pad!.buttons[i]?.pressed;
    const rising = (i: number): boolean => down(i) && !this.prevPad[i];
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const dir = down(4) || down(14) || ax < -STICK_THRESHOLD ? -1 : down(5) || down(15) || ax > STICK_THRESHOLD ? 1 : 0;
    const vert = down(12) || ay < -STICK_THRESHOLD ? -1 : down(13) || ay > STICK_THRESHOLD ? 1 : 0;
    const open = this.guardOpen();

    const risingA = rising(0);
    const risingStart = rising(9) || rising(3);
    const dirEdge = dir !== 0 && dir !== this.padDir;
    const vertEdge = vert !== 0 && vert !== this.padVert;
    this.padDir = dir;
    this.padVert = vert;
    this.prevPad = Array.from({ length: 16 }, (_, i) => down(i));
    if (!open) return;

    if (dirEdge) this.cb.onSelectNext(dir as 1 | -1);
    if (vertEdge && this.opts.length > 0) {
      this.padUsed = true;
      this.focus = Math.min(this.opts.length - 1, Math.max(0, this.focus + vert));
      this.applyFocus();
    }
    if (risingA) {
      this.padUsed = true;
      this.assignOpt(this.opts[this.focus]);
    }
    if (risingStart) this.cb.onStart();
  }
}
