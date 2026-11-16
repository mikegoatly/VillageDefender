// In-game debug panel (lil-gui). Dev builds, or any build with ?debug=1.
// The host (GameScene) supplies the current world and the sim controls; this file only pokes
// at the world through its debug* methods and edits the exported balance objects live.

import GUI, { type Controller } from 'lil-gui';
import { BUILDING, KNIGHT, WAVES } from '../data/balance';
import { BOSS, MONSTERS, type MonsterKind } from '../data/monsters';
import { ARMY, GEMS, ROOKIES, TOWN_ARROWS } from '../data/rookies';
import { UPGRADES } from '../data/upgrades';
import { MAX_WEAPON_RANK, WEAPONS, WEAPON_ORDER, type WeaponKind } from '../data/weapons';
import { XP_CURVE } from '../sim/progression';
import type { World } from '../sim/world';
import type { Profile } from '../meta/profile';

export type OverlayName = 'flowKnight' | 'flowBuildings' | 'hitboxes' | 'ranges' | 'labels';

export interface DebugHost {
  /** Current world (changes on restart: always call, never cache). */
  world(): World;
  seed(): number;
  /** Same seed = retry, undefined = new town. */
  restart(seed?: number): void;
  /** Sim speed multiplier (0.25..8). */
  speed: number;
  /** Freezes the sim; rendering continues. */
  paused: boolean;
  /** Advances n sim ticks (works while paused). */
  stepTicks(n: number): void;
  overlays: Record<OverlayName, boolean>;
  /** Ground point under the last pointer click on the map, or null. */
  lastClickGround(): { x: number; y: number } | null;
  /** Persistent player profile (coins, unlocked roles, achievements). */
  profile(): Profile;
}

export function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('debug') === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- balance objects

type Obj = Record<string, unknown>;

const BALANCE: Record<string, Obj> = {
  KNIGHT, ARMY, WAVES, BUILDING, GEMS, TOWN_ARROWS, XP_CURVE,
  'MONSTERS.zombie': MONSTERS.zombie,
  'MONSTERS.orc': MONSTERS.orc,
  'MONSTERS.brute': MONSTERS.brute,
  'MONSTERS.skeleton': MONSTERS.skeleton,
  'MONSTERS.ghost': MONSTERS.ghost,
  'MONSTERS.vampire': MONSTERS.vampire,
  'MONSTERS.imp': MONSTERS.imp,
  'MONSTERS.necromancer': MONSTERS.necromancer,
  'MONSTERS.skeletonArcher': MONSTERS.skeletonArcher,
  'MONSTERS.sapper': MONSTERS.sapper,
  'MONSTERS.warlord': MONSTERS.warlord,
  'BOSS.slam': BOSS.slam,
  'BOSS.charge': BOSS.charge,
  'BOSS.summon': BOSS.summon,
  ...Object.fromEntries(WEAPON_ORDER.map((k) => [`WEAPONS.${k}`, WEAPONS[k]])),
  'ROOKIES.swordsman': ROOKIES.swordsman,
  'ROOKIES.archer': ROOKIES.archer,
} as unknown as Record<string, Obj>;

/** Deep snapshot taken when this module first loads, for "Reset balance". */
const DEFAULTS: Record<string, Obj> = JSON.parse(JSON.stringify(BALANCE));

const SKIP_KEYS = new Set(['tint', 'sheet', 'target', 'order']);

function step(v: number): number {
  return Math.abs(v) <= 1 ? 0.01 : Math.abs(v) < 20 ? 0.05 : 1;
}

const OVERLAY_NAMES: OverlayName[] = ['flowKnight', 'flowBuildings', 'hitboxes', 'ranges', 'labels'];
const SPAWN_TARGETS = ['top', 'right', 'bottom', 'left', 'at last click', 'at knight'] as const;

const STYLE = `
.vd-debug-btn { position: fixed; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right));
  width: 36px; height: 36px; border-radius: 8px; border: 0; background: #000a; color: #fff; font-size: 20px;
  line-height: 36px; padding: 0; cursor: pointer; z-index: 10001; }
.vd-debug-root { position: fixed; right: max(8px, env(safe-area-inset-right));
  top: calc(max(8px, env(safe-area-inset-top)) + 44px); max-height: 90vh; overflow-y: auto; z-index: 10000; }
`;

export class DebugPanel {
  readonly gui: GUI;
  readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly style: HTMLStyleElement;
  private _visible = false;

  private lastWorld: World | null = null;
  private lastStatsAt = 0;
  private frames = 0;
  private fps = 0;
  private fpsAt = 0;

