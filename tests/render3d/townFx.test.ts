import { describe, expect, it } from 'vitest';
import { buildingPieces, doorCell, smokeSources, TOWN_MODELS, type BuildingLook, type Piece, type TownFort } from '../../src/render3d/buildings';
import { lookFor } from '../../src/render3d/characters';
import { armyGear, NO_FORT, townFort } from '../../src/render3d/upgradeFx';
import { aBuilding } from '../helpers/town3d';
import { aWorld } from '../helpers/worldBuilder';

const hall = () => aBuilding([[5, 5], [6, 5], [5, 6], [6, 6]], { id: 2, wallLevels: 1 });
const fort = (o: Partial<TownFort>): TownFort => ({ ...NO_FORT, ...o });
const look = (o: Partial<BuildingLook> = {}): BuildingLook => ({ role: null, damage: 'intact', fort: NO_FORT, ...o });
const count = (ps: Piece[], model: string) => ps.filter((p) => p.model === model).length;
const pieces = (f: Partial<TownFort>, o: Partial<BuildingLook> = {}) => buildingPieces(hall(), look({ ...o, fort: fort(f) }));

describe('town upgrades on buildings', () => {
  it('add nothing without upgrades', () => {
    expect(pieces({})).toEqual(buildingPieces(hall(), look()));
  });

  it('fence the camera-facing sides, then all round, then a palisade (Reinforced Walls)', () => {
    const one = count(pieces({ walls: 1 }), 'fantasy-town/fence');
    const two = count(pieces({ walls: 2 }), 'fantasy-town/fence');
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    expect(count(pieces({ walls: 3 }), 'survival/fence-fortified')).toBeGreaterThanOrEqual(two);
    expect(count(pieces({ walls: 3 }), 'fantasy-town/fence')).toBe(0);
  });

  it('keep the front door clear of fences', () => {
    const [di, dj] = doorCell(hall());
    const fences = pieces({ walls: 3 }).filter((p) => p.model.includes('fence'));
    expect(fences.some((p) => Math.abs(p.z - dj) < 0.01 && p.x > di + 0.5)).toBe(false);
  });

  it('put more spike traps by the door with each Spiked Doors stack', () => {
    const n = [1, 2, 3].map((l) => count(pieces({ thorns: l }), 'mini-dungeon/trap'));
    expect(n).toEqual([1, 2, 3]);
  });

  it('cut more arrow slits with each Arrow Slits stack', () => {
    const n = [1, 2, 3].map((l) => count(pieces({ slits: l }), 'slit'));
    expect(n[0]).toBeGreaterThan(0);
    expect(n[1]).toBeGreaterThan(n[0]);
    expect(n[2]).toBeGreaterThanOrEqual(n[1]);
  });

  it('stack planks and then lean a ladder for Repair Crews', () => {
    expect(count(pieces({ crews: 1 }), 'survival/resource-planks')).toBe(0);
    expect(count(pieces({ crews: 2 }), 'survival/resource-planks')).toBeGreaterThan(0);
    expect(count(pieces({ crews: 3 }), 'mini-forest/ladder')).toBe(1);
  });

  it('pool tar, then light braziers that burn (Tar Pits)', () => {
    expect(count(pieces({ tar: 1 }), 'tar')).toBeGreaterThan(0);
    expect(count(pieces({ tar: 1 }), 'graveyard/fire-basket')).toBe(0);
    expect(count(pieces({ tar: 2 }), 'graveyard/fire-basket')).toBe(2);
    expect(smokeSources(hall(), look({ fort: fort({ tar: 2 }) })).filter((s) => s.kind === 'brazier')).toHaveLength(2);
  });

  it('hang more banners and pennants on the barracks for Recruitment Drive and Bigger Garrison', () => {
    const base = pieces({}, { role: 'barracks' });
    const drive = pieces({ recruit: 2 }, { role: 'barracks' });
    const garrison = pieces({ garrison: 2 }, { role: 'barracks' });
    expect(count(drive, 'fantasy-town/banner-red')).toBeGreaterThan(count(base, 'fantasy-town/banner-red'));
    expect(count(garrison, 'castle/flag-pennant')).toBeGreaterThan(count(base, 'castle/flag-pennant'));
    // Only the barracks shows them.
    expect(pieces({ recruit: 2, garrison: 2 })).toEqual(buildingPieces(hall(), look()));
  });

  it('show nothing on a ruin', () => {
    const ruin = buildingPieces(hall(), look({ damage: 'ruined', fort: fort({ walls: 3, thorns: 3, tar: 2 }) }));
    expect(ruin).toEqual(buildingPieces(hall(), look({ damage: 'ruined' })));
  });

  it('only use models that are preloaded (or generated)', () => {
    const all = pieces({ walls: 3, thorns: 3, slits: 3, crews: 3, tar: 2, recruit: 3, garrison: 3 }, { role: 'barracks' });
    for (const p of all) if (p.model !== 'slit' && p.model !== 'tar') expect(TOWN_MODELS).toContain(p.model);
  });
});

describe('townFort', () => {
  it('reads the town and army upgrade stacks, and keys equal forts equally', () => {
    const plain = townFort(aWorld().build().world);
    const { world } = aWorld().withUpgrades({ walls: 2, slits: 1, recruit: 1 }).build();
    expect(plain).toEqual(NO_FORT);
    const f = townFort(world);
    expect(f).toMatchObject({ walls: 2, slits: 1, recruit: 1, thorns: 0 });
    expect(f.key).not.toBe(plain.key);
  });
});

describe('armyGear', () => {
  it('bulks rookies up with Drilled Recruits and lights their weapons with Better Arms', () => {
    const { world, rookies } = aWorld().withRookie('swordsman', 5, 5).withUpgrades({ drill: 3, arms: 3 }).build();
    const plainGear = armyGear(aWorld().build().world);
    const gear = armyGear(world);
    const plain = lookFor(rookies[0], 'sword', undefined, plainGear);
    const kitted = lookFor(rookies[0], 'sword', undefined, gear);
    expect(kitted.scale).toBeGreaterThan(plain.scale);
    expect(kitted.attachments[0].glow?.amount).toBeGreaterThan(0);
    expect(plain.attachments[0].glow).toBeUndefined();
    expect(kitted.key).not.toBe(plain.key);
  });
});
