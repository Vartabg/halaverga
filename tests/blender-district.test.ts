import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Decode the shipped asset, catching missing compression support, UV pruning and runaway exports. */
describe('Blender district delivery', () => {
  it('decodes within budget with usable weathering UVs and expected world alignment', async () => {
    const data = readFileSync(new URL('../public/models/environment/meridian-district.glb', import.meta.url));
    expect(data.byteLength).toBeLessThan(6_500_000);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    let triangles = 0, meshes = 0;
    const materials = new Set<string>();
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      const material = object.material as MeshStandardMaterial;
      materials.add(material.name);
      expect(object.geometry.attributes.color).toBeDefined();
      expect(object.geometry.attributes.normal).toBeDefined();
      expect(object.geometry.attributes.uv).toBeDefined();
      const p = object.geometry.attributes.position;
      let finite = true;
      for (let i = 0; i < p.count; i++) finite &&= Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i));
      expect(finite).toBe(true);
    });
    expect(meshes).toBeLessThan(65); expect(triangles).toBeLessThan(300_000);
    expect(triangles).toBeGreaterThan(150_000);
    expect(materials).toEqual(new Set(['concrete', 'chalk', 'oxide', 'steel', 'glass', 'void', 'paint', 'ceramic']));
    const bounds = new Box3().setFromObject(gltf.scene);
    expect(bounds.min.y).toBeGreaterThan(-1.1); expect(bounds.max.y).toBeLessThan(100);
    expect(bounds.min.z).toBeLessThan(-220); expect(bounds.max.z).toBeGreaterThan(70);
    gltf.scene.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
  });
});
