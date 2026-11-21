# Agent guidance — Village Defender

## Delegation

- The main agent coordinates and reviews; it does not do simple work itself.
- Delegate simple, well-scoped work to **Sonnet 5.5 subagents** (`model: "sonnet"`):
  mechanical edits, renames, boilerplate, running scripts and reporting results, asset
  imports, screenshot capture, straightforward tests.
- Give each subagent a self-contained brief: files, exact change, how to verify, what to report.
- The main agent keeps design decisions, architecture, tricky debugging and anything
  needing judgement across many files.
- Always review a subagent's result (diff, test output, screenshots) before reporting it
  as done.

## Project pointers

- Plan and decisions: `docs/GAME_PLAN.md`.
- Commands: `npm run dev`, `npm test`, `npm run build`, `npm run import-assets` (needs `KENNEY_ROOT` set to the local Kenney assets folder),
  `node tools/screenshot.mjs "<query>"` (needs dev server on 5173),
  `node tools/measure3d.mjs [options] ["<extra query>"]` (frame cost at full and 4× throttled CPU, e.g. `"town=lanternwick"`; noisy on a busy machine;
  `--swiftshader` = software GPU so shader/fill cost shows (stand-in for a weak GPU), `--towns` = village/frostpeak/lanternwick,
  `--case "<name>=<query>"`, `--cpu 1,4`, `--scale 2` (high-DPI; add `"dpr=2"` to stop the auto step-down), `--size`, `--wait`;
  "gpu" column = GPU ms from timer queries where the browser exposes them),
  `node tools/playtest.mjs "<query>" <seconds> <shots>` (scripted play via `window.__vd`,
  saves `screenshots/playtest-N.png` and `-close.png`, needs dev server),
  `node tools/animframes.mjs [weapon] [times]` (knight attack frame by frame at exact times via a
  fake animation clock, three facings; saves `screenshots/anim-<weapon>-<view>.png`, needs dev server).
  Code-built animation clips (no clip in the Kenney rig, e.g. the spear `thrust`) live in `render3d/clips.ts`.
- URL debug params: `?seed= &speed= &god=1 &wave= &plan=0` (`plan=0` skips the planning phase).
  Rendering: `&stress=<monsters>` (spawn at once, implies god/plan=0, shows perf), `&perf=1`, `&lightning=0` (night towns),
  `&shadows=0`, `&sil=0` (no occlusion silhouettes), `&dpr=<max pixel ratio>` (fixed; without it the cap steps down from 2
  while frames stay slow, render3d/quality.ts). Cost isolation: `&nightdark=0` (no night light/darkness patch), `&pools=0`
  (no ground glow pools), `&trees=0`. Night towns have no real lights: windows/lamps light the scene from a baked
  warm-light map, lantern/wisps/fires are computed in the night shader (render3d/nightDark.ts).
- Live build: https://mikegoatly.github.io/VillageDefender/ (every push to `main` deploys).
- Debug mode: dev builds or `?debug=1`; toggle with backtick/F2/🐞. World debug API: `debugSpawn`, `debugGiveXp`, `debugGiveUpgrade`, `debugAddRookie`, `debugJumpToWave`, `debugKillAll`, `debugSetBuildingHp`, `debugSetLamp`, `debugEnd`, `debugInfo` (night towns: `light` = lit coverage, lamps, oil); overlays via `window.__vd.overlays` (`light` = lit cells); `window.__vd.startTown()` / `window.__vd.profile()`. Balance retunes: edit live in the panel, Copy balance JSON, then bake the numbers into src/data/*.
- Tests: `npm test` (fast unit project); `npm run test:golden` for the slow golden sim fingerprints (run after sim changes); `npm run test:all` for both; bot balance table: `npx vitest run tests/sim/bots.test.ts --disableConsoleIntercept`.
  Test helpers (builders, ASCII maps, bots) live in tests/helpers — reuse them.
- Rendering is three.js with the Kenney GLB models in `public/assets/models` (src/render3d;
  piece rules in `render3d/buildings.ts`). Game flow talks to it only through `game/Renderer.ts`.
