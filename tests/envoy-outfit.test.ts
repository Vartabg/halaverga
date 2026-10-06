import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { BONE_NAMES } from '../src/world/suitSkeleton';

// The Meridian Envoy outfit (Garo 2026-10-06, concept C), built by scripts/athletic_character/outfit.py inside build.py.
const meshes = async () => {
  const gltf = await loadSuit(), out: SkinnedMesh[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (o instanceof SkinnedMesh) out.push(o); });
  return out;
};
const finish = (m: SkinnedMesh) => (m.material as MeshStandardMaterial).name;
const joint = (m: SkinnedMesh, i: number, name: string) => {
  const index = m.skeleton.bones.findIndex(b => b.name === name), j = m.geometry.getAttribute('skinIndex'), w = m.geometry.getAttribute('skinWeight');
  let total = 0; for (let c = 0; c < 4; c++) if (j.getComponent(i, c) === index) total += w.getComponent(i, c);
  return total;
};

describe('Meridian Envoy outfit', () => {
  it('is one extra skinned surface on the same 21 bones: bone-white and graphite plates by vertex colour, and a teal glow', async () => {
    const all = await meshes(), plate = all.filter(m => finish(m) === 'plate'), glow = all.filter(m => finish(m) === 'glow');
    expect(plate).toHaveLength(1); expect(glow).toHaveLength(1);
    for (const m of [...plate, ...glow]) expect(m.skeleton.bones.map(b => b.name).sort()).toEqual([...BONE_NAMES].sort());
    const colours = plate[0].geometry.getAttribute('color');
    expect(colours).toBeDefined();
    const tones = new Set<number>(); for (let i = 0; i < colours.count; i++) tones.add(Math.round(colours.getX(i) * 10));
    expect(Math.max(...tones)).toBeGreaterThanOrEqual(7); expect(Math.min(...tones)).toBeLessThanOrEqual(1); // bone and graphite
    const light = glow[0].material as MeshStandardMaterial;
    expect(light.emissive.g).toBeGreaterThan(.8); expect(light.emissive.b).toBeGreaterThan(.6); expect(light.emissive.r).toBeLessThan(.3);
    expect(light.emissiveIntensity).toBeGreaterThan(2);
    expect(plate[0].geometry.getAttribute('uv')).toBeUndefined(); // untextured: no texcoords spent
  });
  it('leaves the right hand to the arm cannon: no outfit vertex follows hand_r, none rides the right forearm', async () => {
    for (const m of (await meshes()).filter(m => ['plate', 'glow'].includes(finish(m)))) {
      for (let i = 0; i < m.geometry.getAttribute('position').count; i++) {
        expect(joint(m, i, 'hand_r')).toBe(0);
        expect(joint(m, i, 'forearm_r')).toBeLessThan(.5);
      }
    }
  });
  it('keeps the face open (a blank helmet hid which way the hero faced) and seals both feet in boots', async () => {
    const all = await meshes(), skin = all.find(m => finish(m) === 'skin')!, outfit = all.filter(m => ['plate', 'glow'].includes(finish(m)));
    const head = new Box3().setFromBufferAttribute(skin.geometry.getAttribute('position') as never);
    const top = head.max.y, p = new Vector3();
    let face = 0, bootL = 0, bootR = 0;
    for (const m of outfit) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        // The face: in front of the head (glTF front is -Z), from the brow to the chin, inside the cheekbones.
        if (p.y > top - .27 && p.y < top - .1 && p.z < -.09 && Math.abs(p.x) < .055) face++;
        if (p.y < head.min.y + .09) { if (p.x < 0) bootL++; else bootR++; }
      }
    }
    expect(face).toBe(0);
    expect(bootL).toBeGreaterThan(50); expect(bootR).toBeGreaterThan(50);
  });
  it('is built by code inside the character build, so a rebuild gives the same outfit', () => {
    const build = readFileSync('scripts/athletic_character/build.py', 'utf8'), outfit = readFileSync('scripts/athletic_character/outfit.py', 'utf8');
    expect(build).toContain("armour = outfit.make(sources['textile'], sources['skin'])");
    expect(outfit).toContain("plate = bpy.data.materials.new('plate')"); expect(outfit).toContain("glow = bpy.data.materials.new('glow')");
    const report = JSON.parse(readFileSync('docs/art/athletic-character/asset.json', 'utf8'));
    expect(report.meshes.map((m: { name: string }) => m.name)).toContain('Explorer armour');
  });
});
