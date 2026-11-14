# Village Defender (working title) — Game Plan

Status: draft v1, 2026-11-14. Nothing built yet.

## 1. Pitch

Survivors-style horde action where the thing you protect is not just yourself but a town.
You are a knight. Swarms arrive from the map edges. Some hunt you, some ignore you and go
for the buildings. You cannot be everywhere, so you recruit rookie knights, pick upgrades,
and decide which buildings to save. Buildings standing at the end = stars = unlocks.

**The core tension:** in Vampire Survivors you kite forever. Here kiting loses the town.
Every design decision below should reinforce "where do I need to be right now?"

## 2. Core loop

**In a level (target 8–12 minutes):**

1. Wave announces itself: edge indicator(s) show where it will arrive, 3–5 s warning.
2. Monsters spawn, split by behaviour (hunt knight / attack buildings / attack rookies).
3. Kill monsters → XP gems + occasional coins. XP bar fills → pause → pick 1 of 3 upgrades.
4. Kill-count thresholds → a rookie knight walks out of a surviving building.
5. Short breather between waves (repair pickup, reposition).
6. Final wave has a boss. Level ends when boss dies or all buildings fall / knight dies.

**Between levels (meta):**

- Stars earned → unlock next town, new attacks, new rookie classes.
- Coins → permanent upgrades (small, capped — skill should matter more than grind).
- Per-level challenges → cosmetics, modifiers, bonus attacks.

## 3. Systems

### 3.1 Buildings

- 6–9 buildings per town, clustered centre-screen with walkable lanes between.
- Each has HP, three visual states (intact / damaged / ruined) and a **role**:

| Building | Passive while standing | Lost when destroyed |
|---|---|---|
| Barracks | Rookies spawn here first, +1 rookie cap | Cap reduced |
| Smithy | +damage aura for knights nearby | Aura gone |
| Chapel | Slow heal for knights in radius | No healing |
| Tavern | Rookies respawn faster | Slow respawn |
| Watchtower | Longer wave warning + shows spawn edge early | Late warnings |
| Farm / Mill | More XP gems / coin drops | Fewer drops |
| Houses (x2–3) | Count toward stars only | — |

  Roles are chosen by the player before the level by upgrading houses (decision 29); the table's 'Farm / Mill', 'Tavern' rows are candidates for later.

  Roles make "which building do I let burn?" a real choice, and make towns play differently.
- Buildings can be repaired only by rare pickups / a specific upgrade, never for free.
- A building at 0 HP is ruined for the level (rubble still blocks movement).

### 3.2 Star rating

| Stars | Condition | Reward |
|---|---|---|
| 1 | Survive, at least 1 building standing | Next town unlocked, coins |
| 2 | At least ~2/3 buildings standing | + bonus coins, rookie class unlock |
| 3 | All buildings standing | + that town's **signature attack** unlocked |

Plus 3 optional challenge badges per town (e.g. "no rookies lost", "finish under 8:00",
"never drop below half HP"). Badges are the long-tail replay hook.

### 3.3 Monsters

Archetypes by **target preference** — this matters more than their stats:

| Archetype | Targets | Purpose |
|---|---|---|
| Grunt (zombie) | Nearest of anything | Fodder, numbers |
| Raider (orc) | Buildings | Forces you to defend, not kite |
| Stalker (skeleton) | The knight | Pressure on player |
| Phaser (ghost) | Buildings, passes through walls | Punishes turtling one lane |
| Brute (big orc) | Buildings, high HP, slow | Priority target |
| Leech (vampire) | Rookies, heals on hit | Threatens your army |
| Swarmer (bees/bats) | Knight, fast, weak | Rewards area attacks |
| Bomber | Runs at buildings and explodes | Kill it far from town |
| Shaman | Stays back, buffs/heals others | Go-out-and-get-it target |
| Boss (per town) | Scripted | Level climax |

Swarm scaling: wave N budget = base × growth^N, spent on a per-town spawn table.
Later waves arrive from 2–3 edges simultaneously.

### 3.4 Rookie knights

