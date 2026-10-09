import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { districtHorizonColliders } from '@/world/districtColliders';

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
    // The relay towers are reachable now: shots/flight must hit their authored surfaces, while the canal stays open.
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const colliders = districtHorizonColliders(gltf.scene);
    expect(colliders).toHaveLength(3);
    for (const c of colliders) world.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices, c.indices));
    world.step();
    const cast = (x: number) => world.castRay(new RAPIER.Ray({ x, y: 30, z: -220 }, { x: 0, y: 0, z: -1 }), 80, true);
    expect(cast(-21)?.timeOfImpact).toBeGreaterThan(15);
    expect(cast(20)?.timeOfImpact).toBeLessThan(30);
    expect(cast(0)).toBeNull();
    world.free();
    gltf.scene.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
  });
});
