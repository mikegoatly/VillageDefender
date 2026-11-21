// Game flow for one session: steps the sim at a fixed rate, wires input, HUD, menus, planning,
// the profile and the debug tools, and tells a Renderer what to draw. Knows nothing about how
// drawing is done (no three.js).

import { ACHIEVEMENTS } from '../data/achievements';
import { DT } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROLE_ORDER, ROLES, type RoleKind } from '../data/roles';
import type { TownDef } from '../data/towns';
import { POWER_NAMES } from '../data/upgrades';
import { RANK_NUMERALS, WEAPON_ORDER, WEAPONS, type WeaponKind } from '../data/weapons';
import type { GameAudio } from '../audio/GameAudio';
import { InputManager } from '../input/InputManager';
import { dirVec } from '../input/PadNav';
import type { Profile } from '../meta/profile';
import { emptyInput, type InputState, type Vec2 } from '../sim/types';
import type { SimEvent, World } from '../sim/world';
import { DebugPanel, debugEnabled, type DebugHost, type OverlayName } from '../ui/DebugPanel';
import { Hud, type HudWorld } from '../ui/Hud';
import { LevelUpPanel } from '../ui/LevelUpPanel';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { PlanningPanel, type PlanningView } from '../ui/PlanningPanel';
import { installRotateOverlay } from '../ui/RotateOverlay';
import type { Renderer } from './Renderer';
import { pickInDirection } from './spatialPick';
import { randomSeed, type Params, type Session, type SessionData } from './session';

/** Weapon picker glyphs. */
const WEAPON_ICONS: Record<WeaponKind, string> = { sword: '⚔', spear: '↟', hammer: '🔨', axes: '🪓', flail: '✺' };
const ROTATE_CLASS = 'vd-rotate-active';

/** The part of GameAudio the game flow uses. */
export type AudioPort = Pick<GameAudio, 'music' | 'play' | 'handleEvents' | 'settings' | 'setSettings' | 'destroy'>;

export interface GameHost {
  /** Ends this session and starts a new one. */
  restart(data: SessionData): void;
}

export interface GameControllerDeps {
  session: Session;
  renderer: Renderer;
  audio: AudioPort;
  host: GameHost;
  profile: Profile;
  /** Element the game is drawn in (touch controls attach here). */
  root: HTMLElement;
  /** Parent for HUD, panels and menus; defaults to document.body. */
  uiRoot?: HTMLElement;
}

/** Debug state that survives restarts (the panel lives outside any one session). */
const debugState = {
  panel: null as DebugPanel | null,
  speed: null as number | null,
  paused: false,
  overlays: { flowKnight: false, flowBuildings: false, hitboxes: false, ranges: false, labels: false, light: false } as Record<OverlayName, boolean>,
  lastClick: null as { x: number; y: number } | null,
};
/** The live controller; the debug panel outlives sessions and always talks to this one. */
let current: GameController | null = null;

/**
 * Seconds the sim should freeze for an event (juice: big impacts land harder), 0 for none.
 * Call while the event is fresh: it looks the unit up in the world.
 */
export function hitStopFor(world: World, e: SimEvent): number {
  switch (e.type) {
    case 'hit':
      return e.damage >= 20 && world.monsters.some((u) => u.id === e.unit) ? 0.035 : 0;
    case 'death': {
      const m = world.monsters.find((u) => u.id === e.unit);
      return m?.kind === 'warlord' ? 0.25 : m?.kind === 'brute' ? 0.07 : 0;
    }
    case 'bossBoulder':
      return 0.06;
    case 'blackout':
      return 0.08;
    case 'bossSlam':
      return 0.09;
    case 'explosion':
      return 0.05;
    default:
      return 0;
  }
}

export class GameController {
  readonly world: World;
  private readonly params: Params;
  private readonly town: TownDef;
  private readonly renderer: Renderer;
  private readonly audio: AudioPort;
  private readonly host: GameHost;
  private readonly profile: Profile;
  private readonly uiRoot: HTMLElement;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly levelUp: LevelUpPanel;
  private readonly pauseMenu: PauseMenu;
  private readonly uninstallRotate: () => void;
  private readonly debug = debugEnabled();
  private planning?: PlanningPanel;
  private menu?: MainMenu;
  private accumulator = 0;
  private override: InputState | null = null;
  /** House selected while planning (-1 none). */
  private selected = -1;
  /** Dark lamp post selected while planning (night towns; -1 none). Never set together with `selected`. */
  private selectedLamp = -1;
  private endExtras: HudWorld['endExtras'];
  /** Seconds left of hit-stop: the sim freezes briefly on big impacts. */
  private hitStop = 0;
  /** Pause input last frame, so pausing needs a fresh press (not a held button after resume). */
  private pauseHeld = false;
  private readonly onVisibility = () => {
    // Automation drives the game through an override and may run in a hidden tab: leave it be.
    if (document.visibilityState === 'hidden' && !this.override) this.pause();
  };