- Appear at kill thresholds (e.g. 25, 60, 110, 180…), walking out of a surviving building.
- Autonomous AI: guard nearest threatened building → engage → retreat to chapel when low.
- Classes (unlocked through stars): Swordsman, Archer, Shieldbearer (taunts raiders),
  Pikeman (lane holder), Cleric (heals), Squire-on-horse (fast responder).
- Rookies level up from kills during the level (rookie → veteran → captain), visibly.
- Light indirect control only: a **Rally** ability calls all rookies to your position for a
  few seconds. Keeps "you don't control them" true but gives one expressive lever.
- When a rookie falls they respawn after a delay from the Tavern/Barracks if standing.

### 3.5 Player knight & attacks

- Move (8-way / analogue), **basic attack** (sword arc in facing direction), **dodge roll**.
- Basic attack auto-fires at nearest enemy in range while the attack input is held
  (optional "always on" toggle for accessibility/touch). Abilities are manual.
- Movement is screen-relative (up = up the screen), not along iso axes.
- Loadout before each level: 1 basic attack + 2 ability slots + 1 passive relic.

Basic attack alternatives (unlock via 3-star rewards):

| Attack | Feel |
|---|---|
| Sword arc | Default, short wide cleave |
| Spear thrust | Long narrow pierce |
| Warhammer | Slow, small AoE, knockback |
| Throwing axes | Ranged, returns |
| Flail spin | Continuous ring around knight |
| Crossbow | Long range, single target, piercing upgrades |

Abilities (cooldown): Shield Bash (stun cone), Whirlwind, War Cry (rookie buff), Rally,
Holy Ground (heal zone), Caltrops (slow field), Fire Oil (burning lane), Charge.

### 3.6 In-run upgrades (level-up picks)

Pick 1 of 3, each stackable to 5. Three pools so builds differ:

- **Knight:** damage, attack speed, arc size, move speed, max HP, pickup radius, crit, lifesteal.
- **Army:** rookie damage / HP / cap, faster recruitment, rookies start as veterans.
- **Town:** building armour, thorns (attackers take damage), arrow slits (buildings shoot),
  repair pulse, braziers (slow enemies near buildings).

Evolutions: max a weapon + a paired passive → evolved form (e.g. Flail + Attack Speed →
Cyclone). Cheap to build once the upgrade system is data-driven, big replay payoff.

### 3.7 Towns (levels)

| # | Town | Tiles | Twist | Monsters |
|---|---|---|---|---|
| 1 | Medieval village | Sketch Town | None — teaches the loop | Zombies, orcs |
| 2 | Riverside market | Sketch Town + Expansion | River + bridges = chokepoints | + skeletons, bombers |
| 3 | Hill farmstead | Sketch Town Expansion (cliffs, furrows, fences) | Fences are destructible barriers | + swarms |
| 4 | Desert oasis | Sketch Desert | Sandstorm cuts visibility periodically | + shamans |
| 5 | Graveyard parish | Sketch Town + Graveyard Kit props | Monsters also rise from graves inside town | Ghosts, vampires |
| 6 | Castle keep | Sketch Town castle pieces | Walls + gates; gates can be breached | Everything + siege brute |

Start with town 1 only. The rest are content once the engine is data-driven.

### 3.8 Replayability

- Star + badge chase per town.
- **Curses** (opt-in difficulty modifiers à la Hades heat): faster swarms, fragile buildings,
  no rookies, elite waves. Each curse multiplies coin reward.
- **Endless mode** per town after first clear; leaderboard-ready score.
- **Daily seed**: fixed layout + wave seed + forced loadout.
- Randomised per run: building placement from town templates, spawn edges, upgrade offers,
  elite affixes on monsters (shielded, splitting, fast).
- Unlockable knights (different starting stats/passive) as long-term goals.

## 4. Art & assets (scan results)

Asset root: `Kenney Game Assets` (all CC0).

### 4.1 Environment — Sketch packs

