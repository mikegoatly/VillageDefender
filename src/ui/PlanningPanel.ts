// Planning-phase overlay: before a town starts, the player turns houses into role buildings (and, in
// night towns, spends lamp oil lighting dark lamp posts out on the approaches).
// DOM only; the scene handles map clicks, highlighting and roofs. Mouse/touch via buttons,
// keyboard and gamepad like LevelUpPanel (300 ms guard after the panel appears).

import type { RoleKind } from '../data/roles';
import { PadNav, type PadDir } from '../input/PadNav';
import { glyph, promptBar } from './prompts';

export const PLANNING_INPUT_GUARD_MS = 300;

export interface PlanningRoleOption {
  kind: RoleKind;
  name: string;
  description: string;
  cost: number;
  icon: string;
  locked: boolean;
  lockHint?: string;
}

export interface PlanningWeaponOption {
  kind: string;
  name: string;
  description: string;
  locked: boolean;
  lockHint?: string;
  icon: string;
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
  /** Optional basic-attack picker. */
  weapons?: PlanningWeaponOption[];
  selectedWeapon?: string;
  /** Night towns: lamp oil left / in all (absent elsewhere). */
  oil?: { left: number; total: number };
  /** Selected dark lamp post (night towns), or null/absent; never set together with `selected`. */
  lamp?: { id: number; label: string; lit: boolean; canLight: boolean } | null;
}

export interface PlanningCallbacks {
  /** null = back to a plain house. */
  onAssign(buildingId: number, role: RoleKind | null): void;
  onSelectNext(delta: 1 | -1): void;
  /** Select the house nearest in that screen direction (gamepad stick / D-pad). */
  onSelectDir?(dir: PadDir): void;
  onStart(): void;
  /** Weapon picked (click, W / Shift+W, or gamepad X). */
  onWeapon?(kind: string): void;
  /** Night towns: light (true, costs one oil) or leave dark (false) a lamp post. */
  onLamp?(lampId: number, lit: boolean): void;
}

const STYLE = `
.vd-plan { position: fixed; inset: 0; z-index: 90; display: none; pointer-events: none; color: #3b2418;
  font: 600 14px system-ui, sans-serif; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.vd-plan.show { display: block; }
.vd-plan .top { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 96vw; pointer-events: none; }
.vd-plan .banner { position: relative; pointer-events: auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
  background: #f3e3d0ee; border: 2px solid #3b2418; border-radius: 10px; padding: 6px 12px; max-width: 96vw; box-sizing: border-box; }
.vd-plan .banner .title { font-weight: 800; font-size: 16px; }
.vd-plan .pips { letter-spacing: 2px; }
.vd-plan .pip.on { color: #c47a00; }
.vd-plan .oil { letter-spacing: 1px; white-space: nowrap; }
.vd-plan .oil .drop.on { color: #e08a00; }
.vd-plan .assigned { font-weight: 500; font-size: 13px; opacity: 0.85; }
.vd-plan .card.pad-active { border-color: #c47a00; box-shadow: 0 0 0 3px #ffd75e; }
.vd-plan .hint { background: #3b2418cc; color: #f3e3d0; padding: 4px 12px; border-radius: 6px; font-weight: 500; white-space: nowrap; }
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
.vd-plan .weapons { flex: 1 0 100%; display: flex; gap: 6px; align-items: center; justify-content: center; flex-wrap: wrap; font-size: 13px; }
.vd-plan .weapons .wl { font-weight: 800; }
.vd-plan .wpn { background: #fff7ea; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; }
.vd-plan .wpn.sel { background: #ffd75e; }
.vd-plan .wpn:disabled { opacity: 0.55; cursor: not-allowed; }
.vd-plan .wpn .wh { display: none; font-size: 11px; font-weight: 500; color: #b8322c; }
.vd-plan .wpn:focus .wh, .vd-plan .wpn:hover .wh { display: inline; }
@media (max-width: 600px) {
  .vd-plan .wpn .wn { display: none; }
  .vd-plan .wpn:focus .wn, .vd-plan .wpn:hover .wn { display: inline; }
  .vd-plan .weapons .wl { display: none; }
}
@media (max-height: 420px) {
  .vd-plan .weapons { gap: 4px; font-size: 12px; }
  .vd-plan .wpn { padding: 0 6px; }
  .vd-plan .banner { padding: 4px 10px; gap: 8px; }
  .vd-plan .banner .title { font-size: 14px; }
  .vd-plan .start { padding: 3px 14px; font-size: 14px; }
  .vd-plan .top { gap: 3px; }
  .vd-plan .hint { padding: 2px 10px; font-size: 12px; }
  .vd-plan .card { padding: 4px 6px; }
  .vd-plan .card .head { margin-bottom: 3px; font-size: 13px; }
  .vd-plan .opt { width: 120px; flex-basis: 120px; padding: 3px 4px; }
  .vd-plan .opt .ds { font-size: 10px; }
}
`;

