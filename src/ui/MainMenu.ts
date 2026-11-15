// Front-end menu (title, towns, shop, settings): a DOM overlay on top of the background town.
// Mouse/touch, keyboard and gamepad; same palette and input-guard conventions as LevelUpPanel.

import type { Profile } from '../meta/profile';
import { TOWNS } from '../data/towns';
import { SHOP, type ShopItem } from '../data/shop';
import { UPGRADES } from '../data/upgrades';
import { PadNav } from '../input/PadNav';
import { promptBar } from './prompts';

export type MenuScreen = 'title' | 'towns' | 'shop' | 'settings';
export interface AudioSettings { master: number; sfx: number; music: number; muted: boolean }
export interface MenuHost {
  profile(): Profile;
  audioSettings(): AudioSettings;
  setAudioSettings(p: Partial<AudioSettings>): void;
  /** Start that town (goes to planning). */
  onPlay(townId: string): void;
  /** Host resets the profile. */
  onResetProgress(): void;
  uiSound?(id: 'uiClick'): void;
}

/** Input is ignored this long after a screen change so held buttons cannot trigger anything. */
export const MENU_INPUT_GUARD_MS = 300;
const SLIDER_STEP = 5;
const MAX_STARS = 3;

const STYLE = `
.vd-menu { position: fixed; inset: 0; z-index: 90; display: none; align-items: center; justify-content: center;
  background: #3b2418cc; pointer-events: auto; color: #3b2418; font: 600 15px system-ui, sans-serif;
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  box-sizing: border-box; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.vd-menu.show { display: flex; flex-direction: column; gap: 8px; }
.vd-menu .vd-prompts { flex: none; }
.vd-menu .panel { background: #f3e3d0; border: 3px solid #3b2418; border-radius: 12px; padding: 16px 22px; box-sizing: border-box;
  width: min(640px, 100%); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); flex: 0 1 auto; min-height: 0; overflow-y: auto; text-align: center; }
.vd-menu h1 { margin: 0; font-size: 48px; line-height: 1.05; text-shadow: 0 2px 0 #ffd75e; }
.vd-menu h2 { margin: 0 0 8px; font-size: 24px; }
.vd-menu h3 { margin: 14px 0 6px; font-size: 16px; text-align: left; border-bottom: 2px solid #3b241833; }
.vd-menu .subtitle { margin: 4px 0 16px; opacity: 0.8; font-weight: 500; }
.vd-menu .stack { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.vd-menu button { font: inherit; padding: 8px 18px; border-radius: 6px; border: 2px solid #3b2418; background: #ffd75e;
  color: #3b2418; cursor: pointer; min-height: 36px; }
.vd-menu button.big { min-width: 220px; font-size: 18px; padding: 10px 24px; }
.vd-menu button:disabled { background: #d8c6b0; color: #7a6350; border-color: #7a6350; cursor: default; }
.vd-menu button.secondary { background: #f3e3d0; }
.vd-menu button:focus, .vd-menu input:focus, .vd-menu .focus { outline: 4px solid #ffd75e; outline-offset: 2px; box-shadow: 0 0 0 2px #3b2418, 0 0 12px 4px #ffd75ecc; }
.vd-menu .footer { margin-top: 18px; font-size: 12px; font-weight: 500; opacity: 0.7; }
.vd-menu .wallet { font-weight: 800; font-size: 18px; margin-bottom: 4px; }
.vd-menu .toast { min-height: 20px; font-weight: 800; color: #2f7a2a; }
.vd-menu .toast.bad { color: #c4221a; }
.vd-menu .row, .vd-menu .town { display: flex; align-items: center; gap: 10px; padding: 6px 8px; margin: 4px 0; text-align: left;
  background: #fff6; border-radius: 8px; }
.vd-menu .row .info, .vd-menu .town .info { flex: 1; min-width: 0; }
.vd-menu .row .name, .vd-menu .town .name { font-weight: 800; }
.vd-menu .row .desc, .vd-menu .town .desc { font-weight: 500; font-size: 13px; }
.vd-menu .row .price, .vd-menu .row .stacks, .vd-menu .row .state { font-size: 13px; white-space: nowrap; }
.vd-menu .row.owned { opacity: 0.75; }
.vd-menu .town.locked { opacity: 0.55; filter: grayscale(1); }
.vd-menu .star { color: #b9a58f; font-size: 20px; }
.vd-menu .star.on { color: #ffd75e; text-shadow: 1px 1px 0 #3b2418, -1px -1px 0 #3b2418, 1px -1px 0 #3b2418, -1px 1px 0 #3b2418; }
.vd-menu .setting { display: flex; align-items: center; gap: 10px; margin: 8px 0; text-align: left; }
.vd-menu .setting label { width: 70px; }
.vd-menu .setting input[type=range] { flex: 1; accent-color: #b8322c; }
.vd-menu .setting .val { width: 36px; text-align: right; }
.vd-menu .actions { display: flex; gap: 10px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.vd-menu .confirm { margin: 12px 0 0; color: #c4221a; }
@media (max-height: 420px), (max-width: 600px) {
  .vd-menu { font-size: 13px; }
  .vd-menu .panel { padding: 8px 12px; }
  .vd-menu h1 { font-size: 30px; }
  .vd-menu h2 { font-size: 18px; margin-bottom: 4px; }
  .vd-menu .subtitle { margin-bottom: 8px; }
  .vd-menu .stack { gap: 6px; }
  .vd-menu button.big { font-size: 15px; padding: 6px 18px; min-height: 30px; }
  .vd-menu button { min-height: 30px; padding: 5px 12px; }
  .vd-menu .footer { margin-top: 8px; }
}
`;

