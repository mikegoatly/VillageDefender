import { describe, expect, it } from 'vitest';
import { MONSTERS, type MonsterKind } from '../../src/data/monsters';
import { fitView, frustumFor, projectGround } from '../../src/render3d/camera';
import { animFor, CHARACTER_MODELS, characterModelPaths, clipNames, CORPSE_SINK, isThrust, lookFor, SHADE_SHIMMER, shadeAlpha, unitFx, VILLAGER_LOOK, WADE, wadeDepth } from '../../src/render3d/characters';
import { mapFromAscii } from '../helpers/mapBuilder';
import { generateTown } from '../../src/sim/map';
import { aWorld } from '../helpers/worldBuilder';
import { knightGear, RANK_COLORS, weaponFx } from '../../src/render3d/upgradeFx';

describe('fitView', () => {
  it('keeps every edge cell of the town inside the view', () => {
    for (const seed of [1, 7, 42]) {
      const map = generateTown(seed);
      const v = fitView(map);
      const c = projectGround(v.x, v.z);
      for (const side of Object.values(map.edges)) {
        for (const [i, j] of side) {
          const p = projectGround(i, j);
          expect(Math.abs(p.sx - c.sx)).toBeLessThanOrEqual(v.halfW);
          expect(Math.abs(p.sy - c.sy)).toBeLessThanOrEqual(v.halfH);
        }
      }
    }
  });
});

describe('frustumFor', () => {
  const view = { x: 0, z: 0, halfW: 20, halfH: 10, reach: 30 };

  it('fits a wide screen by height and a narrow one by width', () => {
    expect(frustumFor(view, 4)).toEqual({ halfW: 40, halfH: 10 });
    expect(frustumFor(view, 1)).toEqual({ halfW: 20, halfH: 20 });
  });
});

describe('animFor', () => {
  it('maps sim state to an animation', () => {
    expect(animFor({ state: 'dead', moving: true })).toBe('die');
    expect(animFor({ state: 'attack', moving: true })).toBe('attack');
    expect(animFor({ state: 'dodge', moving: false })).toBe('sprint');
    expect(animFor({ state: 'idle', moving: true })).toBe('walk');
    expect(animFor({ state: 'idle', moving: false })).toBe('idle');
  });
});

describe('lookFor', () => {
  it('gives the knight a batch per weapon', () => {
    const { knight } = aWorld().build();
    expect(lookFor(knight, 'sword').key).not.toBe(lookFor(knight, 'hammer').key);
    expect(lookFor(knight, 'hammer').attachments[0].model).toContain('hammer');
  });

  it('lights the knight\'s weapon (not his shield) by rank and blade, one batch per look', () => {
    const { knight } = aWorld().build();
    const rankedWorld = aWorld().withWeaponRanks({ sword: 3 }).withUpgrades({ blade: 5 }).build().world;
    const plain = lookFor(knight, 'sword', knightGear(aWorld().build().world));
    const ranked = lookFor(knight, 'sword', knightGear(rankedWorld));
    expect(plain.attachments[0].glow).toBeUndefined();
    expect(ranked.attachments[0].glow).toEqual({ color: RANK_COLORS[3], amount: weaponFx(3, 1).glow });
    expect(ranked.attachments[1].glow).toBeUndefined();
    expect(ranked.key).not.toBe(plain.key);
    expect(lookFor(knight, 'sword', knightGear(rankedWorld))).toBe(ranked);
  });

  it('draws brutes as bigger, tinted orcs that share the orc batch', () => {
    const { monsters } = aWorld().withMonster('orc', 3, 3).withMonster('brute', 4, 4).build();
    const orc = lookFor(monsters[0], 'sword');
    const brute = lookFor(monsters[1], 'sword');
    expect(brute.key).toBe(orc.key);
    expect(brute.scale).toBeGreaterThan(orc.scale);
    expect(brute.tint).not.toBe(orc.tint);
  });

  it('keeps translucent ghosts in their own batch', () => {
    const { monsters } = aWorld().withMonster('ghost', 3, 3).withMonster('zombie', 4, 4).build();
    expect(lookFor(monsters[0], 'sword').alpha).toBeLessThan(1);
    expect(lookFor(monsters[0], 'sword').key).not.toBe(lookFor(monsters[1], 'sword').key);
  });

  it('grows rookies with rank', () => {
    const { rookies } = aWorld().withRookie('swordsman', 3, 3).build();
    const base = lookFor(rookies[0], 'sword').scale;
    rookies[0].rank = 2;
    expect(lookFor(rookies[0], 'sword').scale).toBeGreaterThan(base);
  });

  it.each(['swordsman', 'archer'] as const)('starts a %s as a recruit, kits them out as a veteran and gilds a captain', (kind) => {
    const { rookies } = aWorld().withRookie(kind, 3, 3).build();
    const r = rookies[0];
    const [recruit, veteran, captain] = [0, 1, 2].map((rank) => {
      r.rank = rank;
      return lookFor(r, 'sword');
    });
    expect(CHARACTER_MODELS[recruit.sheet]).toBe('mini-characters/character-male-f');
    expect(CHARACTER_MODELS[veteran.sheet]).not.toBe(CHARACTER_MODELS[recruit.sheet]);
    expect(captain.sheet).toBe(veteran.sheet);
    expect(recruit.gild ?? 0).toBe(0);
    expect(veteran.gild ?? 0).toBe(0);
    expect(captain.gild).toBeGreaterThan(0);
    expect(new Set([recruit.key, veteran.key, captain.key]).size).toBe(3);
  });

  it('gives recruit archers a bow and the shooting clip, and recruit swordsmen a melee swing', () => {
    const { rookies } = aWorld().withRookie('archer', 3, 3).withRookie('swordsman', 4, 4).build();
    const [archer, swordsman] = [lookFor(rookies[0], 'sword'), lookFor(rookies[1], 'sword')];
    expect(archer.attachments[0].model).toContain('bow');
    expect(clipNames(archer.sheet).attack).toBe('holding-both-shoot');
    expect(clipNames(swordsman.sheet).attack).toBe('attack-melee-right');
  });

  it('gives the spear knight the thrust clip and the sword knight a swing', () => {
    const { knight } = aWorld().build();
    const spear = lookFor(knight, 'spear');
    const sword = lookFor(knight, 'sword');
    expect(clipNames(spear.sheet, spear.attackClip).attack).toBe('thrust');
    expect(clipNames(sword.sheet, sword.attackClip).attack).toBe('attack-melee-right');
    expect(isThrust('spear')).toBe(true);
    expect(isThrust('sword')).toBe(false);
  });
});

