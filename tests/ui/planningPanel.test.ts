// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PlanningPanel, type PlanningCallbacks, type PlanningRoleOption, type PlanningView, type PlanningWeaponOption } from '../../src/ui/PlanningPanel';
import type { RoleKind } from '../../src/data/roles';

function aRole(kind: RoleKind, o: Partial<PlanningRoleOption> = {}): PlanningRoleOption {
  return { kind, name: kind[0].toUpperCase() + kind.slice(1), description: `${kind} effect`, cost: 1, icon: '*', locked: false, ...o };
}
const ROLES = (): PlanningRoleOption[] => [aRole('barracks'), aRole('chapel'), aRole('smithy'), aRole('watchtower')];

function aView(o: Partial<PlanningView> = {}): PlanningView {
  return { townName: 'Oakvale', pointsLeft: 2, pointsTotal: 3, selected: null, roles: ROLES(), assigned: 'Barracks', ...o };
}
function aWeapon(kind: string, o: Partial<PlanningWeaponOption> = {}): PlanningWeaponOption {
  return { kind, name: kind[0].toUpperCase() + kind.slice(1), description: `${kind} attack`, locked: false, icon: `i-${kind}`, ...o };
}
const WEAPONS = (): PlanningWeaponOption[] => [
  aWeapon('sword'), aWeapon('spear', { locked: true, lockHint: 'Win a town' }), aWeapon('hammer'), aWeapon('axes'),
];
const selected = (role: RoleKind | null = null) => ({ id: 4, label: 'House #4', role });

