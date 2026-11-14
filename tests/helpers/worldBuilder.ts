// Fluent World builder plus tick/input helpers for sim tests.

import { DT } from '../../src/data/balance';
import type { TownMap } from '../../src/sim/map';
import { emptyInput, type InputState } from '../../src/sim/types';
import { World, type Unit, type WorldOptions } from '../../src/sim/world';
import { mapFromAscii, openField } from './mapBuilder';

export interface BuiltWorld {
  world: World;
  knight: Unit;
  zombies: Unit[];
}

export class WorldBuilder {
  private opts: WorldOptions = { seed: 1, noWaves: true };
  private mapVal: TownMap | undefined;
  private knightPos: [number, number] | undefined;
  private zombiePos: [number, number][] = [];

  withSeed(seed: number) { this.opts.seed = seed; return this; }
  withMap(rows: string[]) { this.mapVal = mapFromAscii(rows); return this; }
  withTownMap(map: TownMap) { this.mapVal = map; return this; }
  noWaves(v = true) { this.opts.noWaves = v; return this; }
  withWaves() { this.opts.noWaves = false; return this; }
  god(v = true) { this.opts.god = v; return this; }
  startWave(n: number) { this.opts.startWave = n; return this; }
  withKnightAt(x: number, y: number) { this.knightPos = [x, y]; return this; }
  withZombieAt(x: number, y: number) { this.zombiePos.push([x, y]); return this; }

  build(): BuiltWorld {
    // Without an explicit map and not a default-options world, use an open field.
    const map = this.mapVal ?? (this.opts.noWaves ? openField() : undefined);
    const world = new World({ ...this.opts, map });
    const knight = world.players[0];
    if (this.knightPos) [knight.x, knight.y] = this.knightPos;
    else if (map) { knight.x = map.centre; knight.y = map.centre; }
    const zombies = this.zombiePos.map(([x, y]) => world.addMonster(x, y));
    return { world, knight, zombies };
  }
}

export const aWorld = () => new WorldBuilder();

export function runTicks(world: World, n: number, input: InputState = emptyInput()) {
  for (let k = 0; k < n; k++) world.tick([input]);
}

export function runSeconds(world: World, seconds: number, inputFn?: (w: World) => InputState) {
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) world.tick([inputFn ? inputFn(world) : emptyInput()]);
}

/** Runs ticks until pred is true or maxTicks elapses; returns the tick count used. */
export function runUntil(world: World, pred: (w: World) => boolean, maxTicks: number, input: InputState = emptyInput()) {
  let k = 0;
  while (k < maxTicks && !pred(world)) { world.tick([input]); k++; }
  return k;
}

export function holdAttack(): InputState { return { ...emptyInput(), attack: true }; }
export function holdDodge(): InputState { return { ...emptyInput(), dodge: true }; }
export function moveScreen(x: number, y: number): InputState { return { ...emptyInput(), move: { x, y } }; }

/** All events of a type seen while running ticks. */
export function collectEvents(world: World, ticks: number, input: InputState = emptyInput()) {
  const all: World['events'] = [];
  for (let k = 0; k < ticks; k++) { world.tick([input]); all.push(...world.events); }
  return all;
}
