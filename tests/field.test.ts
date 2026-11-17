import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTER_BOUNDS } from '@/world/massifData';
import { makeField } from '@/world/fieldData';

const field = makeField();
const bytes = (f: ReturnType<typeof makeField>) => {
  const h = createHash('sha256');
  for (const g of f.geometries) h.update(Buffer.from(g.attributes.position.array.buffer)).update(Buffer.from(g.attributes.color.array.buffer));
  for (const t of f.terrains) h.update(Buffer.from(t.indices.buffer));
  return h.digest('hex');
};

describe('continuous outer Hermon ranges', () => {
  it('is deterministic and seeded without placement grids', () => {
    expect(bytes(makeField())).toBe(bytes(field));
    expect(bytes(makeField(7))).not.toBe(bytes(field));
    expect(field.terrains.map(t => t.id).sort()).toEqual(Object.keys(OUTER_BOUNDS).sort());
  });
  it('uses four abutting static meshes within the triangle budget', () => {
    expect(field.geometries).toHaveLength(4);
    expect(field.triangles).toBeLessThan(55000);
    expect(field.solids).toHaveLength(0);
    for (const chunk of field.terrains) {
      expect(chunk.triangles).toBeGreaterThan(1000);
      for (const name of ['position', 'normal', 'uv', 'color']) {
        expect(chunk.geometry.attributes[name].count).toBe(chunk.geometry.attributes.position.count);
      }
    }
  });
  it('covers the exact outer bounds rather than old inset city blocks', () => {
    for (const chunk of field.terrains) {
      const b = OUTER_BOUNDS[chunk.id as keyof typeof OUTER_BOUNDS];
      for (let i = 0; i < chunk.vertices.length; i += 3) {
        expect(chunk.vertices[i]).toBeGreaterThanOrEqual(b.minX);
        expect(chunk.vertices[i]).toBeLessThanOrEqual(b.maxX);
        expect(chunk.vertices[i + 2]).toBeGreaterThanOrEqual(b.minZ);
        expect(chunk.vertices[i + 2]).toBeLessThanOrEqual(b.maxZ);
      }
    }
  });
  it('mounts matching trimesh collision in the shared physics world', () => {
    const scene = readFileSync('src/world/Scene.tsx', 'utf8'), mesh = readFileSync('src/world/RuinField.tsx', 'utf8');
    const terrain = readFileSync('src/world/MassifTerrain.tsx', 'utf8');
    expect(scene).toMatch(/<Physics[\s\S]*<RuinField \/>[\s\S]*<\/Physics>/);
    expect(mesh).toContain('<RigidBody type="fixed"'); expect(mesh).toContain('<MassifTerrain chunks={field.terrains}');
    expect(terrain).toContain('TrimeshCollider'); expect(terrain).toContain('args={[chunk.vertices, chunk.indices]}');
    expect(mesh).not.toContain('concrete_floor_02_diff_1k.jpg');
  });
});