  constructor(deps: GameControllerDeps) {
    this.world = deps.session.world;
    this.params = deps.session.params;
    this.town = deps.session.town;
    this.renderer = deps.renderer;
    this.audio = deps.audio;
    this.host = deps.host;
    this.profile = deps.profile;
    this.uiRoot = deps.uiRoot ?? document.body;
    current = this;

    this.input = new InputManager({ root: deps.root });
    this.input.setTrapAvailable(this.world.hasPower('trap'));
    this.uninstallRotate = installRotateOverlay(this.uiRoot);
    this.hud = new Hud(this.uiRoot, {
      onRetry: () => this.restart(this.params.seed),
      onNewTown: () => this.restart(),
      onMenu: () => this.host.restart({ menu: true }),
      onPause: () => this.pause(),
    });
    this.levelUp = new LevelUpPanel(this.uiRoot, (i) => this.choose(i));
    this.pauseMenu = new PauseMenu(this.uiRoot, {
      onResume: () => {},
      onRestart: () => this.restart(this.params.seed),
      onQuit: () => this.host.restart({ menu: true }),
      muted: () => this.audio.settings.muted,
      setMuted: (muted) => this.audio.setSettings({ muted }),
      uiSound: () => this.audio.play('uiClick'),
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.audio.music(this.world.phase === 'planning' ? 'plan' : 'play');
    this.setupDebug();
    if (deps.session.inMenu) this.setupMenu();
    else this.setupPlanning();
    this.exposeDebug();
  }

  /** One rendered frame: advance the sim by the elapsed time, then draw. */
  update(deltaMs: number) {
    const rotatePaused = document.documentElement.classList.contains(ROTATE_CLASS);
    const input = this.override ?? this.input.poll();
    if (input.pause && !this.pauseHeld) this.pause();
    this.pauseHeld = input.pause;
    // While paused the sim is frozen but the scene is still drawn.
    if (this.paused || rotatePaused || debugState.paused) { /* frozen */ }
    else if (this.hitStop > 0) this.hitStop -= deltaMs / 1000;
    else {
      this.accumulator += Math.min(deltaMs / 1000, 0.1) * this.params.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < 8 * Math.max(1, this.params.speed)) {
        this.world.tick([input]);
        this.handleEvents();
        this.accumulator -= DT;
        steps++;
      }
    }
    this.renderer.sync(this.world, deltaMs / 1000);
    this.syncUi();
    if (this.debug) this.renderer.updateDebugOverlay(this.world, debugState.overlays);
    debugState.panel?.update();
  }

  /** Advances the sim by n ticks immediately (debug/automation). */
  step(n: number, input: InputState = this.override ?? emptyInput()) {
    for (let k = 0; k < n; k++) {
      this.world.tick([input]);
      this.handleEvents();
    }
    this.renderer.sync(this.world, 0);
    this.syncUi();
  }

  restart(seed?: number, town = this.town.id) {
    this.host.restart({ seed: seed ?? randomSeed(), town });
  }

  /** Picks a level-up card. */
  choose(index: number) {
    this.world.chooseUpgrade(index);
    this.handleEvents();
    this.syncUi();
  }

  get paused(): boolean {
    return this.pauseMenu.visible;
  }

  /** Opens the pause menu (only mid-run: not while planning, choosing an upgrade or after the end). */
  pause() {
    const w = this.world;
    if (this.paused || this.menu || w.phase !== 'running' || w.status !== 'playing' || w.choosing) return;
    this.pauseMenu.show();
  }

  setInputOverride(input: InputState | null) {
    this.override = input;
  }

  destroy() {
    this.input.destroy();
    this.uninstallRotate();
    this.hud.destroy();
    this.levelUp.destroy();
    this.pauseMenu.destroy();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.planning?.destroy();
    this.menu?.destroy();
    document.body.classList.remove('vd-menu-open', 'vd-planning');
    this.audio.destroy();
    this.renderer.destroy();
    if (current === this) current = null;
  }

  // ------------------------------------------------------------------ events and UI

  private handleEvents() {
    this.audio.handleEvents(this.world.events);
    for (const e of this.world.events) {
      this.hitStop = Math.max(this.hitStop, hitStopFor(this.world, e));
      this.renderer.onEvent(this.world, e);
      if (e.type === 'waveWarning') this.hud.warn(e.wave, e.sides);
    }
  }

  /**
   * Records the finished run in the profile exactly once, however it ended (normal play or the
   * debug panel, whose events can be cleared by the next tick before anything sees them).
   */
  private recordRunIfEnded() {
    if (this.world.status === 'playing' || this.endExtras) return;
    const outcome = this.profile.recordRun(this.world.runResult());
    this.endExtras = {
      coins: outcome.coins, wallet: this.profile.data.coins,
      achievements: outcome.newAchievements.map((a) => ({ name: a.name, description: a.description })),
      unlocks: [...outcome.unlockedRoles.map((r) => ROLES[r].name), ...outcome.unlockedWeapons.map((w) => WEAPONS[w].name), ...outcome.unlockedPowers.map((p) => POWER_NAMES[p])],
    };
    this.audio.music(null);
  }

  /** HUD and the level-up panel (the sim pauses itself while a choice is open). */
  private syncUi() {
    this.recordRunIfEnded();
    this.hud.update(this.hudView());
    const offers = this.world.progression.offers;
    if (offers && this.world.status === 'playing') this.levelUp.show(offers, this.world.progression.level);
    else if (this.levelUp.visible) this.levelUp.hide();
  }

  private hudView(): HudWorld {
    const w = this.world;
    return {
      status: w.status, lossReason: w.lossReason, wave: w.wave, totalWaves: w.totalWaves, time: w.time,
      kills: w.kills, stars: w.stars, players: w.players, buildings: w.buildings,
      knightLevel: w.progression.level, xp: w.progression.xp, xpToNext: w.progression.xpToNext,
      rookies: w.rookies.filter((r) => r.state !== 'dead').length, rookieCap: w.rookieCap,
      endExtras: this.endExtras,
      boss: w.boss ? { name: MONSTERS[w.boss.kind as MonsterKind].name ?? this.town.bossName, hp: w.boss.hp, maxHp: w.boss.maxHp } : null,
    };
  }

  // ------------------------------------------------------------------ menu and planning (3b)

  /** Front-end menu over the (frozen) background town. */
  private setupMenu() {
    document.body.classList.add('vd-menu-open');
    this.menu = new MainMenu(this.uiRoot, {
      profile: () => this.profile,
      audioSettings: () => ({ ...this.audio.settings }),
      setAudioSettings: (p) => this.audio.setSettings(p),
      onPlay: (town) => this.host.restart({ seed: randomSeed(), town, menu: false }),
      onResetProgress: () => this.profile.reset(),
      uiSound: () => this.audio.play('uiClick'),
    });
    this.menu.show('title');
  }

  private setupPlanning() {
    if (this.world.phase !== 'planning') return;
    this.planning = new PlanningPanel(this.uiRoot, {
      onAssign: (id, role) => this.assignRole(id, role),
      onSelectNext: (d) => this.selectPick(this.cyclePick(d)),
      onSelectDir: (d) => this.selectPick(this.pickInDirection(dirVec(d))),
      onStart: () => this.startTown(),
      onWeapon: (kind) => this.chooseWeapon(kind as WeaponKind),
      onLamp: (id, lit) => this.lightLamp(id, lit),
    });
    this.renderer.setPlanning(true);
    document.body.classList.add('vd-planning');
    this.renderer.onGroundPointerDown((g) => {
      if (this.world.phase !== 'planning') return;
      const lamp = this.lampAt(g);
      if (lamp >= 0) return this.selectLamp(lamp);
      // Buildings are tall: also try the cells just below the click (roofs sit above their footprint).
      for (const [di, dj] of [[0, 0], [1, 1], [2, 2], [1, 0], [0, 1]]) {
        const b = this.world.buildingAt(Math.round(g.x) + di, Math.round(g.y) + dj);
        if (b) return this.selectBuilding(b.id);
      }
      this.selectBuilding(-1);
    });
    this.selectBuilding(-1);
  }

  /**
   * Lamp posts the player may light while planning (night towns with oil): the ones that start dark.
   * Picks (selection, cycling, D-pad) number houses by id and these posts as LAMP_PICK + lamp id.
   */
  private oilLamps() {
    return this.world.lampOil > 0 ? this.world.lamps.filter((l) => !l.startsLit) : [];
  }

  /** The current selection as a pick id (-1 none). */
  private get pick(): number {
    return this.selectedLamp >= 0 ? LAMP_PICK + this.selectedLamp : this.selected;
  }

  private selectPick(pick: number) {
    if (pick >= LAMP_PICK) this.selectLamp(pick - LAMP_PICK);
    else this.selectBuilding(pick);
  }

  /** The house or dark lamp post on screen in direction `dir` from the selection (nearest the centre if none). */
  private pickInDirection(dir: Vec2): number {
    const w = this.world;
    const items = w.buildings.map((b) => {
      const cells = w.map.buildings[b.id].cells;
      let x = 0;
      let y = 0;
      for (const [i, j] of cells) { x += i; y += j; }
      return { id: b.id, pos: this.renderer.screenOf({ x: x / cells.length, y: y / cells.length }) };
    });
    for (const l of this.oilLamps()) items.push({ id: LAMP_PICK + l.id, pos: this.renderer.screenOf({ x: l.x, y: l.y }) });
    const centre = this.renderer.screenOf({ x: w.map.centre, y: w.map.centre });
    return pickInDirection(items, this.pick, dir, centre);
  }

  /** Next / previous pick: every house, then every dark lamp post. */
  private cyclePick(d: 1 | -1): number {
    const picks = [...this.world.buildings.map((b) => b.id), ...this.oilLamps().map((l) => LAMP_PICK + l.id)];
    const n = picks.length;
    if (!n) return -1;
    const k = picks.indexOf(this.pick);
    return k < 0 ? picks[d > 0 ? 0 : n - 1] : picks[(k + d + n) % n];
  }

  /** A dark lamp post under a map press (its head stands above the ground, so a little below counts too), or -1. */
  private lampAt(g: Vec2): number {
    let best = -1;
    let bestD = LAMP_PICK_RADIUS;
    for (const l of this.oilLamps()) {
      for (const [dx, dy] of [[0, 0], [0.5, 0.5], [1, 1]]) {
        const d = Math.hypot(g.x + dx - l.x, g.y + dy - l.y);
        if (d < bestD) { bestD = d; best = l.id; }
      }
    }
    return best;
  }

  selectBuilding(id: number) {
    this.selected = id;
    this.selectedLamp = -1;
    this.renderer.highlightBuilding(id);
    this.renderer.highlightLamp(-1);
    this.refreshPlanning();
  }

  /** Night towns, planning: selects a dark lamp post (-1 none). */
  selectLamp(id: number) {
    this.selectedLamp = id;
    this.selected = -1;
    this.renderer.highlightBuilding(-1);
    this.renderer.highlightLamp(id);
    this.refreshPlanning();
  }

  /** Night towns, planning: lights a dark lamp post with oil, or puts it out again (oil back). */
  lightLamp(id: number, lit: boolean) {
    this.world.setLamp(id, lit);
    this.refreshPlanning();
  }

  assignRole(id: number, role: RoleKind | null) {
    if (this.world.setRole(id, role)) this.renderer.setRole(id, this.world.buildings[id].role);
    this.refreshPlanning();
  }

  chooseWeapon(kind: WeaponKind) {
    if (!this.profile.data.weapons.includes(kind) || !this.world.setWeapon(kind)) return;
    this.profile.setWeapon(kind);
    this.renderer.knightWeaponChanged();
    this.refreshPlanning();
  }

  startTown() {
    if (this.world.phase !== 'planning') return;
    this.world.start();
    // Shop boosts are for one run: used up the moment it starts.
    this.profile.consumeBoosts();
    this.audio.music('play');
    this.planning?.hide();
    document.body.classList.remove('vd-planning');
    this.renderer.setPlanning(false);
    this.renderer.highlightBuilding(-1);
    this.renderer.highlightLamp(-1);
    this.selected = -1;
    this.selectedLamp = -1;
  }

  private refreshPlanning() {
    if (!this.planning || this.world.phase !== 'planning') return;
    const w = this.world;
    const b = this.selected >= 0 ? w.buildings[this.selected] : null;
    const def = b ? w.map.buildings[b.id] : null;
    const view: PlanningView = {
      townName: this.town.name,
      pointsLeft: w.planningPointsLeft,
      pointsTotal: w.planningPoints,
      selected: b && def ? { id: b.id, label: `House #${b.id + 1} (${def.kind})`, role: b.role } : null,
      roles: ROLE_ORDER.map((k) => ({
        kind: k, name: ROLES[k].name, description: ROLES[k].description, cost: ROLES[k].cost, icon: ROLES[k].icon,
        locked: !w.allowedRoles.includes(k),
        lockHint: k === 'smithy' ? 'Unlock: save a town' : k === 'watchtower' ? 'Unlock: save a town with 3 stars' : undefined,
      })),
      assigned: w.buildings.filter((x) => x.role).map((x) => ROLES[x.role!].name).join(', ') || 'none yet',
      weapons: WEAPON_ORDER.map((k) => ({
        kind: k, name: `${WEAPONS[k].name} ${RANK_NUMERALS[w.weaponRanks[k] ?? 0]}`.trim(), description: WEAPONS[k].description, icon: WEAPON_ICONS[k],
        locked: !this.profile.data.weapons.includes(k),
        lockHint: weaponHint(k),
      })),
      selectedWeapon: w.weapon,
    };
    if (w.lampOil > 0) {
      view.oil = { left: w.lampOilLeft, total: w.lampOil };
      const l = this.selectedLamp >= 0 ? w.lamps[this.selectedLamp] : null;
      view.lamp = l ? { id: l.id, label: 'Lamp post', lit: l.lit, canLight: w.lampOilLeft > 0 } : null;
    }
    this.planning.show(view);
  }

  // ------------------------------------------------------------------ debug

  /** Debug panel (dev builds or ?debug=1): created once, survives restarts. */
  private setupDebug() {
    if (!this.debug) return;
    if (debugState.speed !== null) this.params.speed = debugState.speed;
    this.renderer.onGroundPointerDown((g) => {
      debugState.lastClick = g;
    });
    if (debugState.panel) return;
    // The host always reads the live controller, so it stays valid across restarts.
    const live = () => current!;
    const host: DebugHost = {
      world: () => live().world,
      seed: () => live().params.seed,
      restart: (seed?: number) => live().restart(seed),
      profile: () => live().profile,
      get speed() { return live().params.speed; },
      set speed(v: number) { live().params.speed = v; debugState.speed = v; },
      get paused() { return debugState.paused; },
      set paused(v: boolean) { debugState.paused = v; },
      stepTicks: (n: number) => live().step(n, live().override ?? live().input.poll()),
      overlays: debugState.overlays,
      lastClickGround: () => debugState.lastClick,
    };
    debugState.panel = new DebugPanel(host);
  }

  /** `window.__vd`: the automation API used by tools/ and the docs (plan §5.4). */
  private exposeDebug() {
    const vd = ((window as unknown as { __vd: Record<string, unknown> }).__vd ??= {});
    vd.world = () => this.world;
    vd.step = (n: number) => this.step(n);
    vd.setInput = (s: InputState | null) => this.setInputOverride(s);
    vd.restart = (seed?: number) => this.restart(seed);
    vd.overlays = debugState.overlays;
    vd.startTown = () => this.startTown();
    vd.pause = () => this.pause();
    vd.profile = () => this.profile;
    vd.choose = (i: number) => this.choose(i);
    vd.stats = () => this.stats();
    vd.screenOf = (x: number, y: number) => this.renderer.screenOf({ x, y });
  }

  stats() {
    const w = this.world;
    const r = this.renderer.stats();
    return {
      seed: this.params.seed,
      time: +w.time.toFixed(2),
      wave: w.wave,
      kills: w.kills,
      monsters: w.monsters.filter((m) => m.state !== 'dead').length,
      hp: w.players[0]?.hp,
      status: w.status,
      buildings: `${w.standingBuildings()}/${w.buildings.length}`,
      stars: w.stars,
      level: w.progression.level,
      choosing: w.choosing,
      rookies: w.rookies.filter((x) => x.state !== 'dead').map((x) => `${x.kind}:${x.rank}`).join(','),
      zoom: +r.zoom.toFixed(3),
      charPx: Math.round(r.charPx),
      device: this.input.activeDevice,
      cells: w.map.ground.reduce((a, g) => a + (g ? 1 : 0), 0),
    };
  }
}

/** Lamp posts are picked as this + their id (houses keep their own ids). */
const LAMP_PICK = 100000;
/** A map press this close to a dark lamp post (cells) selects it. */
const LAMP_PICK_RADIUS = 0.75;

/** Unlock hint for a locked weapon, from the achievement that rewards it. */
function weaponHint(k: WeaponKind): string | undefined {
  const a = ACHIEVEMENTS.find((x) => x.reward?.weapon === k);
  return a ? `Unlock: ${a.description.toLowerCase()}` : undefined;
}
