import { describe, expect, it } from 'vitest';
import { Box3, BufferGeometry, MeshStandardMaterial, ShaderLib, Sphere, Vector3, type DataTexture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { DRONE_RADIUS } from '../src/game/combat';
import { buildDroneGeometry, createDroneMaterials, minWorldSize } from '../src/world/droneMesh';

const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const maxRadius = (g: BufferGeometry) => {
  const p = g.attributes.position, v = new Vector3(); let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, v.fromBufferAttribute(p, i).length());
  return r;
};
const alphaAt = (tex: DataTexture, x: number, y: number) => (tex.image.data as Uint8Array)[(y * tex.image.width + x) * 4 + 3];
const rOf = (x: number) => Math.abs((x + .5) / 32 - 1);

describe('drone geometry', () => {
  const g = buildDroneGeometry();
  it('stays within 1400 triangles per drone (body + plate + eye + halo + ring)', () => {
    const total = tris(g.body) + tris(g.plate) + tris(g.eye) + tris(g.halo) * 2;
    expect(total).toBeGreaterThan(900);
    expect(total).toBeLessThanOrEqual(1400);
  });
  it('merges to consistent non-indexed attributes with normals', () => {
    for (const geo of [g.body, g.plate]) {
      expect(geo.index).toBeNull();
      expect(geo.attributes.normal.count).toBe(geo.attributes.position.count);
    }
  });
  it('keeps body and plate inside a .95 m radius, close to the hit sphere', () => {
    expect(maxRadius(g.body)).toBeLessThanOrEqual(.95);
    expect(maxRadius(g.plate)).toBeLessThanOrEqual(.95);
    expect(maxRadius(g.body)).toBeGreaterThan(DRONE_RADIUS * .8);
  });
  it('centres the eye at the origin', () => {
    const box = new Box3().setFromBufferAttribute(g.eye.attributes.position as never), c = box.getCenter(new Vector3());
    expect(c.length()).toBeLessThan(1e-6);
    g.eye.computeBoundingSphere();
    expect((g.eye.boundingSphere as Sphere).radius).toBeCloseTo(.32, 5);
  });
});

describe('drone materials', () => {
  it('injects the flash attribute and rim with a stable program cache key', () => {
    const m = createDroneMaterials();
    for (const mat of [m.body, m.plate]) {
      expect(mat).toBeInstanceOf(MeshStandardMaterial);
      expect(mat.metalness).toBe(.6); expect(mat.roughness).toBe(.45);
      expect(typeof mat.onBeforeCompile).toBe('function');
      const key = mat.customProgramCacheKey();
      expect(key).toBe(mat.customProgramCacheKey());
      // The real MeshStandardMaterial sources: the injection points must exist, and the rim runs after the normal is final.
      const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
      mat.onBeforeCompile(shader, null as unknown as WebGLRenderer);
      expect(shader.vertexShader).toContain('attribute float aFlash;');
      expect(shader.vertexShader).toContain('#include <begin_vertex>\nvFlash = aFlash;');
      const fs = shader.fragmentShader, at = fs.indexOf('totalEmissiveRadiance += vec3(vFlash) * 1.6');
      expect(at).toBeGreaterThan(fs.indexOf('#include <normal_fragment_maps>'));
      expect(at).toBeGreaterThan(fs.indexOf('#include <emissivemap_fragment>'));
      expect(fs.startsWith('varying float vFlash;\nuniform vec3 uRim;')).toBe(true);
      expect(shader.uniforms.uRim).toBeDefined();
    }
    expect(m.body.customProgramCacheKey()).toBe(m.plate.customProgramCacheKey());
    const rim = (mat: MeshStandardMaterial) => {
      const shader = { uniforms: {} as Record<string, { value: { r: number } }>, vertexShader: '', fragmentShader: '' };
      mat.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, null as unknown as WebGLRenderer);
      return shader.uniforms.uRim.value.r;
    };
    expect(rim(m.body) / rim(m.plate)).toBeCloseTo(.35 / .25, 5);
    expect(m.eye.toneMapped).toBe(false);
    for (const glow of [m.halo, m.ring]) {
      expect(glow.transparent).toBe(true); expect(glow.depthWrite).toBe(false);
      expect(glow.toneMapped).toBe(false); expect(glow.fog).toBe(false);
    }
    expect(m.halo.map).toBe(m.haloTexture); expect(m.ring.map).toBe(m.ringTexture);
  });
  it('builds a 64x64 halo that is bright at the centre and clear at the corners', () => {
    const { haloTexture: t } = createDroneMaterials();
    expect(t.image.width).toBe(64); expect(t.image.height).toBe(64);
    expect(t.version).toBeGreaterThan(0);
    expect(alphaAt(t, 31, 31)).toBeGreaterThan(230);
    for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63]]) expect(alphaAt(t, x, y)).toBe(0);
    expect(alphaAt(t, 47, 31)).toBeLessThan(alphaAt(t, 39, 31));
  });
  it('builds a thin ring that is clear at the centre and peaks near r .85', () => {
    const { ringTexture: t } = createDroneMaterials();
    expect(t.image.width).toBe(64); expect(t.image.height).toBe(64);
    expect(alphaAt(t, 31, 31)).toBe(0);
    expect(alphaAt(t, 0, 0)).toBe(0);
    let best = 0, bestX = 0;
    for (let x = 32; x < 64; x++) if (alphaAt(t, x, 31) > best) { best = alphaAt(t, x, 31); bestX = x; }
    expect(best).toBeGreaterThan(240);
    expect(rOf(bestX)).toBeGreaterThan(.8); expect(rOf(bestX)).toBeLessThan(.92);
    expect(alphaAt(t, 44, 31)).toBe(0);
  });
  it('dispose() disposes every material and texture', () => {
    const m = createDroneMaterials(), seen = new Set<unknown>();
    const all = [m.body, m.plate, m.eye, m.halo, m.ring, m.haloTexture, m.ringTexture];
    all.forEach(o => o.addEventListener('dispose', () => seen.add(o)));
    m.dispose();
    expect(seen.size).toBe(all.length);
  });
});

describe('minimum on-screen size', () => {
  it('inverts to the requested pixel count', () => {
    expect(minWorldSize(10, 60, 65, 393) * 393 / (60 * 2 * Math.tan(32.5 * Math.PI / 180))).toBeCloseTo(10, 10);
  });
  it('gives a 60 m drone at least a 10 px halo in iPhone landscape', () => {
    const size = Math.max(.9, minWorldSize(10, 60, 65, 393)), px = size / minWorldSize(1, 60, 65, 393);
    expect(px).toBeGreaterThanOrEqual(10);
    expect(Math.max(.9, minWorldSize(10, 5, 65, 393))).toBe(.9);
  });
});