const MODEL_FILES = Object.keys(import.meta.glob('/public/assets/models/**/*.glb', { query: '?url', import: 'default' }));

describe('characterModelPaths', () => {
  it('lists each model once, including attachments', () => {
    const paths = characterModelPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('mini-dungeon/shield-round');
    expect(paths).toContain('graveyard/character-zombie');
  });

  it('has a model for every monster sheet', () => {
    for (const [kind, def] of Object.entries(MONSTERS)) if (!def.inert) expect(CHARACTER_MODELS[def.sheet], kind).toBeDefined();
  });

  it('only lists models that exist on disk', () => {
    for (const p of characterModelPaths()) expect(MODEL_FILES, p).toContain(`/public/assets/models/${p}.glb`);
  });
});

describe('unitFx', () => {
  it('flashes white while hit', () => {
    const { knight } = aWorld().build();
    expect(unitFx(knight, true, 0).flash).toBe(1);
    expect(unitFx(knight, false, 0).flash).toBe(0);
  });

  it('sinks corpses after the death animation, never before', () => {
    const { monsters } = aWorld().withMonster('zombie', 3, 3).build();
    const z = monsters[0];
    z.state = 'dead';
    z.stateTime = CORPSE_SINK.after;
    expect(unitFx(z, false, 0).sink).toBe(0);
    z.stateTime = CORPSE_SINK.after + CORPSE_SINK.time / 2;
    expect(unitFx(z, false, 0).sink).toBeCloseTo(CORPSE_SINK.depth / 2);
    z.stateTime = 99;
    expect(unitFx(z, false, 0).sink).toBe(CORPSE_SINK.depth);
  });

  it('makes ghosts flicker and leaves other monsters opaque', () => {
    const { monsters } = aWorld().withMonster('ghost', 3, 3).withMonster('zombie', 4, 4).build();
    const alphas = [0, 0.5, 1, 1.5, 2].map((t) => unitFx(monsters[0], false, t).alpha);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.3);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.25);
    expect(unitFx(monsters[1], false, 1).alpha).toBe(1);
  });

  it('solid fliers that phase over things (gloom moths, wisps) do not flicker', () => {
    const { monsters } = aWorld().withMonster('gloomMoth', 3, 3).withMonster('wisp', 4, 4).build();
    for (const m of monsters) for (const t of [0, 0.5, 1, 1.5]) expect(unitFx(m, false, t).alpha).toBe(1);
  });

  it('blinks a hurt knight, but not while dodging', () => {
    const { knight } = aWorld().build();
    knight.invuln = 1;
    const blink = [0, 0.03, 0.06, 0.09, 0.12].map((t) => unitFx(knight, false, t).flash);
    expect(new Set(blink).size).toBeGreaterThan(1);
    knight.state = 'dodge';
    expect(unitFx(knight, false, 0.03).flash).toBe(0);
  });

  it('pulses a sapper red (negative flash), harder once the fuse is lit, and leaves other monsters alone', () => {
    const { monsters } = aWorld().withMonster('sapper', 3, 3).withMonster('zombie', 4, 4).build();
    const [sapper, zombie] = monsters;
    const times = Array.from({ length: 40 }, (_, k) => k * 0.05);
    const strongest = () => Math.max(...times.map((t) => -unitFx(sapper, false, t).flash));
    expect(times.every((t) => unitFx(sapper, false, t).flash <= 0)).toBe(true);
    const approaching = strongest();
    expect(approaching).toBeGreaterThan(0.1);
    sapper.abilityIn = 1;
    expect(strongest()).toBeGreaterThan(approaching);
    expect(unitFx(zombie, false, 0.3).flash).toBe(0);
    expect(unitFx(sapper, true, 0.3).flash).toBe(1);
  });
});