describe('PlanningPanel', () => {
  let root: HTMLElement;
  let panel: PlanningPanel;
  let cb: { [K in keyof Required<PlanningCallbacks>]: Mock<Required<PlanningCallbacks>[K]> };
  let clock: number;
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafId: number;
  let pad: { connected: boolean; axes: number[]; buttons: { pressed: boolean }[] } | null;

  const step = () => {
    const q = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb2] of q) cb2(clock);
  };
  const press = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }));
  const ready = () => { clock += 301; };
  const setPad = (buttons: Record<number, boolean> = {}, axes: number[] = [0, 0]) => {
    pad = { connected: true, axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: !!buttons[i] })) };
  };
  const opts = () => [...root.querySelectorAll<HTMLButtonElement>('.opt')];
  const optByName = (name: string) => opts().find((b) => b.querySelector('.nm')!.textContent === name)!;
  const text = (sel: string) => root.querySelector(sel)?.textContent;
  /** Shows the panel, waits out the guard and releases all pad buttons. */
  const showReady = (v: PlanningView) => {
    setPad({});
    panel.show(v);
    ready();
    step();
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    rafQueue = new Map();
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { rafQueue.set(++rafId, f); return rafId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafQueue.delete(id); });
    pad = null;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    cb = { onAssign: vi.fn(), onSelectNext: vi.fn(), onSelectDir: vi.fn(), onStart: vi.fn(), onWeapon: vi.fn(), onLamp: vi.fn() };
    panel = new PlanningPanel(root, cb);
  });
  afterEach(() => {
    panel.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the banner with town, points, summary and hint but no card when nothing is selected', () => {
    panel.show(aView());
    expect(panel.visible).toBe(true);
    expect(text('.title')).toBe('Plan your defences — Oakvale');
    expect(text('.pips')).toBe('●●○');
    expect(text('.pts')).toBe('2/3 points');
    expect(text('.assigned')).toBe('Barracks');
    expect(text('.start')).toBe('Start ▶');
    expect(text('.hint')).toBe('Tap a house to give it a role');
    expect(root.querySelector('.card')).toBeNull();
  });

  it('places the hint and controller prompts after the banner in the same top column, never inside it', () => {
    panel.show(aView({ weapons: [{ kind: 'sword', name: 'Sword', description: 'd', locked: false, icon: 'S' }], selectedWeapon: 'sword' }));
    const top = root.querySelector('.top')!;
    expect(Array.from(top.children).map((c) => c.className)).toEqual(['banner', 'vd-prompts', 'hint kb-only']);
    expect(root.querySelector('.banner .hint')).toBeNull();
  });

  it('renders a card with Plain house and one button per role when selected', () => {
    panel.show(aView({ selected: selected() }));
    expect(root.querySelector('.hint')).toBeNull();
    expect(text('.card .head')).toBe('House #4');
    expect(opts()).toHaveLength(5);
    expect(optByName('Plain house').classList.contains('cur')).toBe(true);
    expect(optByName('Chapel').textContent).toContain('chapel effect');
    expect(optByName('Chapel').textContent).toContain('1 pt');
  });

  it('highlights the current role', () => {
    panel.show(aView({ selected: selected('chapel') }));
    expect(opts().filter((b) => b.classList.contains('cur'))).toEqual([optByName('Chapel')]);
  });

  it('disables locked roles with their hint', () => {
    const roles = ROLES();
    roles[2] = aRole('smithy', { locked: true, lockHint: 'Win a town' });
    panel.show(aView({ selected: selected(), roles }));
    expect(optByName('Smithy').disabled).toBe(true);
    expect(optByName('Smithy').textContent).toContain('🔒');
    expect(optByName('Smithy').textContent).toContain('Win a town');
    optByName('Smithy').click();
    expect(cb.onAssign).not.toHaveBeenCalled();
  });

  it('disables unaffordable roles, counting the refund of the current role', () => {
    panel.show(aView({ pointsLeft: 0, selected: selected() }));
    expect(optByName('Chapel').disabled).toBe(true);
    expect(optByName('Chapel').textContent).toContain('Not enough points');
    expect(optByName('Plain house').disabled).toBe(false);

    panel.show(aView({ pointsLeft: 0, selected: selected('barracks') }));
    expect(optByName('Chapel').disabled).toBe(false); // swapping refunds 1 point
  });

  it('clicking a role / Plain house / Start calls the callbacks', () => {
    panel.show(aView({ selected: selected('chapel') }));
    optByName('Smithy').click();
    expect(cb.onAssign).toHaveBeenLastCalledWith(4, 'smithy');
    optByName('Plain house').click();
    expect(cb.onAssign).toHaveBeenLastCalledWith(4, null);
    (root.querySelector('.start') as HTMLElement).click();
    expect(cb.onStart).toHaveBeenCalledTimes(1);
  });

  it('container does not block the map but banner and card take taps', () => {
    panel.show(aView({ selected: selected() }));
    const css = document.getElementById('vd-plan-style')!.textContent!;
    expect(css).toMatch(/\.vd-plan \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.vd-plan \.banner \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.vd-plan \.card \{[^}]*pointer-events: auto/);
  });

  describe('keyboard', () => {
    it('ignores keys during the first 300 ms, then accepts them', () => {
      panel.show(aView({ selected: selected() }));
      clock += 299;
      press('Enter');
      press('1');
      press('ArrowRight');
      expect(cb.onStart).not.toHaveBeenCalled();
      expect(cb.onAssign).not.toHaveBeenCalled();
      expect(cb.onSelectNext).not.toHaveBeenCalled();
      clock += 1;
      press('Enter');
      expect(cb.onStart).toHaveBeenCalledTimes(1);
    });

    it('arrows and Tab cycle the selection', () => {
      panel.show(aView());
      ready();
      press('ArrowRight');
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      press('ArrowLeft');
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
      press('Tab');
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      press('Tab', { shiftKey: true });
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
    });

    it('1-4 assign the role at that index, 0/Backspace make a plain house', () => {
      panel.show(aView({ selected: selected('chapel') }));
      ready();
      press('1');
      expect(cb.onAssign).toHaveBeenLastCalledWith(4, 'barracks');
      press('4');
      expect(cb.onAssign).toHaveBeenLastCalledWith(4, 'watchtower');
      press('0');
      expect(cb.onAssign).toHaveBeenLastCalledWith(4, null);
      press('Backspace');
      expect(cb.onAssign).toHaveBeenCalledTimes(4);
    });

    it('number keys skip disabled roles and do nothing without a selection', () => {
      const roles = ROLES();
      roles[1] = aRole('chapel', { locked: true });
      panel.show(aView({ selected: selected(), roles }));
      ready();
      press('2');
      expect(cb.onAssign).not.toHaveBeenCalled();
      panel.show(aView());
      press('1');
      expect(cb.onAssign).not.toHaveBeenCalled();
    });

    it('does not handle keys when hidden', () => {
      panel.show(aView());
      ready();
      panel.hide();
      press('Enter');
      expect(cb.onStart).not.toHaveBeenCalled();
    });
  });

  describe('gamepad', () => {
    /** One tap: press, step, release, step. */
    const tap = (buttons: Record<number, boolean>, axes?: number[]) => {
      setPad(buttons, axes);
      step();
      setPad({});
      step();
    };
    const glyphs = () => [...root.querySelectorAll<HTMLElement>('.vd-prompts .vd-glyph')].map((g) => g.dataset.btn);

    it('LB/RB cycle houses on edges only', () => {
      showReady(aView());
      setPad({ 5: true });
      step();
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      step();
      expect(cb.onSelectNext).toHaveBeenCalledTimes(1);
      tap({ 4: true });
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
      expect(cb.onSelectNext).toHaveBeenCalledTimes(2);
    });

    it('D-pad and stick select the house in that direction', () => {
      showReady(aView());
      setPad({ 15: true });
      step();
      step(); // held, before the repeat delay: no second move
      expect(cb.onSelectDir).toHaveBeenCalledTimes(1);
      expect(cb.onSelectDir).toHaveBeenLastCalledWith('right');
      tap({}, [0, -0.9]);
      expect(cb.onSelectDir).toHaveBeenLastCalledWith('up');
      expect(cb.onSelectNext).not.toHaveBeenCalled();
    });

    it('without onSelectDir, D-pad left/right cycle houses instead', () => {
      panel.destroy();
      panel = new PlanningPanel(root, { onAssign: cb.onAssign, onSelectNext: cb.onSelectNext, onStart: cb.onStart });
      showReady(aView());
      tap({ 15: true });
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      tap({ 14: true });
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
    });

    it('A opens the role card, left/right move focus, A assigns and returns to the map', () => {
      showReady(aView({ selected: selected('barracks') }));
      expect(root.querySelector('.opt.focus')).toBeNull(); // map mode: no role focus yet
      tap({ 0: true });
      expect(root.querySelector('.card')!.classList.contains('pad-active')).toBe(true);
      expect(optByName('Barracks').classList.contains('focus')).toBe(true); // starts on the current role
      tap({ 15: true });
      expect(optByName('Chapel').classList.contains('focus')).toBe(true);
      tap({ 15: true }); // in the card, directions do not move between houses
      expect(cb.onSelectDir).not.toHaveBeenCalled();
      tap({ 14: true });
      tap({ 0: true });
      expect(cb.onAssign).toHaveBeenCalledWith(4, 'chapel');
      expect(root.querySelector('.card')!.classList.contains('pad-active')).toBe(false);
      tap({ 15: true });
      expect(cb.onSelectDir).toHaveBeenLastCalledWith('right');
    });

    it('B leaves the role card without assigning', () => {
      showReady(aView({ selected: selected() }));
      tap({ 0: true });
      tap({ 15: true });
      tap({ 1: true });
      expect(cb.onAssign).not.toHaveBeenCalled();
      expect(root.querySelector('.opt.focus')).toBeNull();
    });

    it('A on a disabled option does nothing and stays in the card', () => {
      const roles = ROLES();
      roles[0] = aRole('barracks', { locked: true });
      showReady(aView({ selected: selected(), roles }));
      tap({ 0: true });
      tap({ 15: true }); // focus on locked Barracks
      tap({ 0: true });
      expect(cb.onAssign).not.toHaveBeenCalled();
      expect(optByName('Barracks').classList.contains('focus')).toBe(true);
    });

    it('A with no house selected does nothing', () => {
      showReady(aView());
      tap({ 0: true });
      expect(cb.onAssign).not.toHaveBeenCalled();
      expect(root.querySelector('.card')).toBeNull();
    });

    it('shows controller prompts for the current mode', () => {
      showReady(aView({ selected: selected() }));
      expect(glyphs()).toEqual(['dpad', 'stick', 'a', 'start']);
      tap({ 0: true });
      expect(glyphs()).toEqual(['dpad', 'stick', 'a', 'b', 'start']);
    });

    it('Start (9) and Y (3) start the town', () => {
      showReady(aView());
      setPad({ 9: true });
      step();
      expect(cb.onStart).toHaveBeenCalledTimes(1);
      step();
      expect(cb.onStart).toHaveBeenCalledTimes(1);
      setPad({});
      step();
      setPad({ 3: true });
      step();
      expect(cb.onStart).toHaveBeenCalledTimes(2);
    });

    it('buttons held from before show, or pressed within 300 ms, are ignored', () => {
      setPad({ 9: true });
      panel.show(aView());
      ready();
      step();
      expect(cb.onStart).not.toHaveBeenCalled();
      setPad({});
      step();
      setPad({ 9: true });
      clock -= 200; // simulate a fresh show inside the guard window
      panel.hide();
      panel.show(aView());
      setPad({});
      step();
      setPad({ 9: true });
      step();
      expect(cb.onStart).not.toHaveBeenCalled();
    });
  });

  it('show() with the same view is idempotent (no DOM rebuild, guard not reset)', () => {
    panel.show(aView({ selected: selected() }));
    ready();
    const first = opts()[1];
    panel.show(aView({ selected: selected() }));
    expect(opts()[1]).toBe(first);
    press('Enter');
    expect(cb.onStart).toHaveBeenCalledTimes(1);
  });

  it('show() refreshes when the view changes', () => {
    panel.show(aView());
    panel.show(aView({ pointsLeft: 0, assigned: 'Barracks, Chapel', selected: selected('chapel') }));
    expect(text('.pts')).toBe('0/3 points');
    expect(text('.assigned')).toBe('Barracks, Chapel');
    expect(root.querySelector('.card')).not.toBeNull();
    panel.show(aView());
    expect(root.querySelector('.card')).toBeNull();
  });

  it('hide() hides, and show() afterwards restarts the guard', () => {
    panel.show(aView());
    ready();
    panel.hide();
    expect(panel.visible).toBe(false);
    expect(root.querySelector('.vd-plan')!.classList.contains('show')).toBe(false);
    panel.show(aView());
    press('Enter');
    expect(cb.onStart).not.toHaveBeenCalled();
  });

  describe('weapon picker', () => {
    const wpns = () => [...root.querySelectorAll<HTMLButtonElement>('.wpn')];
    const wpn = (kind: string) => wpns().find((b) => b.dataset.kind === kind)!;
    const wview = (selectedWeapon = 'sword', weapons = WEAPONS()) => aView({ weapons, selectedWeapon });

    it('omitting the optional fields renders no weapon row and keeps the banner unchanged', () => {
      panel.show(aView());
      expect(root.querySelector('.weapons')).toBeNull();
      expect(root.querySelector('.banner')!.children).toHaveLength(5);
      ready();
      press('w');
      press('W', { shiftKey: true });
      expect(cb.onWeapon).not.toHaveBeenCalled();
    });

    it('renders icons, names, the selected highlight and locked state', () => {
      panel.show(wview('hammer'));
      expect(text('.wl')).toBe('Weapon:');
      expect(wpns()).toHaveLength(4);
      expect(wpns().filter((b) => b.classList.contains('sel'))).toEqual([wpn('hammer')]);
      expect(wpn('sword').textContent).toContain('i-sword');
      expect(wpn('sword').textContent).toContain('Sword');
      expect(wpn('spear').disabled).toBe(true);
      expect(wpn('spear').textContent).toContain('🔒');
      expect(wpn('spear').title).toBe('Win a town');
      expect(wpn('spear').textContent).toContain('Win a town');
      expect(wpn('sword').disabled).toBe(false);
    });

    it('clicking an enabled weapon calls onWeapon; locked does nothing', () => {
      panel.show(wview());
      wpn('axes').click();
      expect(cb.onWeapon).toHaveBeenLastCalledWith('axes');
      wpn('spear').click();
      expect(cb.onWeapon).toHaveBeenCalledTimes(1);
    });

    it('W cycles forward and Shift+W backward, skipping locked, with wrap', () => {
      panel.show(wview('sword'));
      ready();
      press('w');
      expect(cb.onWeapon).toHaveBeenLastCalledWith('hammer');
      panel.show(wview('axes'));
      press('w');
      expect(cb.onWeapon).toHaveBeenLastCalledWith('sword');
      press('W', { shiftKey: true });
      expect(cb.onWeapon).toHaveBeenLastCalledWith('hammer'); // view still shows axes; previous skips locked spear
      panel.show(wview('sword'));
      press('W', { shiftKey: true });
      expect(cb.onWeapon).toHaveBeenLastCalledWith('axes'); // wraps
      panel.show(wview('hammer'));
      press('w', { shiftKey: true });
      expect(cb.onWeapon).toHaveBeenLastCalledWith('sword');
    });

    it('W is ignored during the input guard and with a single unlocked weapon', () => {
      panel.show(wview());
      press('w');
      expect(cb.onWeapon).not.toHaveBeenCalled();
      ready();
      panel.show(wview('sword', [aWeapon('sword'), aWeapon('spear', { locked: true })]));
      press('w');
      expect(cb.onWeapon).not.toHaveBeenCalled();
    });

    it('gamepad X (button 2) cycles to the next unlocked weapon on the rising edge', () => {
      showReady(wview('sword'));
      setPad({ 2: true });
      step();
      expect(cb.onWeapon).toHaveBeenLastCalledWith('hammer');
      step();
      expect(cb.onWeapon).toHaveBeenCalledTimes(1);
    });

    it('is shown alongside the role card', () => {
      panel.show({ ...wview(), selected: selected() });
      expect(wpns()).toHaveLength(4);
      expect(opts()).toHaveLength(5);
    });
  });

  describe('lamp oil (night towns)', () => {
    const lamp = (lit = false, canLight = true) => ({ id: 7, label: 'Lamp post', lit, canLight });
    const oilView = (o: Partial<PlanningView> = {}) => aView({ oil: { left: 2, total: 3 }, ...o });
    const tap = (buttons: Record<number, boolean>) => {
      setPad(buttons);
      step();
      setPad({});
      step();
    };

    it('shows the oil left in the banner and says lamps can be lit', () => {
      panel.show(oilView());
      expect(text('.oil')).toBe('●●○ 2/3 oil');
      expect(root.querySelectorAll('.oil .drop.on')).toHaveLength(2);
      expect(text('.hint')).toBe('Tap a house or a lamp post');
    });

    it('a selected dark post offers Leave dark / Light it; clicking lights it', () => {
      panel.show(oilView({ lamp: lamp() }));
      expect(text('.card .head')).toBe('Lamp post');
      expect(optByName('Light it').querySelector('.ds')!.textContent).toBe('1 oil');
      expect(optByName('Leave dark').querySelector('.ds')!.textContent).toBe('');
      expect(opts().map((b) => b.querySelector('.nm')!.textContent)).toEqual(['Leave dark', 'Light it']);
      expect(optByName('Leave dark').classList.contains('cur')).toBe(true);
      optByName('Light it').click();
      expect(cb.onLamp).toHaveBeenCalledWith(7, true);
      expect(cb.onAssign).not.toHaveBeenCalled();
    });

    it('Light it is disabled with no oil left, unless the post is already lit', () => {
      panel.show(oilView({ lamp: lamp(false, false) }));
      expect(optByName('Light it').disabled).toBe(true);
      expect(optByName('Light it').querySelector('.note')!.textContent).toBe('No oil');
      panel.show(oilView({ lamp: lamp(true, false) }));
      expect(optByName('Light it').disabled).toBe(false);
      expect(optByName('Light it').classList.contains('cur')).toBe(true);
    });

    it('keys: 1 lights the post, 0 leaves it dark', () => {
      panel.show(oilView({ lamp: lamp() }));
      ready();
      press('1');
      expect(cb.onLamp).toHaveBeenLastCalledWith(7, true);
      press('0');
      expect(cb.onLamp).toHaveBeenLastCalledWith(7, false);
    });

    it('gamepad: A opens the card, right moves to Light it, A lights it', () => {
      showReady(oilView({ lamp: lamp() }));
      tap({ 0: true });
      expect(optByName('Leave dark').classList.contains('focus')).toBe(true);
      tap({ 15: true });
      tap({ 0: true });
      expect(cb.onLamp).toHaveBeenCalledWith(7, true);
    });
  });

  it('destroy removes DOM, key listener and rAF loop', () => {
    panel.show(aView());
    ready();
    panel.destroy();
    expect(root.querySelector('.vd-plan')).toBeNull();
    expect(rafQueue.size).toBe(0);
    press('Enter');
    expect(cb.onStart).not.toHaveBeenCalled();
  });
});