- `2D assets/Sketch Town` (87 tile types), `Sketch Town Expansion` (59), `Sketch Desert` (61).
- Each tile: 256×352 PNG, 4 rotations (`_N/_E/_S/_W`), isometric **stacking cubes**.
  Buildings are assembled from wall blocks + roof blocks; includes Tiled `.tsx`/`.tmx`.
- Has: grass/dirt/path/river/water, building walls (2 colours), roofs (4 colours, 6 shapes),
  castle walls/towers/gates, trees, rocks, bridge, fences, crops, well, cliffs.
- **Has no characters, monsters, effects, or damaged-building variants.**

### 4.2 Characters & monsters — recommendation

Best fit found: the Kenney **"Mini" 3D character rig**. All of these share one skeleton and
one animation set (`idle, walk, sprint, die, attack-melee-right/left, attack-kick,
holding-*-shoot, pick-up, emote-*` …), verified by reading the GLB files:

| Pack (3D assets/) | Models | Use |
|---|---|---|
| Mini Dungeon | `character-human` (knight w/ sword + shield), `character-orc`, sword, spear, shields, chest, coin, potion, barrel | Player, raider/brute, pickups |
| Graveyard Kit | `character-skeleton`, `-zombie`, `-ghost`, `-vampire`, `-keeper` + graves, fences, crypts, pumpkins | 4 monster types, town 5 props |
| Mini Characters | 12 villagers (male/female a–f) | Rookies (re-skinned), fleeing villagers |
| Mini Forest | `character-archer` | Archer rookie |
| Mini Arena | `character-soldier` | Rookie / veteran |
| Early access/Medieval Weapons | 17 weapons | Attack variety, pickups |
| Cube Pets | 24 animals (bee, hog, fox, …) | Swarmers, critters (check rig separately) |
| Tower Defense Kit | 4 UFO enemies | Only if a sci-fi town happens |

**Pipeline:** these are 3D, the game is 2D. Bake them: a build script loads each GLB in
three.js (headless Chromium), sets an isometric orthographic camera matching the Sketch tile
angle, and renders every animation × 8 facings into a sprite atlas + Phaser JSON. An outline
pass helps them sit next to the hand-drawn Sketch tiles. No Blender needed (not installed);
Node 26 is. The bake runs once and its output is committed, so the game itself stays plain 2D.

Consistency win: one rig means one bake script and one animation state machine for the
player, every rookie and most monsters.

Alternatives considered and rejected:

| Pack | Why not |
|---|---|
| Isometric Miniature Dungeon (2D, zipped) | Pre-rendered iso but only 1 character, only Idle/Run/Pickup — no attack, no monsters |
| Toon Characters (incl. Zombie) | Side-on, not iso |
| Monster Builder Pack | Side-on/front-facing parts; could work for boss portraits/UI only |
| Tiny Dungeon / Tiny Battle / Roguelike Characters | 16px pixel art, clashes with Sketch |
| RTS Medieval | Straight top-down, wrong angle |
| Animated Characters Bundle | FBX + separate animation files, more pipeline work, no monsters |

**Style risk to check early:** Sketch tiles are warm, outlined, hand-drawn; Mini models are
flat-shaded, cooler palette. Milestone 0 includes a side-by-side mock so we decide before
investing. Fallback: use Kenney's 3D town kits (Fantasy Town Kit, Castle Kit) baked through
the same pipeline, giving a fully consistent look at the cost of dropping Sketch.

### 4.3 Supporting assets

- **Touch controls:** `UI assets/Mobile Controls` (joystick, buttons; 948 PNG + SVG).
- **Button glyphs:** `Icons/Input Prompts` (keyboard, Xbox, PlayStation, Switch, Steam Deck, touch).
- **UI:** `UI assets/UI Pack - Adventure`, `Fantasy UI Borders`; `Icons/Game Icons`, `Board Game Icons`.
- **VFX:** `2D assets/Particle Pack`, `Smoke Particles`, `Explosion Pack`, `Splat Pack`.
- **Audio:** `Audio/RPG Audio`, `Impact Sounds`, `Interface Sounds`, `Music Jingles`, `Music Loops`.
- **Fonts:** `Other/Fonts`. **Stars:** `2D assets/Medals`.
- **Gap:** damaged/ruined building art. Plan: tint + crack/smoke/fire overlays, then swap
  roof tiles for `castle_endRuined` / `walls_broken`-style rubble.

