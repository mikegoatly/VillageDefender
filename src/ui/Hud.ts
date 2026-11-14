// DOM HUD: knight HP, wave, buildings, kills, incoming-wave warning, end-of-level panel.
// DOM keeps text crisp and independent of camera zoom.

import type { Side } from '../sim/map';

/** Structural view of the World the HUD needs (keeps the HUD independent of World internals). */
export interface HudWorld {
  status: 'playing' | 'won' | 'lost';
  lossReason: 'knight' | 'town' | null;
  wave: number;
  totalWaves: number;
  time: number;
  kills: number;
  stars: number;
  players: { hp: number; maxHp: number }[];
  buildings: { id: number; hp: number; maxHp: number; ruined: boolean }[];
  knightLevel: number;
  xp: number;
  xpToNext: number;
  rookies: number;
  rookieCap: number;
}

export interface HudCallbacks {
  onRetry: () => void;
  onNewTown: () => void;
}

const STYLE = `
.vd-hud { position: fixed; inset: 0; pointer-events: none; font: 600 15px system-ui, sans-serif; color: #3b2418; }
.vd-hud .bar { position: absolute; top: max(10px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; gap: 12px; align-items: center; background: #f3e3d0dd; padding: 6px 12px; border-radius: 8px;
  max-width: min(560px, 96vw); white-space: nowrap; overflow: hidden; }
.vd-hud .lv { font-weight: 800; flex: none; }
.vd-hud .xp { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: #7a4a3666; }
.vd-hud .xp > div { height: 100%; width: 0; background: #ffd75e; transition: width 120ms; }
.vd-hud .bar.flash { animation: vd-flash 400ms ease-out; }
@keyframes vd-flash { 0% { box-shadow: 0 0 0 0 #ff2a1aff; } 30% { box-shadow: 0 0 14px 6px #ff2a1acc; } 100% { box-shadow: 0 0 0 0 #ff2a1a00; } }
.vd-hud .hp { width: 120px; height: 12px; background: #7a4a36; border-radius: 6px; overflow: hidden; flex: none; }
.vd-hud .hp > div { height: 100%; background: #d9534f; transition: width 120ms; }
.vd-hud .bld.low { color: #c4221a; }
@media (max-width: 600px) {
  .vd-hud { font-size: 12px; }
  .vd-hud .bar { gap: 6px; padding: 4px 8px 9px; }
  .vd-hud .hp { width: 80px; height: 10px; }
}
.vd-hud .warn { position: absolute; padding: 6px 12px; background: #b8322ccc; color: #fff; border-radius: 6px;
  font-size: 16px; opacity: 0; transition: opacity 200ms; }
.vd-hud .warn.show { opacity: 1; }
.vd-hud .warn.top { top: 56px; left: 50%; transform: translateX(-50%); }
.vd-hud .warn.bottom { bottom: 16px; left: 50%; transform: translateX(-50%); }
.vd-hud .warn.left { left: 12px; top: 50%; transform: translateY(-50%); }
.vd-hud .warn.right { right: 12px; top: 50%; transform: translateY(-50%); }
.vd-hud .over { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: #3b241866; pointer-events: auto; }
.vd-hud .over.show { display: flex; }
.vd-hud .over > div { background: #f3e3d0; padding: 16px 28px; border-radius: 10px; text-align: center;
  max-height: 90vh; overflow: auto; box-sizing: border-box; }
.vd-hud .over h2 { margin: 0 0 4px; }
.vd-hud .stars { font-size: 48px; line-height: 1.1; letter-spacing: 4px; }
.vd-hud .star { display: inline-block; color: #b9a58f; }
.vd-hud .star.on { color: #ffd75e; text-shadow: 0 0 2px #3b2418, 1px 1px 0 #3b2418, -1px -1px 0 #3b2418, 1px -1px 0 #3b2418, -1px 1px 0 #3b2418;
  animation: vd-pop 250ms ease-out both; }
@keyframes vd-pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .vd-hud .star.on, .vd-hud .bar.flash { animation: none; } }
.vd-hud .rule { font-size: 12px; opacity: 0.8; margin: 2px 0 8px; }
.vd-hud .stats { margin: 0 0 8px; line-height: 1.4; }
.vd-hud .over button { margin: 4px 6px 0; font: inherit; padding: 8px 18px; border-radius: 6px; border: 2px solid #3b2418;
  background: #ffd75e; cursor: pointer; }
`;

const ARROW: Record<Side, string> = { top: '▲', bottom: '▼', left: '◀', right: '▶' };
const MAX_STARS = 3;

