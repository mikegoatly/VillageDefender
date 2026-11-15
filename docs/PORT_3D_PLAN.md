# 3D renderer port — plan

Status: accepted 2026-11-15. Phases 0–2 done; phase 3 next. Started from the spike (`?look=3d`, `src/render3d/spike.ts`).

## Goal

Replace the Phaser + baked-sprite + Sketch-tile renderer with a real-time three.js renderer that
uses the Kenney GLB models directly. The simulation (`src/sim`, `src/data`), DOM UI (`src/ui`),
input and meta layers do not change behaviour.

Reverses decision 6 (Sketch tiles + baked characters) and retires decision 10 (texture budget).

## What the spike proved

| Question | Answer |
|---|---|
| Does the sim drive a 3D scene unchanged? | Yes. Same camera elevation, so `iso.ts` maths still holds. |
| 300 monsters on a phone-class CPU? | 9 ms/frame at 4x CPU throttle with instancing and silhouettes (per-object: 97 ms). |
| Are the characters instancable? | Yes. All Mini rigs are rigid parts; the skinned ones split by bone losslessly. |
| Occlusion silhouettes for both teams? | Yes, pixel-exact, about 30 extra draw calls. |
| Phone GPU? | **Not measured.** Needs a real device. |

## Decisions

Decided 2026-11-15: 1 and 2 accepted as recommended (remove Phaser; delete the Sketch renderer at
parity). 3 is still open.

1. **Phaser: remove it entirely.** Earlier I suggested keeping Phaser as a transparent overlay for
   fx and audio. Having built the spike I now recommend against it: the fx surface is small
   (`FxViews.ts`, 203 lines), most of it is ground markings that are simpler and correctly
   occluded in 3D, and two WebGL contexts on a phone is a real memory and performance risk.
   Cost: audio loading/playback moves off Phaser (`GameAudio` already has an injection seam and
   tests). Alternative: keep the overlay — less work now, two renderers forever.
2. **Sketch renderer: delete at parity.** Keep it as the default while the 3D one grows behind
   `?look=3d`, flip the default at parity, then delete it with the bake pipeline, the sprite
   sheets (17 MB) and the tiles (7.5 MB). Alternative: keep both behind a toggle — every visual
   feature is then built twice.
3. **Look direction** (can wait until phase 3): flat-shaded as in the spike, or add an outline
   pass to recover some of the hand-drawn feel. Outline costs a post-process pass on phones.

## Approach

The risk in a renderer swap is the 768 lines of `GameScene.ts`, which mix rendering with game
flow (loop, params, profile, menu, planning, HUD wiring, debug, `window.__vd`). Porting that in
one step would mean a long period with no working game.

So: first split game flow from drawing behind a `Renderer` interface with the existing Phaser
code as its first implementation (no visual change). Then build the three.js implementation
behind `?look=3d` until it reaches parity. The game stays playable and testable throughout.

```
src/
  game/        GameController: loop, hit-stop, params, profile, menu/planning/HUD wiring, __vd
  render/      Renderer interface + PhaserRenderer (existing code, deleted at the end)
  render3d/    ThreeRenderer: stage, assets, town, units, fx, debug overlay
```

`Renderer` (sketch): `load(map)`, `sync(world, dt)`, `onEvent(e)`, `pick(clientX, clientY) → ground`,
`setPlanning(on)`, `selectBuilding(id)`, `setRole(id, role)`, `shake(ms, amount)`, `resize()`,
`stats()`, `destroy()`.

## Phases

Sizes are relative: S = a sitting, M = a milestone-3-sized chunk, L = a milestone-4-sized chunk.

### Phase 0 — device gate (S) — passed 2026-11-15