describe('wadeDepth', () => {
  // 10×10 field with a river at column 5.
  const rows = Array.from({ length: 10 }, () => '.....~....');
  const map = mapFromAscii(rows);
  const at = (kind: MonsterKind, x: number) => ({ kind, team: 'enemy' as const, x, y: 4 });

  it('sinks waders standing in the river, deeper for bigger models, capped', () => {
    const imp = wadeDepth(map, at('imp', 5), MONSTERS.imp.scale);
    const troll = wadeDepth(map, at('troll', 5.2), MONSTERS.troll.scale);
    expect(imp).toBeGreaterThan(0);
    expect(troll).toBeGreaterThan(imp);
    expect(troll).toBeLessThanOrEqual(WADE.max);
  });

  it('stays on the surface on dry ground, and for non-waders over water (ghosts)', () => {
    expect(wadeDepth(map, at('imp', 3), MONSTERS.imp.scale)).toBe(0);
    expect(wadeDepth(map, at('ghost', 5), MONSTERS.ghost.scale)).toBe(0);
    expect(wadeDepth(map, { kind: 'knight', team: 'player', x: 5, y: 4 }, 1)).toBe(0);
  });
});

describe('trap villager look', () => {
  it('is drawn with the recruit model, unarmed', () => {
    expect(CHARACTER_MODELS.villager).toBe(CHARACTER_MODELS.recruitSwordsman);
    expect(VILLAGER_LOOK.sheet).toBe('villager');
    expect(VILLAGER_LOOK.attachments).toEqual([]);
  });

  it('works with the interact clip while building, and only the villager has it', () => {
    expect(animFor({ state: 'idle', moving: false, working: true })).toBe('work');
    expect(animFor({ state: 'idle', moving: true })).toBe('walk');
    expect(clipNames('villager').work).toBe('interact-right');
    expect(clipNames('recruitSwordsman').work).toBeUndefined();
  });
});

describe('shades', () => {
  it('are drawn unseen out of the light (and cast no shadow), fully seen in it', () => {
    const { monsters: [shade, zombie] } = aWorld().withMonster('shade', 3, 3).withMonster('zombie', 4, 4).build();
    expect(lookFor(shade, 'sword').unseen).toBe(true);
    expect(lookFor(zombie, 'sword').unseen).toBeFalsy();
    expect(shadeAlpha(0, 'walk', 0)).toBe(1);
    expect(shadeAlpha(1, 'walk', 0)).toBe(0);
    expect(shadeAlpha(0.5, 'idle', 0)).toBeCloseTo(0.5);
  });

  it('shimmer faintly while they strike in the dark', () => {
    const swing = [0, 0.15, 0.3, 0.45, 0.6].map((t) => shadeAlpha(1, 'attack', t));
    expect(swing[0]).toBe(0);
    expect(Math.max(...swing)).toBeCloseTo(SHADE_SHIMMER, 5);
    expect(Math.max(...swing)).toBeLessThan(0.3);
    // In the light the swing is fully seen.
    expect(shadeAlpha(0, 'attack', 0.3)).toBe(1);
  });
});
