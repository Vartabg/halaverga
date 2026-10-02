import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { SKYLINE } from '@/world/atmospherePalette';
import { makeCity } from '@/world/cityData';
import { VISTA, makeSkyline, type Tower } from '@/world/skylineData';

const sky = makeSkyline();
const hash = (s: ReturnType<typeof makeSkyline>) => createHash('sha256')
  .update(Buffer.from(s.geometry.attributes.position.array.buffer)).update(Buffer.from(s.geometry.attributes.color.array.buffer))
  .update(Buffer.from(s.geometry.index!.array.buffer)).digest('hex');
const body = (t: Tower) => t.parts[0];
/** Distance in the ground plane from a part's bounds to the flyable box. */
const outside = (t: Tower) => {
  const b = body(t);
  return Math.hypot(Math.max(WORLD.minX - b.max[0], 0, b.min[0] - WORLD.maxX), Math.max(WORLD.minZ - b.max[2], 0, b.min[2] - WORLD.maxZ));
};
const overlap = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) => [0, 1, 2].every(i => a.min[i] <= b.max[i] && b.min[i] <= a.max[i]);
const north = (t: Tower, layer: number) => t.layer === layer && t.z < WORLD.minZ && Math.abs(t.x) <= 100;

describe('far skyline generator', () => {
  it('is deterministic: the same seed gives the same bytes, another seed does not', () => {
    expect(hash(makeSkyline())).toBe(hash(sky));
    expect(hash(makeSkyline(7))).not.toBe(hash(sky));
  });
  it('stays inside its budget with sane colours', () => {
    expect(sky.triangles).toBeLessThanOrEqual(6000);
    expect(sky.triangles).toBeGreaterThanOrEqual(2500);
    expect(sky.geometry.index!.count).toBe(sky.triangles * 3);
    for (const name of ['position', 'color']) for (const v of sky.geometry.attributes[name].array) expect(Number.isFinite(v)).toBe(true);
    for (const v of sky.geometry.attributes.color.array) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    for (const i of sky.geometry.index!.array) expect(i).toBeLessThan(sky.geometry.attributes.position.count);
  });
  it('has three layers of towers, nearer layers denser than none', () => {
    for (const layer of [0, 1, 2]) expect(sky.towers.filter(t => t.layer === layer).length).toBeGreaterThan(25);
  });
  it('stands every tower in the sea with nothing floating', () => {
    for (const t of sky.towers) {
      expect(t.foot[0]).toBeLessThanOrEqual(-2.5);
      expect(t.foot[1]).toBeLessThan(0);
      expect(t.top).toBeLessThanOrEqual(170);
      expect(t.lean).toBeLessThanOrEqual(.1);
      // Each upper part starts inside a part below it: a chain from the body up, so nothing hangs in the air.
      t.parts.forEach((part, i) => { if (i) expect(t.parts.slice(0, i).some(host => overlap(part, host))).toBe(true); });
    }
  });
  it('varies the shapes: setbacks, broken tops, spires, leans and green crowns', () => {
    const kinds = (k: string) => sky.towers.filter(t => t.parts.some(p => p.kind === k)).length;
    for (const k of ['setback', 'notch', 'slab', 'spire']) expect(kinds(k)).toBeGreaterThan(5);
    expect(sky.towers.filter(t => t.lean > 0).length).toBeGreaterThan(5);
    expect(kinds('crown')).toBeGreaterThan(3);
    expect(sky.towers.filter(t => t.layer > 0 && t.parts.some(p => p.kind === 'crown')).length).toBe(0);
    expect(new Set(sky.towers.map(t => Math.round(t.top))).size).toBeGreaterThan(40);
  });
  it('keeps every footprint 100 to 400 m outside the flyable box', () => {
    for (const t of sky.towers) { expect(outside(t)).toBeGreaterThanOrEqual(100); expect(outside(t)).toBeLessThanOrEqual(400); }
    const gaps = SKYLINE.gaps.map(g => Math.min(...g));
    expect(gaps[0]).toBeGreaterThanOrEqual(100);
    for (let i = 1; i < 3; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });
  it('puts the nearest north layer 340 to 410 m from the spawn camera', () => {
    const near = sky.towers.filter(t => north(t, 0));
    expect(near.length).toBeGreaterThan(2);
    for (const t of near) expect(Math.hypot(t.x, t.z - 72)).toBeGreaterThanOrEqual(340), expect(Math.hypot(t.x, t.z - 72)).toBeLessThanOrEqual(410);
  });
  it('keeps the canal vista open and flanks it with landmark clusters', () => {
    for (const t of sky.towers) if (t.layer < 2 && t.z < WORLD.minZ) expect(Math.abs(t.x)).toBeGreaterThanOrEqual(VISTA);
    const tall = (from: number, to: number) => sky.towers.filter(t => t.layer < 2 && t.z < WORLD.minZ && t.x > from && t.x < to && t.top >= 85);
    expect(tall(-130, -60).length).toBeGreaterThanOrEqual(2);
    expect(tall(60, 110).length).toBeGreaterThanOrEqual(1);
  });
  it('leaves the colliders alone and keeps the old skyline boxes out of the city mesh', () => {
    const city = makeCity();
    expect(city.solids.length).toBe(101);
    expect(createHash('sha256').update(JSON.stringify(city.solids)).digest('hex').slice(0, 16)).toBe('ef8cefd9ae2bbdc6');
    expect(city.geometry.index!.count / 3).toBe(85448); // 85,928 before, minus the old 20 towers and caps (480)
    city.geometry.dispose();
  });
  it('lifts the district-edge slabs in the ground (moss) group, so they never fall back to stone', () => {
    const city = makeCity(), color = city.geometry.attributes.color, index = city.geometry.index!, groups = city.geometry.groups;
    // Only the two slab tints, lifted, reach a linear channel of .9 or more; a hex missing from kit.ts's ground list would show up in the stone group.
    const peak = groups.map(g => { let top = 0; for (let i = g.start; i < g.start + g.count; i++) top = Math.max(top, color.getX(index.getX(i)), color.getY(index.getX(i)), color.getZ(index.getX(i))); return top; });
    expect(groups.length).toBe(5);
    expect(peak[3]).toBeGreaterThanOrEqual(.9);
    expect(peak.filter((_, i) => i !== 3).every(top => top < .9)).toBe(true);
    city.geometry.dispose();
  });
});
