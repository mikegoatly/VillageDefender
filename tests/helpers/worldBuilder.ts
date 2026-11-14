// Fluent World builder plus tick/input helpers for sim tests.

import { DT } from '../../src/data/balance';
import type { MonsterKind } from '../../src/data/monsters';
import type { RookieKind } from '../../src/data/rookies';
import { UPGRADE_BY_ID, type UpgradeOffer } from '../../src/data/upgrades';
import type { WaveDef } from '../../src/data/waves';
import type { TownMap } from '../../src/sim/map';
import { emptyInput, type InputState } from '../../src/sim/types';
import { World, type Unit, type WorldOptions } from '../../src/sim/world';
import { mapFromAscii, openField } from './mapBuilder';

export interface BuiltWorld {
  world: World;
  knight: Unit;
  zombies: Unit[];
  /** Every monster added through the builder, in order. */
  monsters: Unit[];
  /** Every rookie added through the builder, in order. */
  rookies: Unit[];
}

export class WorldBuilder {
  private opts: WorldOptions = { seed: 1, noWaves: true };
  private mapVal: TownMap | undefined;
  private knightPos: [number, number] | undefined;
  private monsterSpecs: { kind: MonsterKind; x: number; y: number }[] = [];
  private rookieSpecs: { kind: RookieKind; x: number; y: number }[] = [];
  private upgradeSpecs: Record<string, number> = {};

  withSeed(seed: number) { this.opts.seed = seed; return this; }
  withMap(rows: string[]) { this.mapVal = mapFromAscii(rows); return this; }
  withTownMap(map: TownMap) { this.mapVal = map; return this; }
  noWaves(v = true) { this.opts.noWaves = v; return this; }
  /** Enables wave spawning, optionally with a custom wave table. */
  withWaves(table?: WaveDef[]) { this.opts.noWaves = false; if (table) this.opts.waves = table; return this; }
  god(v = true) { this.opts.god = v; return this; }
  startWave(n: number) { this.opts.startWave = n; return this; }
  withKnightAt(x: number, y: number) { this.knightPos = [x, y]; return this; }
  withZombieAt(x: number, y: number) { return this.withMonster('zombie', x, y); }
  withMonster(kind: MonsterKind, x: number, y: number) { this.monsterSpecs.push({ kind, x, y }); return this; }
  withRookie(kind: RookieKind, x: number, y: number) { this.rookieSpecs.push({ kind, x, y }); return this; }
  /** Disables kill-threshold recruitment. */
  noRookies(v = true) { this.opts.noRookies = v; return this; }
  /** Upgrades to take (id → stacks) through the real pick path; applied after the world is built. */
  withUpgrades(levels: Record<string, number>) { this.upgradeSpecs = { ...levels }; return this; }

  build(): BuiltWorld {
    // Without an explicit map and not a default-options world, use an open field.
    const map = this.mapVal ?? (this.opts.noWaves ? openField() : undefined);
    const world = new World({ ...this.opts, map });
    const knight = world.players[0];
    if (this.knightPos) [knight.x, knight.y] = this.knightPos;
    else if (map) { knight.x = map.centre; knight.y = map.centre; }
    const monsters = this.monsterSpecs.map((s) => world.addMonster(s.x, s.y, s.kind));
    const zombies = monsters.filter((m) => m.kind === 'zombie');
    for (const [id, n] of Object.entries(this.upgradeSpecs)) for (let k = 0; k < n; k++) pickUpgrade(world, id);
    // Rookies are added after upgrades so they pick up army mods.
    const rookies = this.rookieSpecs.map((s) => world.addRookie(s.x, s.y, s.kind));
    return { world, knight, zombies, monsters, rookies };
  }
}

export const aWorld = () => new WorldBuilder();

/** Chooses a card index from the current offers. */
export type Chooser = (offers: UpgradeOffer[]) => number;

/**
 * Takes one stack of a specific upgrade through the real path (addXp opens a choice, chooseUpgrade
 * applies it and recomputes mods). The offers are normally random, so the opened offer is replaced by
 * a hand-built card for `id` (Progression.offers is a public field). Side effect: knight level +1.
 */
export function pickUpgrade(world: World, id: string) {
  const def = UPGRADE_BY_ID[id];
  if (!def) throw new Error(`unknown upgrade ${id}`);
  if (!world.choosing) world.progression.addXp(world.progression.xpToNext);
  if (!world.progression.offers) throw new Error('no offers to replace (all upgrades maxed?)');
  const level = world.progression.levels[id] ?? 0;
  if (level >= def.max) throw new Error(`${id} already maxed`);
  world.progression.offers = [{ id, name: def.name, description: def.describe(level), pool: def.pool, level, max: def.max }];
  world.chooseUpgrade(0);
}

/** Resolves every open choice with the chooser (bounded). */
export function resolveChoices(world: World, choose: Chooser) {
  for (let k = 0; world.choosing && k < 100; k++) world.chooseUpgrade(choose(world.progression.offers!));
}

/** Like `step`, but upgrade choices go through `choose` instead of always taking card 0. */
export function stepWith(world: World, input: InputState, choose: Chooser) {
  resolveChoices(world, choose);
  world.tick([input]);
}

/**
 * One sim tick for tests. If the world is paused for a level-up choice, picks the first card
 * first (otherwise the world never advances and time-based loops spin forever).
 */
export function step(world: World, input: InputState = emptyInput()) {
  while (world.choosing) world.chooseUpgrade(0);
  world.tick([input]);
}

export function runTicks(world: World, n: number, input: InputState = emptyInput()) {
  for (let k = 0; k < n; k++) step(world, input);
}

export function runSeconds(world: World, seconds: number, inputFn?: (w: World) => InputState) {
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) step(world, inputFn ? inputFn(world) : emptyInput());
}

/** Runs ticks until pred is true or maxTicks elapses; returns the tick count used. */
export function runUntil(world: World, pred: (w: World) => boolean, maxTicks: number, input: InputState = emptyInput()) {
  let k = 0;
  while (k < maxTicks && !pred(world)) { step(world, input); k++; }
  return k;
}

export function holdAttack(): InputState { return { ...emptyInput(), attack: true }; }
export function holdDodge(): InputState { return { ...emptyInput(), dodge: true }; }
export function moveScreen(x: number, y: number): InputState { return { ...emptyInput(), move: { x, y } }; }

/** All events of a type seen while running ticks. */
export function collectEvents(world: World, ticks: number, input: InputState = emptyInput()) {
  const all: World['events'] = [];
  for (let k = 0; k < ticks; k++) { step(world, input); all.push(...world.events); }
  return all;
}
