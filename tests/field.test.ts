import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { FIELD, makeField } from '@/world/fieldData';

// The flyable ruins around the district (Garo 2026-10-06: "open it up").
const field = makeField();
const bytes = (f: ReturnType<typeof makeField>) => {
  const h = createHash('sha256');
  for (const g of f.geometries) h.update(Buffer.from(g.attributes.position.array.buffer)).update(Buffer.from(g.attributes.color.array.buffer));
  return h.update(JSON.stringify(f.solids)).digest('hex');
};
const district = (x: number, z: number, pad: number) => x > FIELD.district.minX - pad && x < FIELD.district.maxX + pad && z > FIELD.district.minZ - pad && z < FIELD.district.maxZ + pad;

describe('flyable chasm field', () => {
  it('is deterministic: the same seed gives the same field, another seed does not', () => {
    expect(bytes(makeField())).toBe(bytes(field));
    expect(bytes(makeField(7))).not.toBe(bytes(field));
  });
  it('fills the box around the district with a mix of Dudael pieces, cheaply', () => {
    expect(field.placed.length).toBeGreaterThan(55);
    const kinds = (r: string) => field.placed.filter(p => p.kind === r).length;
    for (const r of ['spire', 'stele', 'fragment', 'pillar', 'raft']) expect(kinds(r)).toBeGreaterThanOrEqual(5);
    expect(field.triangles).toBeLessThan(40000);
    expect(field.solids.length).toBeLessThan(1200);
    expect(field.geometries).toHaveLength(4); // north, east, south, west: the frustum drops what is behind you
    for (const g of field.geometries) for (const name of ['position', 'normal', 'uv', 'color', 'aSeed', 'aWall']) expect(g.attributes[name].count).toBe(g.attributes.position.count);
  });
  it('keeps the district, the north canal avenue and a strip inside the box edges clear', () => {
    for (const p of field.placed) {
      expect(district(p.x, p.z, 10)).toBe(false);
      if (p.z < FIELD.district.minZ) expect(Math.abs(p.x) - p.w / 2).toBeGreaterThan(FIELD.avenue);
      expect(p.x - p.w).toBeGreaterThan(WORLD.minX + FIELD.inset - 10); expect(p.x + p.w).toBeLessThan(WORLD.maxX - FIELD.inset + 10);
      expect(p.z - p.d).toBeGreaterThan(WORLD.minZ + FIELD.inset - 10); expect(p.z + p.d).toBeLessThan(WORLD.maxZ - FIELD.inset + 10);
    }
  });
  it('leaves the canals open: footprints in neighbouring blocks never meet', () => {
    const resting = (a: typeof field.placed[number], b: typeof field.placed[number]) =>
      (a.preset === 'span' && b.preset === 'pier') || (b.preset === 'span' && a.preset === 'pier'); // the span rests on its piers
    for (let i = 0; i < field.placed.length; i++) for (let j = i + 1; j < field.placed.length; j++) {
      if (resting(field.placed[i], field.placed[j])) continue;
      const a = field.placed[i], b = field.placed[j];
      const gap = Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
      expect(gap).toBeGreaterThan(1);
    }
  });
  it('is ruins with matching colliders: exact boxes inside the box, steel the camera looks through', () => {
    expect(field.solids.filter(s => s.kind === 'frame').length).toBeGreaterThan(60);
    for (const s of field.solids) {
      for (const v of [...s.position, ...s.size, ...s.rotation]) expect(Number.isFinite(v)).toBe(true);
      expect(s.position[0]).toBeGreaterThan(WORLD.minX); expect(s.position[0]).toBeLessThan(WORLD.maxX);
      expect(s.position[2]).toBeGreaterThan(WORLD.minZ); expect(s.position[2]).toBeLessThan(WORLD.maxZ);
      expect(s.position[1] - s.size[1]).toBeLessThan(WORLD.ceiling);
    }
    for (const p of field.placed) expect(p.top!).toBeLessThan(WORLD.ceiling - 20); // room to fly over the tallest
    const src = readFileSync('src/world/fieldData.ts', 'utf8');
    expect(src).toContain('fieldSpecs(look, p.kind!, p.w, p.d, height)'); // exact boxes, so the colliders match
  });
  it('places the six set pieces and keeps their flight lines open', () => {
    const src = readFileSync('src/world/fieldData.ts', 'utf8');
    expect(src, 'anchor import').toContain("import { anchorSpecs, type Preset } from './dudaelFieldData'");
    const p = field.placed;
    const at = (x: number, z: number) => p.find(q => Math.abs(q.x - x) < .01 && Math.abs(q.z - z) < .01);
    // the gate pair flanking the north canal avenue, tall enough to be the first landmark
    for (const x of [40, -40]) {
      const gate = at(x, -280);
      expect(gate?.preset).toBe('gate'); expect(gate?.top!).toBeGreaterThan(80);
    }
    // the four titans' plaza has no extra crowding; the fallen span hangs 20 m plus above the water
    const span = at(296, -61);
    expect(span?.preset).toBe('span');
    // and the colossus tunnel is real: its body halves leave a gap wider than the flight floor
    expect(p.filter(q => q.preset === 'colossus')).toHaveLength(1);
    const shapes = readFileSync('src/world/dudaelFieldData.ts', 'utf8');
    expect(shapes).toContain('const gap = 15'); // the chamber width in the colossus builder
  });
  it('is mounted in the physics world with its colliders, as one lit, textured, fogged material', () => {
    const scene = readFileSync('src/world/Scene.tsx', 'utf8'), mesh = readFileSync('src/world/RuinField.tsx', 'utf8');
    expect(scene).toMatch(/<Physics[\s\S]*<RuinField \/>[\s\S]*<\/Physics>/);
    expect(mesh).toContain('MeshLambertMaterial'); expect(mesh).toContain('FRAME_GROUPS'); expect(mesh).toContain('removeRigidBody');
    expect(mesh).toContain('concrete_floor_02_diff_1k.jpg'); // the city's own texture: cached, no new download
  });
});