function now(): number {
  return performance.now();
}

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class MainMenu {
  private readonly el: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private screen: MenuScreen = 'title';
  private _visible = false;
  private shownAt = 0;
  private toast: { text: string; bad: boolean } | null = null;
  private toastTimer?: number;
  private confirmReset = false;
  private raf: number | null = null;
  private readonly pad = new PadNav();
  private prompts: HTMLDivElement;

  constructor(root: HTMLElement, private readonly host: MenuHost) {
    if (!document.getElementById('vd-menu-style')) {
      const s = document.createElement('style');
      s.id = 'vd-menu-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = mk('div', 'vd-menu');
    this.panel = mk('div', 'panel');
    this.el.appendChild(this.panel);
    this.panel.addEventListener('focusin', (e) => {
      for (const x of this.panel.querySelectorAll('.focus')) if (x !== e.target) x.classList.remove('focus');
      (e.target as HTMLElement).classList.add('focus');
    });
    this.prompts = mk('div');
    this.el.appendChild(this.prompts);
    root.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  get visible(): boolean {
    return this._visible;
  }

  show(screen: MenuScreen = 'title'): void {
    // Visible first: focus() does nothing on an element that is display: none.
    this._visible = true;
    this.el.classList.add('show');
    this.go(screen);
    this.startPadLoop();
  }

  hide(): void {
    this._visible = false;
    this.el.classList.remove('show');
    this.stopPadLoop();
  }

  destroy(): void {
    this.hide();
    clearTimeout(this.toastTimer);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el.remove();
  }

  // ------------------------------------------------------------------ navigation

  private go(screen: MenuScreen): void {
    this.screen = screen;
    this.confirmReset = false;
    this.toast = null;
    clearTimeout(this.toastTimer);
    this.shownAt = now();
    this.pad.reset(); // anything held must be released before it counts on the new screen
    this.render();
    this.focusAt(0);
  }

  private back(): void {
    if (this.screen === 'title') return;
    this.click();
    this.go('title');
  }

  private guardOpen(): boolean {
    return now() - this.shownAt >= MENU_INPUT_GUARD_MS;
  }

  private click(): void {
    this.host.uiSound?.('uiClick');
  }

  // ------------------------------------------------------------------ rendering

  private render(focusKey?: string): void {
    const scroll = this.panel.scrollTop;
    this.panel.replaceChildren();
    switch (this.screen) {
      case 'title': this.renderTitle(); break;
      case 'towns': this.renderTowns(); break;
      case 'shop': this.renderShop(); break;
      case 'settings': this.renderSettings(); break;
    }
    const hints: Parameters<typeof promptBar>[0] = [[['dpad', 'stick'], 'Move'], ['a', 'Select']];
    if (this.screen === 'settings') hints.splice(1, 0, ['dpad', '◀ ▶ Volume']);
    if (this.screen !== 'title') hints.push(['b', 'Back']);
    const bar = promptBar(hints);
    this.prompts.replaceWith(bar);
    this.prompts = bar;
    if (focusKey !== undefined) {
      const items = this.focusables();
      const i = items.findIndex((e) => e.dataset.key === focusKey);
      if (i >= 0) this.focusAt(i);
      else this.focusAt(0);
      this.panel.scrollTop = scroll;
    }
  }

  private button(key: string, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = mk('button', cls, text);
    b.type = 'button';
    b.dataset.key = key;
    b.addEventListener('click', () => {
      if (!this._visible || b.disabled) return;
      this.click();
      onClick();
    });
    return b;
  }

  private backButton(): HTMLElement {
    const wrap = mk('div', 'actions');
    wrap.appendChild(this.button('back', 'Back', () => this.go('title'), 'secondary'));
    return wrap;
  }

  private wallet(): string {
    return `🪙 ${this.host.profile().data.coins}`;
  }

  private renderTitle(): void {
    const p = this.panel;
    p.appendChild(mk('h1', '', 'Village Defender'));
    p.appendChild(mk('div', 'subtitle', 'Protect the village. Rally the townsfolk. Slay the horde.'));
    const stack = mk('div', 'stack');
    stack.appendChild(this.button('play', 'Play', () => this.go('towns'), 'big'));
    stack.appendChild(this.button('shop', `Shop  ${this.wallet()}`, () => this.go('shop'), 'big'));
    stack.appendChild(this.button('settings', 'Settings', () => this.go('settings'), 'big'));
    p.appendChild(stack);
    p.appendChild(mk('div', 'footer', 'Kenney assets (CC0)'));
  }

  private renderTowns(): void {
    const p = this.panel;
    const profile = this.host.profile();
    p.appendChild(mk('h2', '', 'Choose a town'));
    TOWNS.forEach((t, i) => {
      const unlocked = profile.townUnlocked(t.id);
      const card = mk('div', `town${unlocked ? '' : ' locked'}`);
      card.dataset.id = t.id;
      const info = mk('div', 'info');
      info.appendChild(mk('div', 'name', t.name));
      info.appendChild(mk('div', 'desc', t.blurb));
      const best = profile.data.bestStars[t.id] ?? 0;
      const stars = mk('div', 'stars');
      for (let s = 0; s < MAX_STARS; s++) stars.appendChild(mk('span', `star ${s < best ? 'on' : 'off'}`, s < best ? '★' : '☆'));
      info.appendChild(stars);
      info.appendChild(mk('div', 'desc boss', `Boss: ${t.bossName}`));
      if (!unlocked && i > 0) info.appendChild(mk('div', 'desc lock', `🔒 Earn ${t.unlockStars}★ in ${TOWNS[i - 1].name}`));
      card.appendChild(info);
      if (unlocked) card.appendChild(this.button(`play:${t.id}`, 'Play', () => this.host.onPlay(t.id), 'playbtn'));
      p.appendChild(card);
    });
    p.appendChild(this.backButton());
  }

  private renderShop(): void {
    const p = this.panel;
    const profile = this.host.profile();
    p.appendChild(mk('h2', '', 'Shop'));
    p.appendChild(mk('div', 'wallet', this.wallet()));
    const toast = mk('div', `toast${this.toast?.bad ? ' bad' : ''}`, this.toast?.text ?? '');
    toast.setAttribute('role', 'status');
    p.appendChild(toast);

    const section = (title: string, kind: ShopItem['kind']) => {
      p.appendChild(mk('h3', '', title));
      for (const item of SHOP.filter((i) => i.kind === kind)) p.appendChild(this.shopRow(item, profile, item.name));
    };
    section('Boosts', 'boost');

    p.appendChild(mk('h3', '', 'Cards'));
    for (const u of UPGRADES) {
      const owned = profile.data.cards.includes(u.id);
      const item = SHOP.find((i) => i.kind === 'card' && i.card === u.id);
      if (item) {
        p.appendChild(this.shopRow(item, profile, u.name, u.describe(0), u.id));
      } else {
        const row = mk('div', `row card${owned ? ' owned' : ''}`);
        row.dataset.id = u.id;
        row.appendChild(this.info(u.name, u.describe(0)));
        row.appendChild(mk('span', 'state', owned ? 'Owned' : 'Unlock: achievement'));
        p.appendChild(row);
      }
    }

    section('Weapon ranks', 'rank');
    p.appendChild(this.backButton());
  }

  private info(name: string, desc: string): HTMLElement {
    const info = mk('div', 'info');
    info.appendChild(mk('div', 'name', name));
    info.appendChild(mk('div', 'desc', desc));
    return info;
  }

  private shopRow(item: ShopItem, profile: Profile, name: string, desc = item.description, rowId = item.id): HTMLElement {
    const price = profile.priceOf(item.id);
    const row = mk('div', `row ${item.kind}${price === null ? ' owned' : ''}`);
    row.dataset.id = rowId;
    row.appendChild(this.info(name, desc));
    const locked = item.kind === 'rank' && !profile.data.weapons.includes(item.weapon);
    if ((item.kind === 'boost' || item.kind === 'rank') && !locked) row.appendChild(mk('span', 'stacks', `${profile.bought(item.id)}/${item.cost.length}`));
    if (price !== null) row.appendChild(mk('span', 'price', `🪙 ${price}`));
    const label = price !== null ? 'Buy' : locked ? 'Locked' : item.kind === 'card' ? 'Owned' : 'Max';
    if (locked) row.appendChild(mk('span', 'state', 'Unlock weapon: achievement'));
    const b = this.button(`buy:${item.id}`, label, () => this.buy(item.id), 'buy');
    b.dataset.id = item.id;
    b.disabled = price === null || profile.data.coins < price;
    row.appendChild(b);
    return row;
  }

  private buy(itemId: string): void {
    const r = this.host.profile().buy(itemId);
    this.toast = r.ok ? { text: 'Bought!', bad: false } : { text: r.reason === 'coins' ? 'Not enough coins' : 'Unavailable', bad: true };
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
      const t = this.panel.querySelector('.toast');
      if (t) { t.textContent = ''; t.classList.remove('bad'); }
    }, 2000);
    this.render(`buy:${itemId}`);
  }

  private renderSettings(): void {
    const p = this.panel;
    const s = this.host.audioSettings();
    p.appendChild(mk('h2', '', 'Settings'));
    for (const [key, label] of [['master', 'Master'], ['sfx', 'Effects'], ['music', 'Music']] as const) {
      const row = mk('div', 'setting');
      const id = `vd-menu-${key}`;
      const lab = mk('label', '', label);
      lab.htmlFor = id;
      const input = mk('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.id = id;
      input.dataset.key = key;
      input.value = String(Math.round(s[key] * 100));
      const val = mk('span', 'val', input.value);
      input.addEventListener('input', () => {
        val.textContent = input.value;
        this.host.setAudioSettings({ [key]: Number(input.value) / 100 });
      });
      row.append(lab, input, val);
      p.appendChild(row);
    }
    const mute = this.button('mute', s.muted ? 'Sound: Off' : 'Sound: On', () => {
      this.host.setAudioSettings({ muted: !this.host.audioSettings().muted });
      this.render('mute');
    }, 'secondary');
    mute.setAttribute('aria-pressed', String(s.muted));
    const muteRow = mk('div', 'actions');
    muteRow.appendChild(mute);
    p.appendChild(muteRow);

    if (this.confirmReset) {
      p.appendChild(mk('div', 'confirm', 'Are you sure? This deletes coins, unlocks and stars.'));
      const row = mk('div', 'actions');
      row.appendChild(this.button('reset-confirm', 'Confirm', () => {
        this.confirmReset = false;
        this.host.onResetProgress();
        this.toast = null;
        this.render('reset');
      }));
      row.appendChild(this.button('reset-cancel', 'Cancel', () => { this.confirmReset = false; this.render('reset'); }, 'secondary'));
      p.appendChild(row);
    } else {
      const row = mk('div', 'actions');
      row.appendChild(this.button('reset', 'Reset progress', () => { this.confirmReset = true; this.render('reset-cancel'); }, 'secondary'));
      p.appendChild(row);
    }
    p.appendChild(this.backButton());
  }

  // ------------------------------------------------------------------ focus

  private focusables(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>('button, input')].filter((e) => !(e as HTMLButtonElement).disabled);
  }

  private currentIndex(items: HTMLElement[]): number {
    const a = document.activeElement as HTMLElement | null;
    const i = a ? items.indexOf(a) : -1;
    return i >= 0 ? i : items.findIndex((e) => e.classList.contains('focus'));
  }

  private focusAt(i: number): void {
    const items = this.focusables();
    if (items.length === 0) return;
    const el = items[Math.min(items.length - 1, Math.max(0, i))];
    // A class as well as real focus: :focus does not match while the window itself is unfocused.
    for (const e of this.panel.querySelectorAll('.focus')) e.classList.remove('focus');
    el.classList.add('focus');
    el.focus();
    el.scrollIntoView?.({ block: 'nearest' });
  }

  private moveFocus(d: number): void {
    const items = this.focusables();
    if (items.length === 0) return;
    const cur = this.currentIndex(items);
    this.focusAt(cur < 0 ? (d > 0 ? 0 : items.length - 1) : (cur + d + items.length) % items.length);
  }

  /** Left/right on a slider changes its value; returns whether it was handled. */
  /** The focused control: real focus, else the one carrying the focus class. */
  private current(): HTMLElement | null {
    const items = this.focusables();
    return items[this.currentIndex(items)] ?? null;
  }

  private adjustSlider(dir: number): boolean {
    const a = this.current() as HTMLInputElement | null;
    if (!a || a.type !== 'range' || !this.panel.contains(a)) return false;
    a.value = String(Math.min(100, Math.max(0, Number(a.value) + dir * SLIDER_STEP)));
    a.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  private activate(): void {
    const a = this.current();
    if (a && a.tagName === 'BUTTON') a.click();
  }

  // ------------------------------------------------------------------ keyboard

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (e.key === 'Tab') return; // native tab order matches focusables()
    const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(k);
    if (!handled) return;
    if (k === 'Escape' && this.screen === 'title') return;
    e.preventDefault();
    if (!this.guardOpen() || e.repeat) return;
    switch (k) {
      case 'ArrowUp': this.moveFocus(-1); break;
      case 'ArrowDown': this.moveFocus(1); break;
      case 'ArrowLeft': if (!this.adjustSlider(-1)) this.moveFocus(-1); break;
      case 'ArrowRight': if (!this.adjustSlider(1)) this.moveFocus(1); break;
      case 'Escape':
        if (this.confirmReset) { this.confirmReset = false; this.click(); this.render('reset'); } else this.back();
        break;
      default: this.activate();
    }
  };

  /** Stops the browser's own Space-up click so Space does not activate a button twice. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this._visible && e.key === ' ') e.preventDefault();
  };

  // ------------------------------------------------------------------ gamepad

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
    if (f.dir === 'up') this.moveFocus(-1);
    else if (f.dir === 'down') this.moveFocus(1);
    else if (f.dir === 'left' || f.dir === 'right') {
      const d = f.dir === 'left' ? -1 : 1;
      if (!this.adjustSlider(d)) this.moveFocus(d);
    }
    if (f.pressed.has('a')) this.activate();
    else if (f.pressed.has('b')) {
      if (this.confirmReset) { this.confirmReset = false; this.click(); this.render('reset'); } else this.back();
    }
  }
}
