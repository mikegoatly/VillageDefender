// Fixed isometric camera (decision 1: the whole town is always in view).
// Ground (x, y) in the sim is world (x, z) here; one cell is one world unit.

import * as THREE from 'three';
import type { TownMap } from '../sim/map';

/** Same elevation as the Sketch tiles and the sprite bake, so the sim's screen maths still holds. */
export const ELEVATION = Math.asin(110 / 232);

/** Unit vector from the look-at point towards the camera (it looks down the -X,-Z diagonal). */
export const CAMERA_DIR = new THREE.Vector3(
  Math.cos(ELEVATION) / Math.SQRT2, Math.sin(ELEVATION), Math.cos(ELEVATION) / Math.SQRT2,
);

/** Where a ground point lands on the camera plane (world units; x right, y down the screen). */
export function projectGround(x: number, z: number): { sx: number; sy: number } {
  return { sx: (x - z) / Math.SQRT2, sy: ((x + z) / Math.SQRT2) * Math.sin(ELEVATION) };
}

export interface View {
  /** Ground point the camera looks at. */
  x: number;
  z: number;
  /** Half the width / height (camera-plane units) that must stay visible. */
  halfW: number;
  halfH: number;
  /** Radius around the target that the sun's shadow camera must cover. */
  reach: number;
}

/** Margins (camera-plane units): tall buildings/trees at the top edge, half a cell elsewhere. */
const MARGIN = { top: 2.2, bottom: 0.8, side: 0.9 };

export function fitView(map: TownMap): View {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const side of Object.values(map.edges)) {
    for (const [i, j] of side) {
      const { sx, sy } = projectGround(i, j);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  minY -= MARGIN.top; maxY += MARGIN.bottom; minX -= MARGIN.side; maxX += MARGIN.side;
  // Invert projectGround for the centre of the box.
  const a = ((minX + maxX) / 2) * Math.SQRT2;
  const b = (((minY + maxY) / 2) * Math.SQRT2) / Math.sin(ELEVATION);
  return {
    x: (a + b) / 2, z: (b - a) / 2,
    halfW: (maxX - minX) / 2, halfH: (maxY - minY) / 2,
    reach: Math.max(maxX - minX, (maxY - minY) / Math.sin(ELEVATION)) / 2 + 3,
  };
}

/** Frustum half-extents that show the whole view at this aspect ratio (letterboxing the spare axis). */
export function frustumFor(view: View, aspect: number): { halfW: number; halfH: number } {
  const halfH = Math.max(view.halfH, view.halfW / aspect);
  return { halfW: halfH * aspect, halfH };
}