  private readonly stats = {
    time: '', wave: '', nextWave: '', monsters: '', rookies: '', kills: '', knight: '', buildings: '', fps: '', seed: '',
  };
  private readonly profileStats = { coins: '', roles: '', weapons: '', achievements: '' };
  private readonly profileControllers: Controller[] = [];
  private readonly statControllers: Controller[] = [];
  private buildingController!: Controller;
  private buildingHpController!: Controller;
  private takenController!: Controller;
  private readonly p = {
    seedInput: 1,
    spawnKind: 'zombie' as MonsterKind,
    spawnCount: 5,
    spawnTarget: 'top' as (typeof SPAWN_TARGETS)[number],
    spawnStatus: '',
    jumpWave: 1,
    xpAmount: 10,
    upgrade: UPGRADES[0].id,
    upgradeStatus: '',
    weapon: 'sword',
    weaponRank: 0,
    taken: '',
    building: 0,
    buildingHp: 1,
  };

  constructor(private readonly host: DebugHost) {
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.appendChild(this.style);

    this.button = document.createElement('button');
    this.button.className = 'vd-debug-btn';
    this.button.type = 'button';
    this.button.textContent = '\u{1F41E}';
    this.button.title = 'Debug panel (` or F2)';
    this.button.addEventListener('click', this.onButton);
    document.body.appendChild(this.button);

    this.root = document.createElement('div');
    this.root.className = 'vd-debug-root';
    this.root.style.display = 'none';
    // Keep typing in panel fields away from the game's key handlers.
    this.root.addEventListener('keydown', this.stopKey);
    this.root.addEventListener('keyup', this.stopKey);
    document.body.appendChild(this.root);

    this.gui = new GUI({ container: this.root, title: 'Debug', width: 300 });
    this.buildRun();
    this.buildSpawn();
    this.buildKnight();
    this.buildArmy();
    this.buildBuildings();
    this.buildOverlays();
    this.buildProfile();
    this.buildBalance();
    this.gui.folders.forEach((f) => { if (f._title !== 'Run') f.close(); });

    window.addEventListener('keydown', this.onKey);
    this.syncWorld(true);
    this.refreshStats();
  }

  get visible(): boolean {
    return this._visible;
  }

  toggle(): void {
    this._visible = !this._visible;
    this.root.style.display = this._visible ? '' : 'none';
    if (this._visible) this.refreshStats();
  }