## 5. Technical plan

### 5.1 Stack

- Phaser (latest stable) + TypeScript + Vite. Static build, runs from any web host; can be
  wrapped later (Capacitor for stores, Electron/Tauri for Steam) without code changes.
- Vitest for simulation unit tests; Playwright for automated play-tests.

### 5.2 Architecture — simulation separate from rendering

```
src/
  sim/        Pure TS, no Phaser. World, entities, waves, AI, combat, upgrades, RNG.
  data/       Towns, monsters, attacks, upgrades, wave tables as typed data.
  render/     Phaser scenes; reads sim state, draws sprites, plays fx/audio.
  input/      Keyboard, gamepad, touch → one InputState.
  ui/         HUD, level-up picker, menus, touch overlay.
  meta/       Save data, unlocks, stars (localStorage behind an interface).
tools/
  bake-sprites/   GLB → 8-direction atlases.
tests/
```

Why: the sim can be stepped headlessly at fixed timestep with a seeded RNG. That makes it
unit-testable, deterministic, and lets a bot play 10 minutes of game in a few seconds —
which is how balance and regressions get checked without a human.

- **Coordinates:** sim runs on a flat 2D ground plane; render projects to isometric and
  depth-sorts by ground Y. Collision is circles vs circles/rectangles with a spatial hash,
  not Phaser physics (hundreds of monsters, needs to be deterministic).
- **Pathing:** flow fields toward buildings/knight, recomputed when a building falls.
  One field serves the whole swarm.
- **Performance budget:** 300+ monsters at 60 fps on a mid-range phone → object pools,
  atlased sprites, no per-frame allocation in the sim.

### 5.3 Input & screens

One `InputState { move: vec2, attack, dodge, ability1, ability2, rally, pause }` **per
player** (co-op ready; only player 1 wired up at first), fed by:

- Keyboard: WASD/arrows, Space, Shift, Q/E, R, Esc. Rebindable later.
- Gamepad: left stick, A/X/B/Y + shoulders; glyphs switch to match the device last used.
- Touch: floating virtual stick left, action buttons right, sized in physical units,
  respecting safe-area insets. Shown only when touch is the active device.

Layout: Phaser `Scale.RESIZE`. Camera zoom is computed so the whole town + a margin always
fits, on any aspect ratio (portrait phones get a taller view of the same play area). HUD is
anchored to edges, not laid out in fixed pixels. Menus must be fully navigable by pad.

### 5.4 Play-testing by Claude

Built in from the first milestone:

- URL params: `?town=1&seed=42&autoplay=1&speed=8&wave=6&god=1&loadout=...`.
- `window.__vd` debug hook: read sim state (HP, buildings, wave, kills), inject input,
  step frames, jump to wave, grant upgrades.
- Bot players (`kiter`, `defender`, `idle`) running against the headless sim in Vitest:
  assertions like "idle bot loses town 1 by wave 4", "defender bot gets ≥2 stars".
- Playwright scripts: boot, play N seconds, screenshot at desktop / tablet / phone-portrait
  / phone-landscape viewports, fail on console errors.
- Dev overlay: fps, entity counts, flow-field and hitbox toggles.
- In-game debug panel (decision 34) for humans; the same World debug API (`world.debug*`) is available to scripts via `window.__vd.world()`.

## 6. Milestones

