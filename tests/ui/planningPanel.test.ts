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
    cb = { onAssign: vi.fn(), onSelectNext: vi.fn(), onStart: vi.fn(), onWeapon: vi.fn() };
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

  it('places the hint after the banner in the same top column, never inside it', () => {
    panel.show(aView({ weapons: [{ kind: 'sword', name: 'Sword', description: 'd', locked: false, icon: 'S' }], selectedWeapon: 'sword' }));
    const top = root.querySelector('.top')!;
    expect(Array.from(top.children).map((c) => c.className)).toEqual(['banner', 'hint']);
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
    it('LB/RB and D-pad left/right select houses on edges only', () => {
      showReady(aView());
      setPad({ 5: true });
      step();
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      step();
      expect(cb.onSelectNext).toHaveBeenCalledTimes(1);
      setPad({ 4: true });
      step();
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
      setPad({ 15: true });
      step();
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(1);
      setPad({ 14: true });
      step();
      expect(cb.onSelectNext).toHaveBeenLastCalledWith(-1);
      expect(cb.onSelectNext).toHaveBeenCalledTimes(4);
    });

    it('D-pad up/down moves focus, A assigns the focused option', () => {
      showReady(aView({ selected: selected() })); // focus starts on Plain house
      setPad({ 13: true });
      step();
      setPad({});
      step();
      setPad({ 13: true });
      step(); // focus on Chapel
      setPad({});
      step();
      expect(optByName('Chapel').classList.contains('focus')).toBe(true);
      setPad({ 0: true });
      step();
      expect(cb.onAssign).toHaveBeenCalledWith(4, 'chapel');
      setPad({});
      step();
      setPad({ 12: true });
      step();
      setPad({});
      step();
      setPad({ 0: true });
      step();
      expect(cb.onAssign).toHaveBeenLastCalledWith(4, 'barracks');
    });

    it('A on a disabled option does nothing', () => {
      const roles = ROLES();
      roles[0] = aRole('barracks', { locked: true });
      showReady(aView({ selected: selected(), roles }));
      setPad({ 13: true });
      step(); // focus on locked Barracks
      setPad({ 0: true });
      step();
      expect(cb.onAssign).not.toHaveBeenCalled();
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