interface Opt {
  /** Role kind, 'plain', or 'dark' / 'light' for a lamp post. */
  key: string;
  enabled: boolean;
  el: HTMLButtonElement;
  act: () => void;
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
  /** Gamepad: 'map' moves between houses, 'card' moves between the selected house's roles. */
  private padMode: 'map' | 'card' = 'map';
  private shownAt = 0;
  private raf: number | null = null;
  private readonly pad = new PadNav();
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
      this.pad.reset(); // anything held must be released before it counts
      this.padMode = 'map';
      this.el.classList.add('show');
      this.startPadLoop();
    } else if (key === this.viewKey) {
      return;
    }
    const prev = this.view;
    this.view = view;
    this.viewKey = key;
    const sameTarget = prev?.selected?.id === view.selected?.id && prev?.selected?.role === view.selected?.role
      && prev?.lamp?.id === view.lamp?.id && prev?.lamp?.lit === view.lamp?.lit;
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
    banner.querySelector('.start')!.prepend(glyph('start', true));
    if (v.oil) banner.querySelector('.pts')!.after(this.buildOil(v.oil));
    if (v.weapons && v.weapons.length > 0) banner.appendChild(this.buildWeapons(v.weapons, v.selectedWeapon));
    const top = document.createElement('div');
    top.className = 'top';
    top.appendChild(banner);
    this.el.appendChild(top);

    if (!v.selected && !v.lamp) this.padMode = 'map';
    top.appendChild(this.padPrompts(v));
    if (v.lamp) return this.buildLampCard(v.lamp, resetFocus);
    if (!v.selected) {
      // Sits in the same column as the banner, so it always flows below the whole banner (weapon row included).
      const hint = document.createElement('div');
      hint.className = 'hint kb-only';
      hint.textContent = v.oil ? 'Tap a house or a lamp post' : 'Tap a house to give it a role';
      top.appendChild(hint);
      return;
    }

    const sel = v.selected;
    const refund = sel.role ? (v.roles.find((r) => r.kind === sel.role)?.cost ?? 0) : 0;
    const card = document.createElement('div');
    card.className = `card${this.padMode === 'card' ? ' pad-active' : ''}`;
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = sel.label;
    const row = document.createElement('div');
    row.className = 'opts';
    card.append(head, row);

    const plain = this.makeOpt(row, true, sel.role === null, '', 'Plain house', '', '');
    this.opts.push({ key: 'plain', enabled: true, el: plain, act: () => this.assign(null) });
    plain.addEventListener('click', () => this.assign(null));
    v.roles.forEach((r, i) => {
      const affordable = r.cost <= v.pointsLeft + refund || sel.role === r.kind;
      const enabled = !r.locked && affordable;
      const note = r.locked ? `🔒 ${r.lockHint ?? 'Locked'}` : !affordable ? 'Not enough points' : '';
      const btn = this.makeOpt(row, enabled, sel.role === r.kind, `${i + 1}. ${r.icon}`,
        r.name, `${r.cost} pt${r.cost === 1 ? '' : 's'} · ${r.description}`, note);
      btn.addEventListener('click', () => this.assign(r.kind));
      this.opts.push({ key: r.kind, enabled, el: btn, act: () => this.assign(r.kind) });
    });
    this.el.appendChild(card);

    if (resetFocus || this.focus >= this.opts.length) this.focus = this.currentOpt();
    this.applyFocus();
  }

  /** Oil pips in the banner (night towns), like the points: one per lamp post that can still be lit. */
  private buildOil(oil: { left: number; total: number }): HTMLElement {
    const el = document.createElement('span');
    el.className = 'oil';
    el.title = 'Lamp oil';
    el.innerHTML = Array.from({ length: oil.total }, (_, i) => (i < oil.left ? '<span class="drop on">●</span>' : '<span class="drop">○</span>')).join('');
    el.append(` ${oil.left}/${oil.total} oil`);
    return el;
  }

  /** The selected dark lamp post: leave it dark, or light it for one oil. */
  private buildLampCard(lamp: NonNullable<PlanningView['lamp']>, resetFocus: boolean): void {
    const card = document.createElement('div');
    card.className = `card${this.padMode === 'card' ? ' pad-active' : ''}`;
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = lamp.label;
    const row = document.createElement('div');
    row.className = 'opts';
    card.append(head, row);
    const choose = (lit: boolean) => () => this.lightLamp(lamp.id, lit);
    const dark = this.makeOpt(row, true, !lamp.lit, '0. 🌑', 'Leave dark', '', '');
    dark.addEventListener('click', choose(false));
    this.opts.push({ key: 'dark', enabled: true, el: dark, act: choose(false) });
    const canLight = lamp.lit || lamp.canLight;
    const light = this.makeOpt(row, canLight, lamp.lit, '1. 🏮', 'Light it', '1 oil', canLight ? '' : 'No oil');
    light.addEventListener('click', choose(true));
    this.opts.push({ key: 'light', enabled: canLight, el: light, act: choose(true) });
    this.el.appendChild(card);
    if (resetFocus || this.focus >= this.opts.length) this.focus = this.currentOpt();
    this.applyFocus();
  }

  /** Index of the option matching the selection's current state. */
  private currentOpt(): number {
    const v = this.view;
    const key = v?.lamp ? (v.lamp.lit ? 'light' : 'dark') : (v?.selected?.role ?? 'plain');
    return Math.max(0, this.opts.findIndex((o) => o.key === key));
  }

  private buildWeapons(weapons: PlanningWeaponOption[], selectedKind: string | undefined): HTMLElement {
    const row = document.createElement('div');
    row.className = 'weapons';
    const label = document.createElement('span');
    label.className = 'wl';
    label.textContent = 'Weapon:';
    row.appendChild(label);
    row.appendChild(glyph('x', true));
    for (const w of weapons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wpn' + (w.kind === selectedKind ? ' sel' : '');
      b.disabled = w.locked;
      b.dataset.kind = w.kind;
      b.title = w.locked ? (w.lockHint ?? 'Locked') : `${w.name}: ${w.description}`;
      b.setAttribute('aria-pressed', String(w.kind === selectedKind));
      b.innerHTML = '<span class="wi"></span><span class="wn"></span><span class="wh"></span>';
      b.querySelector('.wi')!.textContent = w.locked ? '🔒' : w.icon;
      b.querySelector('.wn')!.textContent = w.name;
      b.querySelector('.wh')!.textContent = w.locked ? (w.lockHint ?? 'Locked') : '';
      b.addEventListener('click', () => this.pickWeapon(w.kind));
      row.appendChild(b);
    }
    return row;
  }

  private pickWeapon(kind: string): void {
    if (!this._visible) return;
    const w = this.view?.weapons?.find((x) => x.kind === kind);
    if (!w || w.locked) return;
    this.cb.onWeapon?.(kind);
  }

  private cycleWeapon(delta: 1 | -1): void {
    const v = this.view;
    const list = v?.weapons?.filter((w) => !w.locked) ?? [];
    if (!v || list.length === 0) return;
    const i = list.findIndex((w) => w.kind === v.selectedWeapon);
    const next = i < 0 ? list[0] : list[(i + delta + list.length) % list.length];
    if (next.kind !== v.selectedWeapon) this.cb.onWeapon?.(next.kind);
  }

  private makeOpt(row: HTMLElement, enabled: boolean, current: boolean,
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
    this.opts.forEach((o, i) => o.el.classList.toggle('focus', this.padMode === 'card' && i === this.focus));
  }

  private padPrompts(v: PlanningView): HTMLElement {
    if (this.padMode === 'card') {
      return promptBar([[['dpad', 'stick'], v.lamp ? 'Choose' : 'Role'], ['a', v.lamp ? 'OK' : 'Assign'], ['b', 'Back'], ['start', 'Start']]);
    }
    const items: Parameters<typeof promptBar>[0] = [[['dpad', 'stick'], v.selected || v.lamp ? 'Move' : v.oil ? 'Choose' : 'Choose a house']];
    if (v.selected) items.push(['a', 'Set role']);
    else if (v.lamp) items.push(['a', 'Light']);
    if (v.weapons?.some((w) => !w.locked)) items.push(['x', 'Weapon']);
    items.push(['start', 'Start']);
    return promptBar(items);
  }

  private setPadMode(mode: 'map' | 'card'): void {
    if (this.padMode === mode) return;
    this.padMode = mode;
    if (this.view) this.build(false);
  }

  // ------------------------------------------------------------ actions

  private assign(role: RoleKind | null): void {
    const sel = this.view?.selected;
    if (!this._visible || !sel) return;
    this.cb.onAssign(sel.id, role);
  }

  private lightLamp(id: number, lit: boolean): void {
    if (!this._visible || this.view?.lamp?.id !== id) return;
    this.cb.onLamp?.(id, lit);
  }

  private assignOpt(o: Opt | undefined): void {
    if (o?.enabled) o.act();
  }

  private guardOpen(): boolean {
    return now() - this.shownAt >= PLANNING_INPUT_GUARD_MS;
  }

  // ------------------------------------------------------------ keyboard

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'w' || k === 'W') {
      if (!this.view?.weapons?.length) return;
      e.preventDefault();
      if (this.guardOpen() && !e.repeat) this.cycleWeapon(e.shiftKey || k === 'W' ? -1 : 1);
      return;
    }
    const handled = /^[0-4]$/.test(k) || ['ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Enter'].includes(k);
    if (!handled) return;
    e.preventDefault();
    if (!this.guardOpen() || e.repeat) return;
    if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) this.cb.onSelectNext(-1);
    else if (k === 'ArrowRight' || k === 'Tab') this.cb.onSelectNext(1);
    else if (k === 'Enter') this.cb.onStart();
    else if (k === '0' || k === 'Backspace') this.assignOpt(this.opts[0]);
    else this.assignOpt(this.opts[Number(k)]); // opts[0] is "Plain house" (or "Leave dark"), so 1..4 line up with roles (1 = "Light it")
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
    const f = this.pad.poll(now());
    if (!this.guardOpen()) return;
    const p = f.pressed;
    if (p.has('start') || p.has('y')) return this.cb.onStart();
    if (p.has('x')) this.cycleWeapon(1);
    if (p.has('lb') || p.has('rb')) {
      this.setPadMode('map');
      this.cb.onSelectNext(p.has('lb') ? -1 : 1);
      return;
    }
    if (this.padMode === 'card' && (this.view?.selected || this.view?.lamp)) {
      if (f.dir === 'left' || f.dir === 'right') {
        this.focus = Math.min(this.opts.length - 1, Math.max(0, this.focus + (f.dir === 'left' ? -1 : 1)));
        this.applyFocus();
      }
      if (p.has('a') && this.opts[this.focus]?.enabled) {
        this.padMode = 'map';
        const before = this.viewKey;
        this.assignOpt(this.opts[this.focus]);
        if (this.viewKey === before && this.view) this.build(false); // same role re-picked: still leave the card
      } else if (p.has('b')) this.setPadMode('map');
      return;
    }
    if (f.dir) {
      if (this.cb.onSelectDir) this.cb.onSelectDir(f.dir);
      else if (f.dir === 'left' || f.dir === 'right') this.cb.onSelectNext(f.dir === 'left' ? -1 : 1);
    }
    if (p.has('a') && (this.view?.selected || this.view?.lamp)) {
      this.focus = this.currentOpt();
      this.setPadMode('card');
    }
  }
}
