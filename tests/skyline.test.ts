import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { SEA_BODY, SKYLINE, acesFilmic, type Rgb } from '@/world/atmospherePalette';
import { HILL, makeCity } from '@/world/cityData';
import { surface } from '@/world/kit';
import { pickMood } from '@/world/skylineDamage';
import { VISTA, makeSkyline, type Tower } from '@/world/skylineData';
import { mulberry32 } from '@/game/combat';

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

describe('far ruins generator', () => {
  it('is deterministic: the same seed gives the same bytes, another seed does not', () => {
    expect(hash(makeSkyline())).toBe(hash(sky));
    expect(hash(makeSkyline(7))).not.toBe(hash(sky));
  });
  it('stays inside its budget with sane colours', () => {
    expect(sky.triangles).toBeLessThanOrEqual(30000);
    expect(sky.triangles).toBeGreaterThanOrEqual(8000);
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
  it('is ruins, not buildings: stumps, bare skeletons, burned shells, fallen sections and rubble heaps (Garo, 2026-10-06)', () => {
    const ruins = (r: string) => sky.towers.filter(t => t.ruin === r).length, parts = (k: string) => sky.towers.filter(t => t.parts.some(p => p.kind === k)).length;
    for (const r of ['stump', 'skeleton', 'shell', 'fallen', 'mound']) expect(ruins(r)).toBeGreaterThan(15);
    for (const k of ['stub', 'rebar', 'rubble', 'column', 'floor', 'beam', 'wall', 'fallen', 'slab']) expect(parts(k)).toBeGreaterThanOrEqual(10);
    const tops = sky.towers.map(t => t.top).sort((a, b) => a - b);
    expect(tops[tops.length >> 1]).toBeLessThan(40); // most of the city is knee-high to what it was
    for (const t of sky.towers) if (t.top > 70) expect(['skeleton', 'shell']).toContain(t.ruin); // only gutted shapes still rise
    for (const t of sky.towers.filter(t => t.ruin === 'fallen')) expect(Math.min(...t.parts.filter(p => p.kind === 'fallen').map(p => p.min[1]))).toBeLessThan(.1); // sunk in the water
    expect(sky.towers.filter(t => t.lean > 0).length).toBeGreaterThan(15);
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
  it('marks the wall faces for the window holes and soot, and leaves steel, plates and rubble bare', () => {
    const wall = sky.geometry.attributes.aWall;
    expect(wall.count).toBe(sky.geometry.attributes.position.count);
    let walls = 0; for (let i = 0; i < wall.count; i++) { expect([0, 1]).toContain(wall.getX(i)); walls += wall.getX(i); }
    expect(walls / wall.count).toBeGreaterThan(.25); expect(walls / wall.count).toBeLessThan(.7);
  });
  it('gives every tower a seed (its layer plus a fraction) and its own mood, so no two read as twins', () => {
    const seed = sky.geometry.attributes.aSeed;
    expect(seed.count).toBe(sky.geometry.attributes.position.count);
    const layers = new Set<number>(), fractions = new Set<number>();
    for (let i = 0; i < seed.count; i++) { const v = seed.getX(i); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(3); layers.add(Math.floor(v)); fractions.add(Math.round((v % 1) * 1000)); }
    expect([...layers].sort()).toEqual([0, 1, 2]);
    expect(fractions.size).toBeGreaterThan(150); // about one per tower
    const moods = new Set<string>(); for (let i = 0; i < 400; i++) moods.add(pickMood(mulberry32(i * 31 + 5)).tone.join());
    expect(moods.size).toBeGreaterThanOrEqual(5);
  });
  it('keeps the layout of the skyline: damage comes from each tower\'s own stream, not the layout\'s', () => {
    expect([0, 1, 2].map(layer => sky.towers.filter(t => t.layer === layer).length)).toEqual([48, 59, 76]);
  });
  it('knows the sea\'s colour on screen: the tower feet mist toward it, and ACES twins three\'s curve', () => {
    const enc = (x: number) => Math.round(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055));
    const [r, g, b] = SEA_BODY.map(enc); // the poisoned sea at near-normal incidence: #1e2318, an oily dark olive
    expect(Math.abs(r - 30)).toBeLessThanOrEqual(3); expect(Math.abs(g - 35)).toBeLessThanOrEqual(3); expect(Math.abs(b - 24)).toBeLessThanOrEqual(3);
    const grey = (x: number): Rgb => [x, x, x];
    let last = -1; for (const x of [.01, .05, .18, .5, 1, 4]) { const v = acesFilmic(grey(x))[1]; expect(v).toBeGreaterThan(last); last = v; }
    expect(acesFilmic(grey(100))[0]).toBeGreaterThan(.97); expect(acesFilmic(grey(0))[0]).toBeLessThan(.001);
  });
  it('draws the foot as wet concrete, poisoned-sea mist and scum, empty burned windows, and lets the ash haze take every ruin', () => {
    const mesh = readFileSync('src/world/Skyline.tsx', 'utf8');
    for (const part of ['FOOT_SEA', 'SCUM', 'aSeed', 'aWall', 'SOOT', 'RUST', 'hole', 'plume', 'bleed', 'pow(f, 1.3)']) expect(mesh).toContain(part);
    expect(mesh).not.toMatch(/mix\(diffuseColor\.rgb, \$\{glslVec3\(HAZE\)\}/); // the foot no longer mists toward the sky haze
  });
  it('keeps the canal vista open and flanks it with clusters of tall skeletons and shells', () => {
    for (const t of sky.towers) if (t.layer < 2 && t.z < WORLD.minZ) expect(Math.abs(t.x)).toBeGreaterThanOrEqual(VISTA);
    const tall = (from: number, to: number) => sky.towers.filter(t => t.layer < 2 && t.z < WORLD.minZ && t.x > from && t.x < to && t.top >= 45);
    expect(tall(-130, -60).length).toBeGreaterThanOrEqual(2);
    expect(tall(60, 110).length).toBeGreaterThanOrEqual(1);
  });
  it('builds the district as ruins with matching colliders, and keeps the skyline out of the city mesh (2026-10-06)', () => {
    const city = makeCity();
    expect(city.solids.length).toBe(202); // was 101: open debris pits get rim walls, bare steel collides on its own
    expect(city.solids.filter(s => s.kind === 'frame').length).toBe(59);
    expect(city.solids.filter(s => s.kind === 'building').length).toBe(85);
    expect(createHash('sha256').update(JSON.stringify(city.solids)).digest('hex').slice(0, 16)).toBe('1da4d50ae27476b1');
    expect(city.geometry.index!.count / 3).toBe(44228); // 86,784 before: gutted cores, no glass curtain walls
    city.geometry.dispose();
  });
  it('draws the district-edge hills on the stone texture in ash grey: no light for eighty years, nothing green grows', () => {
    const sat = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (Math.max(...c) - Math.min(...c)) / Math.max(...c); };
    for (const hex of [HILL.wall, HILL.top, HILL.outerWall, HILL.outerTop]) {
      expect(surface(hex)).toBe(0); // stone, not the ground (moss) group
      expect(sat(hex)).toBeLessThanOrEqual(.15);
      const [r, g] = [1, 3].map(i => parseInt(hex.slice(i, i + 2), 16)); expect(g).toBeLessThanOrEqual(r); // never greener than red
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
  it('draws the hills and the terrace parapets in the calm concrete group, so big plain faces are not slabs of marble', () => {
    const city = makeCity();
    expect(city.geometry.groups.map(g => g.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]); // one more draw call, nothing else changes
    expect(city.geometry.groups[5].count / 3).toBe(1408); // the four cut-up hills and the two parapet panels
    expect(city.geometry.index!.count / 3).toBe(44228);
    const mats = readFileSync('src/world/cityMaterials.ts', 'utf8');
    expect(mats).toContain('concrete(true)'); expect(mats).toContain('return [stone, glass, metal, ground, paint, calm]');
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