  update(): void {
    this.frames++;
    if (!this._visible) return;
    const now = performance.now();
    if (now - this.fpsAt >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    if (this.host.world() !== this.lastWorld) this.syncWorld(false);
    if (now - this.lastStatsAt >= 250) this.refreshStats();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('keydown', this.stopKey);
    this.root.removeEventListener('keyup', this.stopKey);
    this.button.removeEventListener('click', this.onButton);
    this.gui.destroy();
    this.root.remove();
    this.button.remove();
    this.style.remove();
  }

  // ------------------------------------------------------------ events

  private readonly onButton = () => this.toggle();
  private readonly stopKey = (e: Event) => e.stopPropagation();
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === '`' || e.code === 'Backquote' || e.key === 'F2') {
      e.preventDefault();
      this.toggle();
    }
  };

  // ------------------------------------------------------------ folders

  private get w(): World {
    return this.host.world();
  }

  private buildRun() {
    const f = this.gui.addFolder('Run');
    for (const key of Object.keys(this.stats) as (keyof typeof this.stats)[]) {
      this.statControllers.push(f.add(this.stats, key).disable());
    }
    f.add(this.host, 'speed', 0.25, 8, 0.25).name('speed');
    f.add(this.host, 'paused').name('paused');
    f.add({ go: () => this.host.stepTicks(1) }, 'go').name('Step 1 tick');
    f.add({ go: () => this.host.stepTicks(60) }, 'go').name('Step 1 s');
    const self = this;
    f.add({ get god() { return self.w.god; }, set god(v: boolean) { self.w.god = v; } }, 'god').name('god mode');
    f.add({ go: () => this.host.restart(this.host.seed()) }, 'go').name('Retry (same seed)');
    f.add({ go: () => this.host.restart() }, 'go').name('New town');
    f.add(this.p, 'seedInput').name('seed to load').step(1);
    f.add({ go: () => this.host.restart(Math.round(this.p.seedInput)) }, 'go').name('Load seed');
  }

  private buildSpawn() {
    const f = this.gui.addFolder('Spawn');
    f.add(this.p, 'spawnKind', Object.keys(MONSTERS)).name('kind');
    f.add(this.p, 'spawnCount', 1, 50, 1).name('count');
    f.add(this.p, 'spawnTarget', [...SPAWN_TARGETS]).name('target');
    f.add({ go: () => this.spawn() }, 'go').name('Spawn');
    f.add(this.p, 'spawnStatus').name('status').disable();
    f.add({ go: () => this.w.debugKillAll() }, 'go').name('Kill all');
    f.add(this.p, 'jumpWave', 1, Math.max(1, this.w.totalWaves), 1).name('wave');
    f.add({ go: () => this.w.debugJumpToWave(this.p.jumpWave) }, 'go').name('Jump to wave');
    f.add({ go: () => this.w.debugEnd(true) }, 'go').name('Win now');
    f.add({ go: () => this.w.debugEnd(false) }, 'go').name('Lose now');
  }

  private spawn() {
    const w = this.w;
    const n = Math.round(this.p.spawnCount);
    const t = this.p.spawnTarget;
    this.p.spawnStatus = '';
    if (t === 'at last click') {
      const g = this.host.lastClickGround();
      if (!g) {
        this.p.spawnStatus = 'click the map first';
        this.refreshStats();
        return;
      }
      w.debugSpawn(this.p.spawnKind, n, { x: g.x, y: g.y });
    } else if (t === 'at knight') {
      const k = w.players[0];
      w.debugSpawn(this.p.spawnKind, n, { x: k.x, y: k.y });
    } else {
      w.debugSpawn(this.p.spawnKind, n, t);
    }
    this.refreshStats();
  }

  private buildKnight() {
    const f = this.gui.addFolder('Knight');
    f.add({ go: () => this.w.debugHealKnight() }, 'go').name('Heal');
    f.add(this.p, 'xpAmount', 1, 1000, 1).name('xp amount');
    f.add({ go: () => this.w.debugGiveXp(this.p.xpAmount) }, 'go').name('+XP');
    f.add({ go: () => this.w.debugGiveXp(this.w.progression.xpToNext) }, 'go').name('Level up');
    const opts = Object.fromEntries(UPGRADES.map((u) => [`${u.name} (${u.pool})`, u.id]));
    f.add(this.p, 'upgrade', opts).name('upgrade');
    f.add({ go: () => this.grant() }, 'go').name('Grant upgrade');
    f.add(this.p, 'weapon', WEAPON_ORDER).name('weapon').onChange(() => this.equip());
    f.add(this.p, 'weaponRank', 0, MAX_WEAPON_RANK, 1).name('weapon rank').onChange(() => this.equip());
    f.add(this.p, 'upgradeStatus').name('status').disable();
    this.takenController = f.add(this.p, 'taken').name('taken').disable();
  }

  private equip() {
    this.w.debugSetWeapon(this.p.weapon as WeaponKind, this.p.weaponRank);
  }

  private grant() {
    const ok = this.w.debugGiveUpgrade(this.p.upgrade);
    this.p.upgradeStatus = ok ? 'granted' : 'maxed (or unknown)';
    this.refreshStats();
  }

  private buildArmy() {
    const f = this.gui.addFolder('Army');
    f.add({ go: () => this.w.debugAddRookie('swordsman') }, 'go').name('Add swordsman');
    f.add({ go: () => this.w.debugAddRookie('archer') }, 'go').name('Add archer');
  }

  private buildBuildings() {
    const f = this.gui.addFolder('Buildings');
    this.buildingController = f.add(this.p, 'building', {}).name('building');
    this.buildingHpController = f.add(this.p, 'buildingHp', 0, 1, 0.05).name('HP fraction').onChange((v: number) => {
      this.w.debugSetBuildingHp(Number(this.p.building), v);
    });
    f.add({ go: () => this.w.debugSetBuildingHp(Number(this.p.building), 0) }, 'go').name('Destroy');
    f.add({ go: () => { for (const b of this.w.buildings) this.w.debugSetBuildingHp(b.id, 1); } }, 'go').name('Repair all');
  }

  private buildOverlays() {
    const f = this.gui.addFolder('Overlays');
    for (const name of OVERLAY_NAMES) f.add(this.host.overlays, name);
  }

  private buildProfile() {
    const f = this.gui.addFolder('Profile');
    f.add({ note: 'Unlock changes apply on the next Retry/New town' }, 'note').name('note').disable();
    for (const key of Object.keys(this.profileStats) as (keyof typeof this.profileStats)[]) {
      this.profileControllers.push(f.add(this.profileStats, key).disable());
    }
    const act = (fn: (p: Profile) => void) => () => {
      fn(this.host.profile());
      this.refreshProfile();
    };
    f.add({ go: act((p) => p.unlockAll(['barracks', 'chapel', 'smithy', 'watchtower'])) }, 'go').name('Unlock all roles');
    f.add({ go: act((p) => p.unlockAllWeapons(WEAPON_ORDER)) }, 'go').name('Unlock all weapons');
    f.add({ go: act((p) => p.addCoins(100)) }, 'go').name('+100 coins');
    f.add({ go: act((p) => p.reset()) }, 'go').name('Reset profile');
  }

  private refreshProfile() {
    const d = this.host.profile().data;
    this.profileStats.coins = String(d.coins);
    this.profileStats.roles = d.roles.join(', ') || '-';
    this.profileStats.weapons = d.weapons.join(', ') || '-';
    this.profileStats.achievements = d.achievements.join(', ') || '-';
    this.profileControllers.forEach((c) => c.updateDisplay());
  }

  private buildBalance() {
    const f = this.gui.addFolder('Balance (live)');
    f.add({ note: 'Building max HP / existing units: Retry' }, 'note').name('note').disable();
    for (const [name, obj] of Object.entries(BALANCE)) {
      const sub = f.addFolder(name);
      sub.close();
      for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (SKIP_KEYS.has(key)) continue;
        if (typeof v === 'number') {
          sub.add(obj, key).step(step(v));
        } else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
          const proxy = {
            get [key]() { return (obj[key] as number[]).join(', '); },
            set [key](s: string) {
              const nums = s.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
              if (nums.length) obj[key] = nums;
            },
          };
          sub.add(proxy, key).name(key);
        }
      }
    }
    f.add({ go: () => this.copyBalance() }, 'go').name('Copy balance JSON');
    f.add({ go: () => this.resetBalance() }, 'go').name('Reset balance');
  }

  private copyBalance() {
    const json = JSON.stringify(BALANCE, null, 2);
    console.log(json);
    void navigator.clipboard?.writeText(json)?.catch(() => undefined);
  }

  private resetBalance() {
    for (const [name, obj] of Object.entries(BALANCE)) {
      Object.assign(obj, JSON.parse(JSON.stringify(DEFAULTS[name])));
    }
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  // ------------------------------------------------------------ refresh

  /** Rebuilds per-world UI (building list, wave max) after a restart. */
  private syncWorld(initial: boolean) {
    const w = this.w;
    this.lastWorld = w;
    const opts: Record<string, number> = {};
    for (const b of w.buildings) {
      const kind = w.map.buildings[b.id]?.kind ?? '?';
      opts[`#${b.id} ${kind} ${b.cells.length}c`] = b.id;
    }
    this.buildingController = this.buildingController.options(opts);
    this.p.building = w.buildings[0]?.id ?? 0;
    this.buildingController.updateDisplay();
    if (!initial) this.p.jumpWave = Math.min(this.p.jumpWave, w.totalWaves);
    this.gui.controllersRecursive().forEach((c) => {
      if (c.property === 'jumpWave') c.max(Math.max(1, w.totalWaves));
    });
  }

  private refreshStats() {
    this.lastStatsAt = performance.now();
    const w = this.w;
    const s = this.stats;
    const info = w.debugInfo();
    const alive: Record<string, number> = {};
    for (const m of w.monsters) if (m.state !== 'dead') alive[m.kind] = (alive[m.kind] ?? 0) + 1;
    const total = Object.values(alive).reduce((a, b) => a + b, 0);
    const k = w.players[0];
    s.time = `${w.time.toFixed(1)} s (${w.status})`;
    s.wave = `${w.wave}/${w.totalWaves}`;
    s.nextWave = info.nextWaveAt === null ? '-' : `${Math.max(0, info.nextWaveAt - w.time).toFixed(1)} s (#${info.nextWave})`;
    s.monsters = `${total} (${Object.entries(alive).map(([a, n]) => `${a} ${n}`).join(', ') || '-'})`;
    s.rookies = `${w.rookies.filter((r) => r.state !== 'dead').length}/${w.rookieCap}`;
    s.kills = String(w.kills);
    s.knight = `Lv ${w.progression.level}  ${w.progression.xp}/${w.progression.xpToNext} xp  ${k ? `${Math.ceil(k.hp)}/${k.maxHp} hp` : ''}`;
    s.buildings = `${w.standingBuildings()}/${w.buildings.length}`;
    s.fps = String(this.fps);
    s.seed = String(this.host.seed());
    const taken = Object.entries(w.progression.levels).filter(([, n]) => n > 0);
    this.p.taken = taken.map(([id, n]) => `${id}×${n}`).join(', ') || '-';
    this.statControllers.forEach((c) => c.updateDisplay());
    this.refreshProfile();
    this.takenController.updateDisplay();
    this.gui.controllersRecursive().forEach((c) => {
      if (c.property === 'spawnStatus' || c.property === 'upgradeStatus') c.updateDisplay();
    });
    const b = w.buildings[Number(this.p.building)];
    if (b && document.activeElement !== this.buildingHpController.domElement.querySelector('input')) {
      this.p.buildingHp = b.maxHp > 0 ? b.hp / b.maxHp : 0;
      this.buildingHpController.updateDisplay();
    }
  }
}