function titleFor(w: HudWorld): string {
  if (w.status === 'won') return 'Village saved!';
  return w.lossReason === 'town' ? 'The village is lost' : 'The knight has fallen';
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private el: HTMLDivElement;
  private bar: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private waveEl: HTMLSpanElement;
  private bldEl: HTMLSpanElement;
  private killsEl: HTMLSpanElement;
  private lvEl: HTMLSpanElement;
  private rookiesEl: HTMLSpanElement;
  private xpFill: HTMLDivElement;
  private warns: Record<Side, HTMLDivElement>;
  private over: HTMLDivElement;
  private panel: HTMLDivElement;
  private warnTimer?: number;
  private flashTimer?: number;
  private prevStanding: number | null = null;
  private ended = false;

  private onKey = (e: KeyboardEvent) => {
    if (!this.ended || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') this.callbacks.onRetry();
    else if (k === 'n') this.callbacks.onNewTown();
  };

  constructor(root: HTMLElement, private callbacks: HudCallbacks) {
    if (!document.getElementById('vd-hud-style')) {
      const s = document.createElement('style');
      s.id = 'vd-hud-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'vd-hud';
    this.el.innerHTML = `
      <div class="bar"><span class="lv"></span><div class="hp"><div></div></div><span class="wave"></span><span class="bld"></span><span class="rookies"></span><span class="kills"></span><div class="xp"><div></div></div></div>
      ${(['top', 'bottom', 'left', 'right'] as Side[]).map((s) => `<div class="warn ${s}"></div>`).join('')}
      <div class="over"><div class="panel"></div></div>`;
    root.appendChild(this.el);
    this.bar = this.el.querySelector('.bar')!;
    this.hpFill = this.el.querySelector('.hp > div')!;
    this.waveEl = this.el.querySelector('.wave')!;
    this.bldEl = this.el.querySelector('.bld')!;
    this.killsEl = this.el.querySelector('.kills')!;
    this.lvEl = this.el.querySelector('.lv')!;
    this.rookiesEl = this.el.querySelector('.rookies')!;
    this.xpFill = this.el.querySelector('.xp > div')!;
    this.warns = {
      top: this.el.querySelector('.warn.top')!, bottom: this.el.querySelector('.warn.bottom')!,
      left: this.el.querySelector('.warn.left')!, right: this.el.querySelector('.warn.right')!,
    };
    this.over = this.el.querySelector('.over')!;
    this.panel = this.el.querySelector('.panel')!;
    window.addEventListener('keydown', this.onKey);
  }

  update(world: HudWorld) {
    const p = world.players[0];
    if (p) this.hpFill.style.width = `${(100 * p.hp) / p.maxHp}%`;

    const finalWave = world.totalWaves > 0 && world.wave >= world.totalWaves;
    this.waveEl.textContent = finalWave ? 'Final wave!' : `Wave ${world.wave}/${world.totalWaves}`;

    const total = world.buildings.length;
    const standing = world.buildings.filter((b) => !b.ruined).length;
    this.bldEl.textContent = `⌂ ${standing}/${total}`;
    this.bldEl.classList.toggle('low', standing * 3 < total * 2);
    if (this.prevStanding !== null && standing < this.prevStanding) this.flash();
    this.prevStanding = standing;

    this.killsEl.textContent = `Kills ${world.kills}`;
    this.lvEl.textContent = `Lv ${world.knightLevel}`;
    const xpFrac = world.xpToNext > 0 ? Math.min(1, Math.max(0, world.xp / world.xpToNext)) : 0;
    this.xpFill.style.width = `${100 * xpFrac}%`;
    this.rookiesEl.textContent = `⛑ ${world.rookies}/${world.rookieCap}`;

    const ended = world.status !== 'playing';
    if (ended && !this.ended) {
      this.buildPanel(world, standing, total);
      // Pending wave warnings are irrelevant once the level is over.
      for (const s of Object.keys(this.warns) as Side[]) this.warns[s].classList.remove('show');
      clearTimeout(this.warnTimer);
    }
    if (!ended && this.ended) this.panel.replaceChildren();
    this.ended = ended;
    this.over.classList.toggle('show', ended);
  }

  private flash() {
    this.bar.classList.remove('flash');
    void this.bar.offsetWidth; // restart the animation
    this.bar.classList.add('flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.bar.classList.remove('flash'), 400);
  }

  private buildPanel(world: HudWorld, standing: number, total: number) {
    const stars = Array.from({ length: MAX_STARS }, (_, i) => {
      const on = i < world.stars;
      const delay = on ? ` style="animation-delay:${i * 300}ms"` : '';
      return `<span class="star ${on ? 'on' : 'off'}"${delay}>★</span>`;
    }).join('');
    const cleared = world.status === 'won' ? world.totalWaves : Math.max(0, world.wave - 1);
    this.panel.innerHTML = `
      <h2>${titleFor(world)}</h2>
      <div class="stars">${stars}</div>
      <div class="rule">★★★ all buildings standing · ★★ two-thirds · ★ at least one</div>
      <div class="stats">
        <div class="s-bld">Buildings standing ${standing}/${total}</div>
        <div class="s-waves">Waves cleared ${cleared}</div>
        <div class="s-kills">Kills ${world.kills}</div>
        <div class="s-time">Time ${formatTime(world.time)}</div>
      </div>
      <button class="retry">Retry (R)</button><button class="newtown">New town (N)</button>`;
    this.panel.querySelector('.retry')!.addEventListener('click', () => this.callbacks.onRetry());
    this.panel.querySelector('.newtown')!.addEventListener('click', () => this.callbacks.onNewTown());
  }

  warn(wave: number, sides: Side[]) {
    for (const s of Object.keys(this.warns) as Side[]) this.warns[s].classList.remove('show');
    for (const s of sides) {
      this.warns[s].textContent = `${ARROW[s]} Wave ${wave}`;
      this.warns[s].classList.add('show');
    }
    clearTimeout(this.warnTimer);
    this.warnTimer = window.setTimeout(() => {
      for (const s of sides) this.warns[s].classList.remove('show');
    }, 3500);
  }

  destroy() {
    clearTimeout(this.warnTimer);
    clearTimeout(this.flashTimer);
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
