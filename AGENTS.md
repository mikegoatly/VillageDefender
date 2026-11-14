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
  `npm run bake`, `node tools/screenshot.mjs "<query>"` (needs dev server on 5173).
- Sprite sheet inspector: `/tools/bake/page/viewer.html?sheet=<name>&anim=<anim>`.
