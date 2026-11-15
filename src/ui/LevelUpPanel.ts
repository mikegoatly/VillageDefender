// Level-up overlay: pick 1 of 3 upgrade cards via mouse/touch, keyboard or gamepad.
// DOM-based like the HUD so text stays crisp. Landscape-first (cards in a row).

import type { UpgradeOffer, UpgradePool } from '../data/upgrades';
import { PadNav } from '../input/PadNav';
import { promptBar } from './prompts';

/** Input is ignored this long after show() so held attack taps / buttons cannot pick a card. */
export const INPUT_GUARD_MS = 300;

const POOL_LABEL: Record<UpgradePool, string> = { knight: 'Knight', army: 'Army', town: 'Town' };
const POOL_COLOR: Record<UpgradePool, string> = { knight: '#ffd75e', army: '#7fb3e6', town: '#9fd27a' };

const STYLE = `
.vd-levelup { position: fixed; inset: 0; z-index: 100; display: none; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; background: #3b241899; pointer-events: auto; color: #3b2418;
  font: 600 14px system-ui, sans-serif; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.vd-levelup.show { display: flex; }
.vd-levelup h2 { margin: 0; color: #f3e3d0; font-size: 28px; text-shadow: 0 2px 0 #3b2418; }
.vd-levelup .sub { color: #f3e3d0; opacity: 0.9; margin-bottom: 4px; }
.vd-levelup .cards { display: flex; gap: 14px; justify-content: center; align-items: stretch; max-height: 80vh; }
.vd-levelup .card { width: 30vw; max-width: 220px; max-height: 80vh; box-sizing: border-box; overflow: hidden;
  background: #f3e3d0; border: 3px solid #3b2418; border-radius: 10px; padding: 10px 12px; cursor: pointer;
  display: flex; flex-direction: column; gap: 6px; text-align: center; align-items: center;
  animation: vd-card-in 200ms ease-out both; animation-delay: calc(var(--i, 0) * 200ms); }
.vd-levelup .card.focus { outline: 4px solid #ffd75e; outline-offset: 2px; box-shadow: 0 0 14px 4px #ffd75ecc; transform: translateY(-3px); }
.vd-levelup .badge { display: inline-block; padding: 1px 10px; border-radius: 10px; border: 2px solid #3b2418;
  font-size: 12px; font-weight: 800; }
.vd-levelup .name { font-weight: 800; font-size: 16px; }
.vd-levelup .desc { font-weight: 500; font-size: 13px; flex: 1; }
.vd-levelup .pips { letter-spacing: 3px; font-size: 14px; }
.vd-levelup .pip.next { color: #c47a00; text-shadow: 0 0 3px #ffd75e; }
@keyframes vd-card-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .vd-levelup .card { animation: none; } }
@media (max-height: 420px) {
  .vd-levelup h2 { font-size: 22px; }
  .vd-levelup .card { padding: 6px 8px; gap: 3px; }
  .vd-levelup .desc { font-size: 12px; }
}
`;

function now(): number {
  return performance.now();
}

export class LevelUpPanel {
  private readonly el: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly cardsEl: HTMLDivElement;
  private cards: HTMLElement[] = [];
  private offers: UpgradeOffer[] = [];
  private focus = 1;
  private shownAt = 0;
  private done = false;
  private raf: number | null = null;
  private readonly pad = new PadNav();
  private _visible = false;

  constructor(root: HTMLElement, private readonly onChoose: (index: number) => void) {
    if (!document.getElementById('vd-levelup-style')) {
      const s = document.createElement('style');
      s.id = 'vd-levelup-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'vd-levelup';
    this.el.innerHTML = '<h2></h2><div class="sub">Choose an upgrade</div><div class="cards"></div>';
    this.titleEl = this.el.querySelector('h2')!;
    this.cardsEl = this.el.querySelector('.cards')!;
    this.el.appendChild(promptBar([[['dpad', 'stick'], 'Choose'], ['a', 'Pick']]));
    root.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
  }

  get visible(): boolean {
    return this._visible;
  }

  show(offers: UpgradeOffer[], knightLevel: number): void {
    if (this._visible && !this.done && sameOffers(this.offers, offers)) return;
    this.offers = offers.slice();
    this.done = false;
    this._visible = true;
    this.shownAt = now();
    this.focus = Math.min(1, Math.max(0, offers.length - 1));
    this.pad.reset(); // assume held until observed released
    this.titleEl.textContent = `Level ${knightLevel}!`;
    this.build();
    this.el.classList.add('show');
    this.startPadLoop();
  }

  hide(): void {
    this._visible = false;
    this.el.classList.remove('show');
    this.stopPadLoop();
  }

  destroy(): void {
    this.hide();
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }

  private build(): void {
    this.cardsEl.replaceChildren();
    this.cards = this.offers.map((o, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'button');
      card.dataset.index = String(i);
      card.style.setProperty('--i', String(i));
      const pips = Array.from({ length: o.max }, (_, k) => {
        if (k < o.level) return '<span class="pip on">●</span>';
        if (k === o.level) return '<span class="pip next">●</span>';
        return '<span class="pip off">○</span>';
      }).join('');
      card.innerHTML = `
        <span class="badge" style="background:${POOL_COLOR[o.pool]}">${POOL_LABEL[o.pool]}</span>
        <div class="name"></div><div class="desc"></div>
        <div class="pips" aria-label="Level ${o.level} to ${o.level + 1} of ${o.max}">${pips}</div>`;
      card.querySelector('.name')!.textContent = o.name;
      card.querySelector('.desc')!.textContent = o.description;
      card.addEventListener('pointerup', () => this.choose(i));
      card.addEventListener('click', () => this.choose(i));
      this.cardsEl.appendChild(card);
      return card;
    });
    this.applyFocus();
  }

  private applyFocus(): void {
    this.cards.forEach((c, i) => c.classList.toggle('focus', i === this.focus));
  }

  private moveFocus(d: number): void {
    if (this.cards.length === 0) return;
    this.focus = Math.min(this.cards.length - 1, Math.max(0, this.focus + d));
    this.applyFocus();
  }

  private guardOpen(): boolean {
    return now() - this.shownAt >= INPUT_GUARD_MS;
  }

  private choose(index: number): void {
    if (!this._visible || this.done || !this.guardOpen()) return;
    if (index < 0 || index >= this.offers.length) return;
    this.done = true;
    this.hide();
    this.onChoose(index);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const handled = /^[1-3]$/.test(k) || ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'a', 'A', 'd', 'D'].includes(k);
    if (!handled) return;
    e.preventDefault();
    if (!this.guardOpen() || e.repeat) return;
    if (/^[1-3]$/.test(k)) this.choose(Number(k) - 1);
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.moveFocus(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.moveFocus(1);
    else this.choose(this.focus);
  };

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
    if (f.dir === 'left') this.moveFocus(-1);
    else if (f.dir === 'right') this.moveFocus(1);
    if (f.pressed.has('a')) this.choose(this.focus);
  }
}

function sameOffers(a: UpgradeOffer[], b: UpgradeOffer[]): boolean {
  return a.length === b.length && a.every((o, i) => o.id === b[i].id && o.level === b[i].level);
}
