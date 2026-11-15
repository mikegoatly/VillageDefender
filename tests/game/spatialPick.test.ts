import { describe, expect, it } from 'vitest';
import { pickInDirection, type PickItem } from '../../src/game/spatialPick';

const item = (id: number, x: number, y: number): PickItem => ({ id, pos: { x, y } });
const RIGHT = { x: 1, y: 0 };
const UP = { x: 0, y: -1 };
const C = { x: 0, y: 0 };

describe('pickInDirection', () => {
  it('returns -1 for an empty list', () => {
    expect(pickInDirection([], -1, RIGHT, C)).toBe(-1);
  });

  it('with nothing selected picks the item nearest the centre', () => {
    const items = [item(1, 100, 0), item(2, 10, 10), item(3, -50, 0)];
    expect(pickInDirection(items, -1, RIGHT, C)).toBe(2);
    expect(pickInDirection(items, -1, RIGHT, { x: -60, y: 0 })).toBe(3);
  });

  it('picks the nearest item in the pushed direction', () => {
    const items = [item(1, 0, 0), item(2, 50, 0), item(3, 100, 0), item(4, -50, 0)];
    expect(pickInDirection(items, 1, RIGHT, C)).toBe(2);
    expect(pickInDirection(items, 3, { x: -1, y: 0 }, C)).toBe(2);
  });

  it('works for non-axis-aligned direction vectors of any length', () => {
    const items = [item(1, 0, 0), item(2, 30, -30), item(3, 30, 30)];
    expect(pickInDirection(items, 1, { x: 5, y: -5 }, C)).toBe(2);
  });

  it('ignores items behind and more than ~65 degrees off-axis', () => {
    const items = [item(1, 0, 0), item(2, -50, 0), item(3, 10, 100)]; // 3 is ~84 degrees off
    expect(pickInDirection(items, 1, RIGHT, C)).toBe(1);
  });

  it('prefers a slightly farther on-axis item over a closer far-off-axis one', () => {
    const items = [item(1, 0, 0), item(2, 30, 50), item(3, 80, 0)]; // 2 is ~59 degrees off, closer
    expect(pickInDirection(items, 1, RIGHT, C)).toBe(3);
  });

  it('returns fromId when nothing lies in that direction', () => {
    const items = [item(1, 0, 0), item(2, -50, 0)];
    expect(pickInDirection(items, 1, RIGHT, C)).toBe(1);
    expect(pickInDirection(items, 1, UP, C)).toBe(1);
  });

  it('returns fromId when it is the only item', () => {
    expect(pickInDirection([item(7, 5, 5)], 7, RIGHT, C)).toBe(7);
  });

  it('treats an unknown fromId as nothing selected', () => {
    expect(pickInDirection([item(1, 10, 0), item(2, 50, 0)], 99, RIGHT, C)).toBe(1);
  });
});
