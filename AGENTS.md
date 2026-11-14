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
- Commands: `npm run dev`, `npm test`, `npm run build`, `npm run import-assets`,
  `npm run bake`, `node tools/screenshot.mjs "<query>"` (needs dev server on 5173),
  `node tools/playtest.mjs "<query>" <seconds> <shots>` (scripted play via `window.__vd`,
  saves `screenshots/playtest-N.png` and `-close.png`, needs dev server).
- URL debug params: `?seed= &speed= &god=1 &wave=`.
- Debug mode: dev builds or `?debug=1`; toggle with backtick/F2/🐞. World debug API: `debugSpawn`, `debugGiveXp`, `debugGiveUpgrade`, `debugAddRookie`, `debugJumpToWave`, `debugKillAll`, `debugSetBuildingHp`, `debugEnd`, `debugInfo`; overlays via `window.__vd.overlays`. Balance retunes: edit live in the panel, Copy balance JSON, then bake the numbers into src/data/*.
- Tests: `npx vitest run`; bot balance table: `npx vitest run tests/sim/bots.test.ts --disableConsoleIntercept`.
  Test helpers (builders, ASCII maps, bots) live in tests/helpers — reuse them.
- Sprite sheet inspector: `/tools/bake/page/viewer.html?sheet=<name>&anim=<anim>`.
