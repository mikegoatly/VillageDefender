// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../../src/data/balance';
import { UPGRADES } from '../../src/data/upgrades';
import { DebugPanel, debugEnabled, type DebugHost, type OverlayName } from '../../src/ui/DebugPanel';
import type { World } from '../../src/sim/world';
import type { Profile } from '../../src/meta/profile';

function aFakeWorld() {
  return {
    god: false,
    time: 0, status: 'playing', wave: 0, totalWaves: 8, kills: 0, rookieCap: 2,
    players: [{ x: 5, y: 6, hp: 10, maxHp: 10 }],
    monsters: [], rookies: [],
    buildings: [{ id: 0, hp: 5, maxHp: 10, ruined: false, cells: [[1, 1]] }],
    map: { buildings: [{ kind: 'cottage' }] },
    progression: { level: 1, xp: 0, xpToNext: 8, levels: {} },
    standingBuildings: () => 1,
    debugInfo: () => ({ nextWaveAt: 6, nextWave: 1 }),
    debugSpawn: vi.fn(), debugGiveUpgrade: vi.fn(() => true), debugGiveXp: vi.fn(),
    debugHealKnight: vi.fn(), debugKillAll: vi.fn(), debugJumpToWave: vi.fn(), debugEnd: vi.fn(),
    debugAddRookie: vi.fn(), debugSetBuildingHp: vi.fn(),
  };
}

function aFakeProfile() {
  return {
    data: { coins: 5, roles: ['barracks', 'chapel'], achievements: ['first'] },
    unlockAll: vi.fn(), addCoins: vi.fn(), reset: vi.fn(),
  };
}

function aHost(world = aFakeWorld(), profile = aFakeProfile()) {
  const host: DebugHost & { fake: ReturnType<typeof aFakeWorld>; fakeProfile: ReturnType<typeof aFakeProfile> } = {
    fake: world,
    fakeProfile: profile,
    profile: () => profile as unknown as Profile,
    world: () => world as unknown as World,
    seed: () => 7,
    restart: vi.fn(),
    speed: 1,
    paused: false,
    stepTicks: vi.fn(),
    overlays: { flowKnight: false, flowBuildings: false, hitboxes: false, ranges: false, labels: false } as Record<OverlayName, boolean>,
    lastClickGround: () => null,
  };
  return host;
}

describe('debugEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });
  it('is on in dev', () => {
    expect(debugEnabled()).toBe(true);
  });
  it('needs ?debug=1 outside dev', () => {
    vi.stubEnv('DEV', false);
    expect(debugEnabled()).toBe(false);
    window.history.pushState({}, '', '/?debug=1');
    expect(debugEnabled()).toBe(true);
  });
});

describe('DebugPanel', () => {
  let host: ReturnType<typeof aHost>;
  let panel: DebugPanel;

  const controller = (name: string) => {
    const c = panel.gui.controllersRecursive().find((x) => x._name === name);
    if (!c) throw new Error(`no controller ${name}`);
    return c;
  };
  const press = (name: string) => (controller(name) as unknown as { $button: HTMLButtonElement }).$button.click();

  beforeEach(() => {
    document.body.innerHTML = '';
    host = aHost();
    panel = new DebugPanel(host);
  });
  afterEach(() => panel.destroy());

  it('starts hidden and toggles via backtick, F2 and the button', () => {
    expect(panel.visible).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));
    expect(panel.visible).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    expect(panel.visible).toBe(false);
    document.querySelector<HTMLButtonElement>('.vd-debug-btn')!.click();
    expect(panel.visible).toBe(true);
  });

  it('does not leak keys typed in the panel to window', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    panel.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it('Spawn calls debugSpawn with the selected kind, count and target', () => {
    controller('kind').setValue('orc');
    controller('count').setValue(12);
    controller('target').setValue('left');
    press('Spawn');
    expect(host.fake.debugSpawn).toHaveBeenCalledWith('orc', 12, 'left');
  });

  it('Spawn at knight uses the knight position', () => {
    controller('target').setValue('at knight');
    press('Spawn');
    expect(host.fake.debugSpawn).toHaveBeenCalledWith('zombie', 5, { x: 5, y: 6 });
  });

  it('Grant upgrade calls debugGiveUpgrade with the selected id', () => {
    controller('upgrade').setValue(UPGRADES[2].id);
    press('Grant upgrade');
    expect(host.fake.debugGiveUpgrade).toHaveBeenCalledWith(UPGRADES[2].id);
  });

  it('speed and paused bind to the host', () => {
    controller('speed').setValue(4);
    controller('paused').setValue(true);
    expect(host.speed).toBe(4);
    expect(host.paused).toBe(true);
    host.speed = 2;
    controller('speed').updateDisplay();
    expect(controller('speed').getValue()).toBe(2);
  });

  it('step and retry buttons call the host', () => {
    press('Step 1 tick');
    expect(host.stepTicks).toHaveBeenCalledWith(1);
    press('Retry (same seed)');
    expect(host.restart).toHaveBeenCalledWith(7);
    press('New town');
    expect(host.restart).toHaveBeenLastCalledWith();
  });

  it('Reset balance restores a mutated value', () => {
    const original = KNIGHT.hp;
    KNIGHT.hp = original + 100;
    press('Reset balance');
    expect(KNIGHT.hp).toBe(original);
  });

  it('Profile folder shows coins/roles/achievements and its buttons call the Profile', () => {
    expect(controller('coins').getValue()).toBe('5');
    expect(controller('roles').getValue()).toBe('barracks, chapel');
    expect(controller('achievements').getValue()).toBe('first');
    press('Unlock all roles');
    expect(host.fakeProfile.unlockAll).toHaveBeenCalledWith(['barracks', 'chapel', 'smithy', 'watchtower']);
    host.fakeProfile.data.coins = 105;
    press('+100 coins');
    expect(host.fakeProfile.addCoins).toHaveBeenCalledWith(100);
    expect(controller('coins').getValue()).toBe('105');
    press('Reset profile');
    expect(host.fakeProfile.reset).toHaveBeenCalledTimes(1);
  });

  it('destroy removes DOM and listeners', () => {
    panel.destroy();
    expect(document.querySelector('.vd-debug-btn')).toBeNull();
    expect(document.querySelector('.vd-debug-root')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));
    expect(panel.visible).toBe(false);
    panel = new DebugPanel(host); // afterEach destroys again
  });
});