| # | Goal | Done when |
|---|---|---|
| 0 | **Look test** | Bake script outputs knight + orc atlases; static scene with Sketch town + characters; decide Sketch vs 3D-baked town |
| 1 | **Toy** | Knight moves and attacks on an iso map, one monster type swarms from edges, all three input methods work, resizes correctly |
| 2 | **Core loop** | Buildings with HP, raiders target them, waves escalate, win/lose, star rating screen (town 1) |
| 3a | **Army & growth** | XP gems, pause-and-pick level-ups, 20 upgrades in knight/army/town pools, swordsman + archer rookies, Rally |
| 3b | **Town planning** | Before a town, spend planning points to turn chosen houses into role buildings (barracks, chapel, smithy, watchtower); coins from wave rewards + kills, saved to a profile |
| 4 | **Vertical slice** | Town 1 complete: 6 monster types, boss, 3 attacks, audio, juice (hit-stop, shake, numbers), bots prove it is beatable and losable |
| 5 | **Meta** | Save data, unlocks, loadout screen, town 2 (proves data-driven towns) |
| 6 | **Content** | Remaining towns, curses, endless, daily seed, badges |
| 7 | **Polish/ship** | Performance on real phones, onboarding, settings, name, packaging |

Milestone 1 is the first thing worth playing; milestone 4 is the first thing worth showing.

### Milestone 0 results (2026-11-14)

Built: `npm run import-assets` (Kenney → repo), `npm run bake` (GLB → 8-direction sheets via
three.js in headless Chromium), `tools/bake/page/viewer.html` (sheet inspector),
`node tools/screenshot.mjs` (4 viewports), look-test scene (`?look=sketch|kit`, L toggles).

Findings:

- **Sketch + baked Mini characters work together.** Outline pass makes characters sit
  naturally on the tiles. Fantasy Town Kit look is coherent too, but its ground needs
  separate work and its tall trees hide units. Recommendation: **Sketch**.
- **Character display scale:** baked at 120 px/unit, shown at 1.4× (`?cs=`) reads well.
- **Phone portrait is a problem for the fixed camera.** The iso town is ~2:1 wide, so in
  portrait it uses ~25% of the screen and units are ~15 px tall. Landscape phone is fine. Resolved: landscape only (decision 7).
- **Readability gaps:** the rookie (Mini Characters villager) looks too like the zombie;
  the knight doesn't stand out. Need a player marker (ring/outline colour) and distinct
  rookie colours/helmets.
- **Occlusion:** units behind buildings are hidden. Needs a see-through silhouette or
  building fade when units are behind.
- **Texture budget:** each character sheet is 4000×1408 (~22 MB GPU). Too much for phones
  at 10+ unit types. Fix in milestone 1: trim cells (160×176 is mostly empty), bake at a
  lower PPU, and drop unused frames.
- Weapon attachment works (`arm-right` bone, offset along the T-pose arm). Facing math
  verified visually in all 8 directions.
- **Map size variants** (`?shape=rect&n=<diamonds across>&ts=<tile scale>`). Knight height /
  tile width in px:

  | Variant | Cells | Desktop 1600×900 | Phone landscape 844×390 |
  |---|---|---|---|
  | diamond 11×11, ts 1 | 121 | 67 / 138 | 29 / 60 |
  | rect n=14, ts 0.8 | 419 | 57 / 95 | 25 / 41 |
  | rect n=18, ts 0.65 | 683 | 58 / 79 | 25 / 34 |
  | rect n=22, ts 0.55 | 1011 | 59 / 67 | 26 / 29 |

### Milestone 1 results (2026-11-14)

- **Playable toy:** knight moves (screen-relative), hold-to-attack auto-aims at the nearest enemy, dodge roll with i-frames, HP and restart. Zombies arrive in escalating waves from 1–2 map edges with a 3 s on-screen warning. Map: generated rectangular town, 18 diamonds across at 0.65× tiles (~680 cells), buildings and trees block movement.
- **Input:** keyboard (WASD/arrows, Space attack, Shift/K dodge), gamepad (left stick/D-pad, A or RT attack, B dodge), touch (floating left joystick, hold ⚔ to attack, » dodge); the active device switches automatically. Rotate-to-landscape overlay pauses the game on portrait touch devices.
- **Readability:** gold halo under the knight; gold see-through silhouette when he is behind a building.
- **Architecture:** sim is pure TS in `src/sim` (fixed 60 Hz, seeded, deterministic); flow-field pathing; render in `src/render/GameScene.ts`; DOM HUD in `src/ui`.
- **Texture budget:** per-frame-trimmed atlases at 96 px/unit cut character sheets from ~21.5 MB to ~5 MB GPU each.
- **Bugs caught by tests:** knight's swing hit himself (shared spatial hash); flow field lost regions due to Float32 rounding; isolated rim cells on the rectangular map (now removed at generation).
- **Bot balance baseline (seeds 1–5):** idle bot dies at 22–31 s in wave 2; simple fighter bot survives 154–183 s, reaching wave 11–13 with 191–248 kills. Every run eventually loses — fine for a toy, needs tuning once upgrades exist.
- **Known gaps / next:** zombie crowds overlap heavily in big waves; no hit-stop/damage numbers/audio yet; touch controls use placeholder CSS art (swap to Kenney Mobile Controls); occlusion check is approximate.

