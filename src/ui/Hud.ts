// DOM HUD: knight HP, wave, kills, incoming-wave warning, game-over panel.
// DOM keeps text crisp and independent of camera zoom.

import type { Side } from '../sim/map';
import type { World } from '../sim/world';

const STYLE = `
.vd-hud { position: fixed; inset: 0; pointer-events: none; font: 600 15px system-ui, sans-serif; color: #3b2418; }
.vd-hud .bar { position: absolute; top: max(10px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; gap: 14px; align-items: center; background: #f3e3d0dd; padding: 6px 12px; border-radius: 8px; }
.vd-hud .hp { width: 160px; height: 12px; background: #7a4a36; border-radius: 6px; overflow: hidden; }
.vd-hud .hp > div { height: 100%; background: #d9534f; transition: width 120ms; }
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
.vd-hud .over > div { background: #f3e3d0; padding: 20px 28px; border-radius: 10px; text-align: center; }
.vd-hud .over button { margin-top: 12px; font: inherit; padding: 8px 18px; border-radius: 6px; border: 2px solid #3b2418;
  background: #ffd75e; cursor: pointer; }
`;

const ARROW: Record<Side, string> = { top: '▲', bottom: '▼', left: '◀', right: '▶' };

export class Hud {
  private el: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private info: HTMLSpanElement;
  private warns: Record<Side, HTMLDivElement>;
  private over: HTMLDivElement;
  private overText: HTMLParagraphElement;
  private warnTimer?: number;

  constructor(root: HTMLElement, onRestart: () => void) {
    if (!document.getElementById('vd-hud-style')) {
      const s = document.createElement('style');
      s.id = 'vd-hud-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'vd-hud';
    this.el.innerHTML = `
      <div class="bar"><div class="hp"><div></div></div><span class="info"></span></div>
      ${(['top', 'bottom', 'left', 'right'] as Side[]).map((s) => `<div class="warn ${s}"></div>`).join('')}
      <div class="over"><div><h2>The knight has fallen</h2><p></p><button>Try again (R)</button></div></div>`;
    root.appendChild(this.el);
    this.hpFill = this.el.querySelector('.hp > div')!;
    this.info = this.el.querySelector('.info')!;
    this.warns = {
      top: this.el.querySelector('.warn.top')!, bottom: this.el.querySelector('.warn.bottom')!,
      left: this.el.querySelector('.warn.left')!, right: this.el.querySelector('.warn.right')!,
    };
    this.over = this.el.querySelector('.over')!;
    this.overText = this.el.querySelector('.over p')!;
    this.el.querySelector('button')!.addEventListener('click', onRestart);
  }

  update(world: World) {
    const p = world.players[0];
    if (p) this.hpFill.style.width = `${(100 * p.hp) / p.maxHp}%`;
    this.info.textContent = `Wave ${world.wave} · Kills ${world.kills}`;
    const lost = world.status === 'lost';
    this.over.classList.toggle('show', lost);
    if (lost) this.overText.textContent = `Survived ${Math.floor(world.time)}s · wave ${world.wave} · ${world.kills} kills`;
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
    this.el.remove();
  }
}
