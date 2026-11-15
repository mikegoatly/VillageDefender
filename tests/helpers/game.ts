// Fakes and a builder for GameController tests (needs a DOM: use the happy-dom environment).

import { vi } from 'vitest';
import { TOWNS } from '../../src/data/towns';
import { GameController, type AudioPort, type GameHost } from '../../src/game/GameController';
import type { Renderer } from '../../src/game/Renderer';
import type { Params, Session, SessionData } from '../../src/game/session';
import { Profile } from '../../src/meta/profile';
import type { Vec2 } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { memoryStore } from './profile';

/** Renderer that draws nothing and records every call; `click` simulates a pointer press on the map. */
export function fakeRenderer() {
  const handlers: ((g: Vec2) => void)[] = [];
  const renderer = {
    sync: vi.fn<Renderer['sync']>(),
    onEvent: vi.fn<Renderer['onEvent']>(),
    onGroundPointerDown: vi.fn<Renderer['onGroundPointerDown']>((h) => void handlers.push(h)),
    setPlanning: vi.fn<Renderer['setPlanning']>(),
    highlightBuilding: vi.fn<Renderer['highlightBuilding']>(),
    setRole: vi.fn<Renderer['setRole']>(),
    knightWeaponChanged: vi.fn<Renderer['knightWeaponChanged']>(),
    updateDebugOverlay: vi.fn<Renderer['updateDebugOverlay']>(),
    screenOf: vi.fn<Renderer['screenOf']>((g) => g),
    stats: vi.fn<Renderer['stats']>(() => ({ zoom: 1, charPx: 50 })),
    destroy: vi.fn<Renderer['destroy']>(),
  } satisfies Renderer;
  return { ...renderer, click: (x: number, y: number) => handlers.forEach((h) => h({ x, y })) };
}

export function fakeAudio() {
  return {
    settings: { master: 1, sfx: 1, music: 1, muted: false },
    music: vi.fn<AudioPort['music']>(),
    play: vi.fn<AudioPort['play']>(),
    handleEvents: vi.fn<AudioPort['handleEvents']>(),
    setSettings: vi.fn<AudioPort['setSettings']>(),
    destroy: vi.fn<AudioPort['destroy']>(),
  } satisfies AudioPort;
}

export interface BuiltGame {
  controller: GameController;
  world: World;
  renderer: ReturnType<typeof fakeRenderer>;
  audio: ReturnType<typeof fakeAudio>;
  profile: Profile;
  restarts: SessionData[];
  /** Runs `frames` rendered frames of 1/60 s. */
  frames(n: number): void;
}

/** A controller around `world` with fake renderer/audio/host and an in-memory profile. */
export function aGame(world: World, over: { params?: Partial<Params>; inMenu?: boolean; profile?: Profile } = {}): BuiltGame {
  const params: Params = { seed: 1, speed: 1, god: false, wave: 1, plan: true, ...over.params };
  const session: Session = { world, params, town: TOWNS[0], inMenu: over.inMenu ?? false };
  const renderer = fakeRenderer();
  const audio = fakeAudio();
  const profile = over.profile ?? new Profile(memoryStore());
  const restarts: SessionData[] = [];
  const host: GameHost = { restart: (d) => void restarts.push(d) };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const controller = new GameController({ session, renderer, audio, host, profile, root });
  return {
    controller, world, renderer, audio, profile, restarts,
    frames: (n) => { for (let k = 0; k < n; k++) controller.update(1000 / 60); },
  };
}