### Milestone 2 results (2026-11-14)

- **Building HP:** 300 for a cottage + 120 per extra wall block (a 2×2 two-storey hall has 1140). Damage shows as darkening, hit shake/flash, an HP bar, smoke below 50%, and a dust burst into rubble when destroyed. Rubble still blocks movement.
- **Monsters:** zombie (chases the knight within 4.5 cells, otherwise the nearest building); orc raider (ignores the knight, goes for buildings, peach tint); brute (1.6× size, red tint, 150 HP, slow, resists knockback, 20 damage per hit to buildings). Building-targeting uses one multi-source flow field to cells next to standing buildings, rebuilt when a building falls.
- **Town:** 8 waves from a data table (`src/data/waves.ts`), 18 s apart, 1→3 sides. Win when all waves are spawned and cleared; lose if the knight dies or every building falls. Stars: 3 all standing, 2 ≥ two-thirds, 1 ≥ one. End panel with stars, stats, Retry (same town) and New town.
- **Balance baseline (bots, seeds 1–5):** idle never wins; a fighter bot that ignores buildings wins 3/5 at 1 star average 0.6; a defender bot that prioritises monsters attacking buildings wins 5/5 averaging 1.0 star and 2 of ~10 buildings left. 2–3 stars should need skilled play or milestone 3 tools (rookies, upgrades).
- **Bugs caught by tests:** building-targeting monsters idled forever at the centre of the cell next to a building (just outside their reach), so levels couldn't be won; bots walked into buildings (now path with a flow field).
- **Known gaps:** rubble art is a placeholder (rock tiles); building HP bars are small on phones; balance numbers are bot-derived and need human play.

### Milestone 3a results (2026-11-14)

