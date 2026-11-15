// What the game flow (GameController) needs from whatever draws the world.
// Implemented by render3d/ThreeRenderer. Nothing here may depend on three.js, so game flow stays
// testable with a fake renderer (tests/helpers/game.ts).

import type { RoleKind } from '../data/roles';
import type { Vec2 } from '../sim/types';
import type { SimEvent, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';

export interface RendererStats {
  /** Camera zoom (screen px per world px). */
  zoom: number;
  /** On-screen height of the knight in px, for readability checks. */
  charPx: number;
}

export interface Renderer {
  /** Draws the current world state. `dt` is real seconds since the last call (0 when stepping). */
  sync(world: World, dt: number): void;
  /** Visual reaction to one sim event: flashes, numbers, shakes, telegraphs. No game-flow effects. */
  onEvent(world: World, e: SimEvent): void;
  /** Calls `handler` with the ground position under every pointer press on the map. */
  onGroundPointerDown(handler: (ground: Vec2) => void): void;
  /** Planning phase: role auras are shown strongly while on. */
  setPlanning(on: boolean): void;
  /** Highlights a building (-1 for none). */
  highlightBuilding(id: number): void;
  /** Shows a role on a building (null clears it). */
  setRole(id: number, role: RoleKind | null): void;
  /** The knight's weapon changed during planning; redraw him with it. */
  knightWeaponChanged(): void;
  /** Debug overlays (flow fields, hitboxes...). Only called in debug mode. */
  updateDebugOverlay(world: World, overlays: Record<OverlayName, boolean>): void;
  /** Where a ground point is drawn, in CSS pixels from the game area's top-left (automation crops). */
  screenOf(ground: Vec2): Vec2;
  stats(): RendererStats;
  destroy(): void;
}