Result: 60 fps (the screen's refresh cap) on the user's phone with `?look=3d&stress=300`, shadows
and silhouettes on. Phone model not recorded.

Run the 3D renderer on a real mid-range phone (https://mikegoatly.github.io/VillageDefender/?look=3d&stress=300,
with and without `&shadows=0`; the perf overlay is bottom-left). If 300 units cannot hold 30 fps without shadows, stop and rethink before any port
work. Done when: numbers recorded here.

### Phase 1 — split game flow from drawing (M) — done 2026-11-15

Result: `src/game/` (`GameController`, `Renderer`, `session`), `src/render/PhaserRenderer.ts`,
`GameScene` reduced to a thin Phaser host; 14 controller tests with a fake renderer
(`tests/helpers/game.ts`). Scripted playtest output unchanged.

- Extract `GameController` from `GameScene`; define `Renderer`; wrap current drawing as
  `PhaserRenderer`.
- No behaviour or visual change. Screenshot and playtest tools give the same output.
- Tests: controller logic that was untestable inside a Phaser scene gets unit tests with a fake
  renderer (run recorded once, level-up auto-pause, planning flow, hit-stop).

### Phase 2 — three.js foundation (M) — done 2026-11-15

Result: `src/render3d/` (`Stage`, `assets`, `camera`, `characters`, `poses`, `UnitBatches`,
`TownView`, `ThreeRenderer`, `ThreeGame`). `?look=3d` now runs through `GameController`, so the
menu, planning (with house picking), HUD, level-ups and the debug panel work in 3D; audio is
silent until phase 5. Models live in `public/assets/models`. 23 unit tests in `tests/render3d`.
`node tools/measure3d.mjs` (RTX 5070, 1600×900): 300 monsters 1.0 ms/frame, 8.1 ms at 4× CPU
throttle; 600 monsters 13.2 ms throttled.

Planned scope:

- `Stage`: renderer, fixed fit-to-map camera, lights, shadows, resize, quality settings.
- `Assets`: models copied to `public/assets/models` by `import-assets` (no more `/assets-src` at
  runtime), loaded once and cached.
- `UnitBatches`: bone split, pose baking, instancing, silhouettes. Knight goes through the same
  path, with a batch per weapon.
- Pure functions get unit tests (no GL needed): animation state → clip/frame, bone split, camera
  fit, building → piece list.
- Remove the spike file and `tools/spike3d-measure.mjs` (keep the measuring as a proper tool).

### Phase 3 — town (L) — done 2026-11-15, with two items moved

Result: `src/render3d/buildings.ts` holds the piece rules (tested in
`tests/render3d/buildingLooks.test.ts`), `TownView` rebuilds a building when its role or damage
state changes, `Particles` does smoke and dust.

- Roles: barracks = battlements, red banners, pennant, weapon rack; chapel = tall red roof, cross,
  candles; smithy = smoking chimney, anvil; watchtower = extra storey, blue castle roofs, flag.
- Damage: below half HP some walls swap to broken pieces and dark smoke rises; ruins become low
  walls and debris with a dust burst.
- Ground: noise-shaded grass, kit road pieces, river and wooden bridges, sparse grass tufts.
- Role auras (planned for phase 4) came early: strong while planning, faint in play.
- Moved to phase 5: semantic blocks in `map.ts`. The sprite renderer still needs the Sketch tile
  names until it is deleted, and the 3D side only needs footprint, kind and storeys, so the change
  is simplest when Sketch goes.
- Not done: merging static scenery. Each building piece is still its own draw call (about 250
  calls in wave 1); performance is fine on the test phone, so this waits until it is needed.
- Measured: 300 monsters 1.0 ms/frame, 10.1 ms at 4× CPU throttle (was 8.1 ms in phase 2).

Planned scope:

- `map.ts` stops emitting Sketch tile names: blocks become semantic (`wall | door | window | roof`,
  material, level). RNG call order is kept so seeds and the golden fingerprint do not change.
- `src/data/townKit.ts`: which kit pieces make each building kind, each role building, and each
  damage state. This is where "special tiles for special buildings" (Notes.txt) lands:
  barracks, chapel, smithy and watchtower get their own pieces instead of a recoloured roof.
- Damage states from real pieces: intact → damaged (broken walls, smoke) → ruined (debris).
- Ground: grass with variation, road pieces, river and bridges (Town 2), decor.
- Static scenery merged or instanced so the town costs tens of draw calls, not hundreds.

### Phase 4 — gameplay visuals to parity (L) — done 2026-11-15

Result: `Effects` (arrows, spinning axes, telegraphs, shockwaves, charge line, flail ring, rally
pulse), `Labels` (HTML damage numbers, floating text, building HP bars, role icons, rank
chevrons), `unitFx` shader patch (per-instance hit flash and opacity), `DebugOverlay3D`, building
hit shake/flash, camera shake. `Renderer.screenOf` lets `tools/playtest.mjs` crop either renderer;
`playtest.mjs "look=3d&seed=42"` gives the same run as the sprite renderer.

- Differences from the sprite renderer: corpses sink into the ground instead of fading (instanced
  opaque meshes cannot fade without sorting), and hurt friendlies blink white instead of turning
  half transparent. Ghosts still flicker in opacity.
- Boulders have no projectile in the sim (warning, then impact), so 3D shows the telegraph, a
  shockwave and a dust burst, like the sprites.
- Fixed while checking: the arrow/axe models were not preloaded, which stopped the 3D session from
  starting; the host no longer throws every frame after a failed start.
- Measuring: 4× CPU throttle numbers on this machine swing widely between identical runs (300
  monsters: 10–23 ms; the sim's own time, the same work, varied 2.5×), so they can no longer show
  small changes. The phone is the reference.

Planned scope: gems, arrows/axes/boulders, HP bars, halos, rank chevrons, hit flash and death fade (per-instance
attributes), ghost flicker, role auras and planning highlight, building picking, boss telegraphs,
shockwaves, charge line, flail ring, floating text and damage numbers, camera shake. Debug
overlays (flow fields, hitboxes, ranges, labels).

Done when a side-by-side playthrough of both towns shows nothing missing, and
`tools/playtest.mjs` runs against `?look=3d`.

### Phase 5 — switch over and delete (M) — done 2026-11-15

Result: three.js is the only renderer. Audio plays through Web Audio (`audio/WebAudioBackend.ts`
behind an `AudioBackend` interface; `GameAudio` tests use a fake backend, plus new music tests).
Map blocks and decor are semantic (`part: wall | door | roof`, `kind: tree | well | rock`); the
RNG calls that used to pick Sketch tiles stay, so seeds make the same towns and the golden
fingerprints are unchanged. Removed: Phaser, the sprite renderer, the bake tool, 17 MB of sprite
sheets and 7.5 MB of Sketch tiles. Deployed size 30 MB → 5.1 MB; JavaScript 2.2 MB → 846 KB
(225 KB gzipped). `?look=3d` is no longer needed (and is ignored).

Planned scope:

- Audio off Phaser (Web Audio loader/player behind the existing `GameAudio` seam).
- 3D becomes the default. Remove Phaser, `PhaserRenderer`, `sheets.ts`, the bake pipeline,
  baked sprites and Sketch tiles. Update `AGENTS.md`, `GAME_PLAN.md` (decisions 6, 9, 10) and
  the tools.

### Phase 6 — what the port unlocks (separate work)

Knight customisation (model and skin tone), more animations (sprint, emotes, pick-up), weapon
visuals per rank, clip crossfading, optional outline pass, quality presets for phones.

## Risks

| Risk | Mitigation |
|---|---|
| Phone GPU too weak for 760k submitted triangles with shadows | Phase 0 gate; quality presets (shadows off, lower pixel ratio, silhouettes for allies only) |
| The 3D look is blander than Sketch | Ground and outline work in phases 3 and 6; decide with screenshots, not in the abstract |
| Long stretch with a half-working game | Phase 1 interface; Phaser stays the default until parity |
| Seeds or balance shift | Sim untouched except `map.ts` block naming, with RNG order preserved; 590 existing tests and the golden fingerprint guard it |
| Scope creep into new features | Phases 1–5 are parity only; new visuals wait for phase 6 |

## Not changing

Sim, balance data, DOM UI, input, profile/save format, URL debug params, the `window.__vd`
automation API (same names, same shapes).