- **XP:** monsters drop gems (zombie 1, orc 2, brute 6). Gems within the knight's magnet radius fly to him; when the field is clear between waves, all remaining gems fly in. XP curve 5 × 1.3^(level−1).
- **Level-up pauses the game:** pick 1 of 3 cards (keys 1/2/3, arrows + Enter, D-pad + A, or tap; 300 ms input guard so a held attack can't pick by accident). Several level-ups queue.
- **20 upgrades in three pools** (src/data/upgrades.ts): knight (damage, swing speed, arc, reach, speed, max HP, regen, gem magnet, knockback, dodge), army (recruit sooner, +cap, rookie HP, rookie damage, veteran/captain starts), town (walls +HP & repair, thorns, arrow slits, repair crews, tar pits). Effects are modifiers recomputed from upgrade levels.
- **Rookies:** swordsman then archer alternate; earned at kill thresholds 12/30/55/85/…; cap 3 (+upgrades); fallen rookies are replaced after 15 s. They defend buildings first (targets attacking a building), then hunt within 6 cells, then return to their post. Archers keep distance and shoot arrows. Ranks: veteran at 8 kills, captain at 25 (×1.3 / ×1.7 stats, brighter halo).
- **Rally** (R / LB / ⚑ button): rookies regroup on the knight for 4 s, 15 s cooldown.
- **Readability:** knight gold halo, rookies blue halo (brighter with rank); floating text for level-ups, recruits, promotions and Rally.
- **Bot balance (seeds 1–5, bots pick upgrades by pool preference):** idle never wins; fighter wins 5/5 at 1.0 star average; defender wins 5/5 at 2.4 stars average (9.2 of ~10 buildings standing). Town 1 is now comfortable for skilled play; later towns must ramp difficulty.
- **Bugs caught:** test bots hung because the world pauses for level-ups (helpers now resolve choices); Toughness double-healed; rookies lost track of building attackers between swings.
- **Known gaps:** archer bow animation is subtle; no sound; touch Rally button has no cooldown display; rookie AI doesn't retreat to heal.

### Retune and debug mode (2026-11-14)

- User play-test: 3 stars on the first attempt with rookies — too easy.
- Retune: XP curve 8 × 1.4^(level−1) (~6 level-ups per run, was ~9); rookie cap 2 (was 3), thresholds 20/50/90/135/…; rookie damage −25%; bigger waves 6–8 (3 sides on the final waves). Bot averages after: fighter 0.8★ (4/5 wins), defender 1.2★ (4/5 wins), was 1.0★ / 2.4★.
- Debug panel (lil-gui, src/ui/DebugPanel.ts): run stats, speed/pause/step, god mode, retry/new town/load seed; spawn any monster at an edge/the knight/the last clicked point; kill all; jump to wave; win/lose now; heal, +XP, level up, grant any upgrade; add swordsman/archer; set building HP / destroy / repair all; overlays (flow fields, hitboxes, ranges, labels — src/render/DebugOverlay.ts); live balance editing of every balance table with Copy-as-JSON and Reset. Debug state (speed, pause, overlays) survives restarts.

### Milestone 3b results (2026-11-14)

- **Planning phase on the real map:** the sim waits in `planning` until `start()`. Tap a house, or keyboard ←→ to pick a house, 1–4 to assign a role, 0 to clear, Enter to start; gamepad LB/RB to pick, D-pad to choose a role, A to assign, Start to begin. Role roofs, icon badges and aura rings show while planning. Town 1 gives 2 planning points.
- **Roles:** barracks (+1 rookie cap, rookies step out of it), chapel (heals the knight and rookies 3 HP/s within 3 cells), smithy (+25% knight and rookie damage within 3 cells), watchtower (an arrow every 2 s within 4 cells, and wave warnings come 2 s earlier). A role stops working when its building is ruined.
- **Coins:** 1 per zombie/orc, 5 per brute, 3 × wave number for each cleared wave (paid when the next wave starts), and a win bonus of 3 × waves + 20 per star. Saved to a localStorage profile with lifetime stats, best stars per town and achievements (Defender, Not a scratch, Brute slayer, Seasoned). The end panel shows coins earned, wallet, new achievements and unlocked roles.
- **Debug:** panel Profile folder; `?plan=0` skips planning; `window.__vd.startTown()`.
- **Bot balance (seeds 1–5, 8 waves; coins per run):** idle 0/5 wins, 0.00 stars, 19 coins; fighter 4/5 wins, 0.80 stars, 265 coins; defender-unplanned 4/5 wins, 1.20 stars, 272 coins; defender with barracks + chapel on the two buildings nearest the centre 4/5 wins, 1.00 stars, 271 coins (1.8 rookies alive either way). The simple plan gives no measurable edge over seeds 1–5; coins are dominated by the fixed win bonus and kills.
- **Tests:** planning accounting, each role's effect and ruin behaviour, coin sources and `runResult`, profile and achievements on an in-memory store; builders `withPlan`/`inPlanning` and bot `defenderPlan`.
- **Known gaps:** coins buy nothing yet (milestone 5); card unlocks (decision 33) not yet implemented; only one town.

## 7. Decisions

### Decided (2026-11-14)

1. **Camera:** fixed, whole town always visible. No follow camera. Revisit only if phones
   feel cramped.
2. **Attack model:** hold to auto-attack nearest enemy in range; abilities on buttons.
3. **Local co-op:** architecture supports N knights from day one (per-player `InputState`,
   camera framing, spawn logic). Ship single-player first; co-op is a later milestone.
4. **Movement:** screen-relative. "Up" moves up the screen, not along the iso grid.
5. **Rally:** kept. Only indirect control over rookies.
6. **Art direction:** Sketch Town tiles + baked Mini-rig characters (confirmed after the
   milestone 0 look test). Fantasy Town Kit dropped.
7. **Orientation:** landscape only on phones and tablets. We show our own "rotate your
   device" overlay in portrait (the web can't reliably lock orientation; iOS ignores it).
8. **Unit readability:** player and friendly units get halos/glows; enemy archetypes get
   distinct tints (later also body size, e.g. brutes bigger).
9. **Occlusion:** units behind buildings are drawn as a see-through silhouette.
10. **Texture budget:** trim baked cells, lower bake resolution and drop unused frames
    (milestone 1).
11. **Map shape and size:** maps are cut to a screen-aligned rectangle (~1.9:1), not an iso
    diamond, so landscape screens are filled edge to edge. Tiles are displayed smaller than
    native (~0.55–0.8×) to fit more cells. With a fixed camera, unit size on screen depends
    only on how many character-widths the map spans, so a phone in landscape keeps the
    knight at ~25 px whatever the tile count; buildings become multi-block (2×2 footprints,
    2 storeys) so they still read as buildings. Final size picked in milestone 1 from the
    variants below.
17. **Auto-aim:** the basic attack targets the nearest enemy in range, even while running the other way.
18. **Touch attack:** hold the ⚔ button to attack (same as keyboard/pad). The always-on attack toggle stays available as an accessibility option.
19. **Milestone 1 scope:** buildings are obstacles only; building HP and damage arrive in milestone 2.
20. **Map size:** 18 diamonds across at 0.65× tiles (decision 11 variant).
21. **Town 1 length:** 8 waves (~3 minutes), bosses arrive in milestone 4.
22. **Milestone 2 monsters:** zombie, orc raider, brute.
23. **Building roles:** deferred to milestone 3.
24. **Knight death:** game over for now (open item 13 is still to be revisited in milestone 4).
25. **Milestone 3 split:** 3a army & growth, 3b town planning.
26. **Level-up:** pause and pick 1 of 3.
27. **XP:** gems you pick up (magnet radius; auto-collect when the field is clear).
28. **Rookies:** swordsman + archer for now; Rally kept as a button.
29. **Town planning (3b):** every building starts as a house. Before a level starts you spend coins to upgrade chosen houses into role buildings (barracks, chapel, smithy, watchtower). No building during the level — you survive all waves with the plan you made.
30. **Coins:** from wave rewards plus kills.
31. **Coins persist** in a wallet across attempts and levels and buy permanent meta upgrades and unlocks. Town planning (3b) uses separate planning points fixed per town so retries stay fair (decision 36).
32. **Levels reset each run** (roguelite): knight level and in-run upgrades start fresh every attempt; long-term power comes from the meta layer (decision 31, open item 12 small and capped).
33. **Unlockable upgrade pool:** a new player starts with a small set of level-up upgrades; more are unlocked through progress and achievements (e.g. win a level, earn 3 stars, reach knight level 6, kill 10 brutes, win without losing a building), so the card pool grows over time. Needs save data — lands with 3b / milestone 5 meta.
34. **Debug mode:** in dev builds always, in production with `?debug=1`. Toggle with ` (backtick), F2 or the 🐞 button.
35. **Unlockable roles:** new profiles start with Barracks and Chapel; Smithy unlocks by saving a town (achievement "Defender"), Watchtower by saving a town with 3 stars ("Not a scratch").
36. **Planning points per town:** fixed by the town (Town 1: 2), the same on every attempt; not tied to knight level or coins.
37. **Terminology:** town = stage/map; knight level = in-run XP level.

### Open (decide later)

12. **Meta progression strength:** small and capped (recommended) vs Survivors-style grind.
    Before milestone 5.
13. **Knight death:** game over vs respawn once per level at a cost (recommended: the
    building you respawn in takes heavy damage). Before milestone 4.
14. **Level length:** 8–12 min as written vs 6–8 min (recommended, phone-friendly).
    Before milestone 4 balancing.
15. **Distribution target:** web only first, or stores/Steam from the start.
    Affects packaging and save storage only.
16. **Name.**
