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
  /** Boss health (omit or null when no boss is alive). */
  boss?: { name: string; hp: number; maxHp: number } | null;
  /** Meta-progression results, shown when the run ended (may arrive a frame after the end). */
  endExtras?: {
    coins: number;
    wallet: number;
    achievements: { name: string; description: string }[];
    unlocks: string[];
  };
}

export interface HudCallbacks {
  onRetry: () => void;
  onNewTown: () => void;
  /** When given, the end panel also offers 'Menu (M)'. */
  onMenu?: () => void;
}

const STYLE = `
.vd-hud { position: fixed; inset: 0; pointer-events: none; font: 600 15px system-ui, sans-serif; color: #3b2418; }
/* The menu hides the HUD entirely. */
.vd-menu-open .vd-hud { display: none; }
/* The planning banner replaces the HUD pill until the town starts. */
.vd-planning .vd-hud .bar { display: none; }
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
.vd-hud .boss { position: absolute; top: calc(max(10px, env(safe-area-inset-top)) + 40px); left: 50%; width: min(560px, 70vw);
  transform: translate(-50%, -12px); opacity: 0; display: none; transition: opacity 300ms, transform 300ms; text-align: center; }
.vd-hud .boss.show { display: block; }
.vd-hud .boss.in { opacity: 1; transform: translate(-50%, 0); }
.vd-hud .boss .bname { font-weight: 800; letter-spacing: 2px; color: #fff; text-shadow: 0 1px 2px #000, 0 0 4px #000; margin-bottom: 2px; }
.vd-hud .boss .btrack { position: relative; height: 16px; background: #2a1410; border: 2px solid #1a0b08; border-radius: 8px; overflow: hidden; }
.vd-hud .boss .btrail, .vd-hud .boss .bfill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; }
.vd-hud .boss .btrail { background: #e8928a; transition: width 300ms ease-out 400ms; }
.vd-hud .boss .bfill { background: #b8322c; transition: width 120ms; }
.vd-hud .boss-banner { position: absolute; top: 35%; left: 50%; transform: translate(-50%, -50%); padding: 10px 24px;
  background: #b8322ccc; color: #fff; border-radius: 8px; font-size: 26px; font-weight: 800; text-align: center;
  opacity: 0; transition: opacity 300ms; white-space: nowrap; max-width: 96vw; box-sizing: border-box; }
.vd-hud .boss-banner.show { opacity: 1; }
@media (max-width: 600px) {
  .vd-hud .boss { width: 70vw; }
  .vd-hud .boss .bname { font-size: 11px; letter-spacing: 1px; }
  .vd-hud .boss .btrack { height: 12px; }
  .vd-hud .boss-banner { font-size: 16px; padding: 6px 12px; white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .vd-hud .boss, .vd-hud .boss-banner { transition: none; }
  .vd-hud .boss .btrail, .vd-hud .boss .bfill { transition: none; }
}
.vd-hud .rule { font-size: 12px; opacity: 0.8; margin: 2px 0 8px; }
.vd-hud .stats { margin: 0 0 8px; line-height: 1.4; }
.vd-hud .extras { margin: 0 0 8px; line-height: 1.4; font-size: 14px; }
.vd-hud .extras .coins { font-weight: 800; }
.vd-hud .extras .ach { color: #8a5a00; }
.vd-hud .extras .unlock { color: #2f7a2a; font-weight: 800; }
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
  private bossEl: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossTrail: HTMLDivElement;
  private bossBanner: HTMLDivElement;
  private bossVisible = false;
  private bossBannerTimer?: number;
  private warnTimer?: number;
  private flashTimer?: number;
  private prevStanding: number | null = null;
  private ended = false;
  private extrasShown = false;

  private onKey = (e: KeyboardEvent) => {
    if (!this.ended || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') this.callbacks.onRetry();
    else if (k === 'n') this.callbacks.onNewTown();
    else if (k === 'm' && this.callbacks.onMenu) this.callbacks.onMenu();
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
      <div class="boss"><div class="bname"></div><div class="btrack"><div class="btrail"></div><div class="bfill"></div></div></div>
      <div class="boss-banner">The Orc Warlord approaches!</div>
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
    this.bossEl = this.el.querySelector('.boss')!;
    this.bossName = this.el.querySelector('.bname')!;
    this.bossFill = this.el.querySelector('.bfill')!;
    this.bossTrail = this.el.querySelector('.btrail')!;
    this.bossBanner = this.el.querySelector('.boss-banner')!;
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

    this.updateBoss(world.boss ?? null);

    const ended = world.status !== 'playing';
    if (ended && !this.ended) {
      this.buildPanel(world, standing, total);
      // Pending wave warnings are irrelevant once the level is over.
      for (const s of Object.keys(this.warns) as Side[]) this.warns[s].classList.remove('show');
      clearTimeout(this.warnTimer);
    }
    if (!ended && this.ended) this.panel.replaceChildren();
    if (ended && world.endExtras && !this.extrasShown) this.renderExtras(world.endExtras);
    if (!ended) this.extrasShown = false;
    this.ended = ended;
    this.over.classList.toggle('show', ended);
  }

  private updateBoss(boss: HudWorld['boss']) {
    if (!boss || boss.hp <= 0 || boss.maxHp <= 0) {
      if (this.bossVisible) {
        this.bossVisible = false;
        this.bossEl.classList.remove('show', 'in');
      }
      return;
    }
    const pct = `${(100 * Math.min(1, Math.max(0, boss.hp / boss.maxHp))).toFixed(2)}%`;
    this.bossName.textContent = boss.name.toUpperCase();
    this.bossFill.style.width = pct;
    if (!this.bossVisible) {
      this.bossVisible = true;
      // Snap the trail to the fill on appearance so it does not animate up from nothing.
      this.bossTrail.style.transition = 'none';
      this.bossTrail.style.width = pct;
      void this.bossTrail.offsetWidth;
      this.bossTrail.style.transition = '';
      this.bossEl.classList.add('show');
      void this.bossEl.offsetWidth;
      this.bossEl.classList.add('in');
      this.bossBanner.textContent = `The ${boss.name} approaches!`;
      this.bossBanner.classList.add('show');
      clearTimeout(this.bossBannerTimer);
      this.bossBannerTimer = window.setTimeout(() => this.bossBanner.classList.remove('show'), 2500);
    } else {
      this.bossTrail.style.width = pct; // CSS delay (400 ms) makes the trail catch up
    }
  }

  private flash() {
    this.bar.classList.remove('flash');
    void this.bar.offsetWidth; // restart the animation
    this.bar.classList.add('flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.bar.classList.remove('flash'), 400);
  }

  private buildPanel(world: HudWorld, standing: number, total: number) {
    this.extrasShown = false;
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
      <div class="extras"></div>
      <button class="retry">Retry (R)</button><button class="newtown">New town (N)</button>${this.callbacks.onMenu ? '<button class="menu">Menu (M)</button>' : ''}`;
    this.panel.querySelector('.retry')!.addEventListener('click', () => this.callbacks.onRetry());
    this.panel.querySelector('.newtown')!.addEventListener('click', () => this.callbacks.onNewTown());
    this.panel.querySelector('.menu')?.addEventListener('click', () => this.callbacks.onMenu?.());
  }

  private renderExtras(x: NonNullable<HudWorld['endExtras']>) {
    const box = this.panel.querySelector('.extras');
    if (!box) return;
    box.replaceChildren();
    const add = (cls: string, text: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      box.appendChild(d);
    };
    add('coins', `+${x.coins} coins (wallet ${x.wallet})`);
    for (const a of x.achievements) add('ach', `Achievement: ${a.name} — ${a.description}`);
    if (x.unlocks.length > 0) add('unlock', `Unlocked: ${x.unlocks.join(', ')}`);
    this.extrasShown = true;
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
    clearTimeout(this.bossBannerTimer);
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
