import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { SKYLINE } from '@/world/atmospherePalette';
import { HILL, makeCity } from '@/world/cityData';
import { surface } from '@/world/kit';
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
    expect(city.geometry.index!.count / 3).toBe(86784); // 85,928 before, minus the old 20 towers and caps (480), plus the 4 cut-up hills (1,336)
    city.geometry.dispose();
  });
  it('draws the district-edge hills on the stone texture in grey-green: the moss texture is yellow, and any tint on it came out lime', () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo;
      return { h: d ? 60 * (hi === g ? 2 + (b - r) / d : hi === r ? ((g - b) / d + 6) % 6 : 4 + (r - g) / d) : 0, s: hi ? d / hi : 0 };
    };
    for (const hex of [HILL.wall, HILL.top, HILL.outerWall, HILL.outerTop]) {
      expect(surface(hex)).toBe(0); // stone, not the ground (moss) group
      expect(hue(hex).h).toBeGreaterThanOrEqual(85); expect(hue(hex).s).toBeLessThanOrEqual(.32); // sage and grey, never yellow-green or saturated
    }
  });
  it('cuts each hill into cells with their own tone, so a 200 m top is not one flat colour', () => {
    const city = makeCity(), pos = city.geometry.attributes.position, nor = city.geometry.attributes.normal, color = city.geometry.attributes.color;
    const tops = new Set<number>();
    for (let i = 0; i < pos.count; i++) // the near east hill's top face: x 114 to 166, y 15.5, z -117.5 to 87.5
      if (nor.getY(i) > .9 && Math.abs(pos.getY(i) - 15.5) < .01 && pos.getX(i) >= 114 && pos.getX(i) <= 166 && pos.getZ(i) >= -117.5 && pos.getZ(i) <= 87.5) tops.add(Math.round(color.getY(i) * 1000));
    expect(tops.size).toBeGreaterThan(8);
    expect(Math.max(...tops) / Math.min(...tops)).toBeGreaterThan(1.25);
    city.geometry.dispose();
  });
  it('draws it as one static, unshadowed, fogged, display-referred mesh in the Scene', () => {
    const mesh = readFileSync('src/world/Skyline.tsx', 'utf8'), scene = readFileSync('src/world/Scene.tsx', 'utf8'), water = readFileSync('src/world/Atmosphere.tsx', 'utf8');
    expect(mesh).toContain('toneMapped: false'); expect(mesh).toContain('fog: true');
    expect(mesh).toContain('castShadow={false}'); expect(mesh).toContain('receiveShadow={false}');
    expect(mesh).not.toContain('useFrame'); expect(mesh).not.toContain('invalidate');
    expect(mesh).toContain('geometry.dispose()'); expect(mesh).toContain('material.dispose()');
    expect(scene).toContain('<Skyline />');
    // the sea follows the camera and takes the fog uniforms
    expect(water).toContain('UniformsLib.fog'); expect(water).toContain('camera.position.x'); expect(water).toMatch(/<shaderMaterial[^>]* fog\b/);
  });
});
