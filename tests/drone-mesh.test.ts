import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Box3, BufferGeometry, MeshStandardMaterial, ShaderLib, Vector3, type DataTexture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { EYE_RADIUS } from '../src/game/combat';
import { buildDroneGeometry, createDroneMaterials, minWorldSize } from '../src/world/droneMesh';
import { EYE_MARKER } from '../src/world/watcherGeometry';
import { WATCHER_WING } from '../src/world/watcherWings';
import { BLADE, GUARD } from '../src/world/swordBlade';

const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const maxRadius = (g: BufferGeometry) => {
  const p = g.attributes.position, v = new Vector3(); let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, v.fromBufferAttribute(p, i).length());
  return r;
};
const alphaAt = (tex: DataTexture, x: number, y: number) => (tex.image.data as Uint8Array)[(y * tex.image.width + x) * 4 + 3];
const rOf = (x: number) => Math.abs((x + .5) / 32 - 1);

describe('the Watchers\' pooled geometry (watcherGeometry.ts)', () => {
  let g: ReturnType<typeof buildDroneGeometry>;
  beforeAll(() => { g = buildDroneGeometry(); });
  afterAll(() => Object.values(g).forEach(geo => geo.dispose()));
  it('builds one reduced feather wing pair of at most 4000 triangles a side, mirrored, skinned to the rig', () => {
    expect(tris(g.wingL)).toBeLessThanOrEqual(4000); expect(tris(g.wingR)).toBe(tris(g.wingL));
    expect(tris(g.wingL)).toBeGreaterThan(1000); // every feather kept, at fewer rows and columns
    for (const [geo, side] of [[g.wingL, -1], [g.wingR, 1]] as const) {
      const w = geo.attributes.aWingWeights, s = geo.attributes.aWingSide, p = geo.attributes.position;
      for (let i = 0; i < w.count; i++) {
        expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 6); expect(s.getX(i)).toBe(side);
        expect(Math.sign(p.getX(i))).toBe(side); // each wing stays on its own side of the spine
      }
      for (const name of ['skinIndex', 'skinWeight']) expect(geo.attributes[name]).toBeUndefined();
      expect(geo.attributes.uv).toBeDefined(); expect(geo.attributes.color).toBeDefined();
    }
    // The span: the archangel's wing (2.30 m tip at WING_SCALE .8) at the Watcher's scale, from its shoulder.
    const span = new Box3().setFromBufferAttribute(g.wingR.attributes.position as never);
    expect(span.max.x).toBeCloseTo(WATCHER_WING.root[0] + 2.30 * WATCHER_WING.scale, 1);
  });
  it('holds the blade along -Y from the grip and keeps the eye marker a small pair inside the weak-point sphere', () => {
    const blade = new Box3().setFromBufferAttribute(g.blade.attributes.position as never);
    expect(blade.min.y).toBeCloseTo(-GUARD - BLADE, 2); expect(blade.max.y).toBeLessThan(.2);
    const box = new Box3().setFromBufferAttribute(g.eye.attributes.position as never), c = box.getCenter(new Vector3());
    expect(Math.abs(c.x)).toBeLessThan(1e-6); expect(c.length()).toBeLessThan(.01);
    expect(box.max.x).toBeCloseTo(EYE_MARKER.apart + EYE_MARKER.radius, 3);
    expect(maxRadius(g.eye)).toBeLessThan(EYE_RADIUS);
  });
});

describe('drone materials', () => {
  it('injects the flash, damage and wing skin into the dark feather material with a stable program cache key', () => {
    const m = createDroneMaterials(), mat = m.feather;
    expect(mat).toBeInstanceOf(MeshStandardMaterial); expect(mat.vertexColors).toBe(true);
    expect(mat.map).toBe(m.atlas.colour); expect(mat.alphaTest).toBeGreaterThan(0); expect(mat.alphaToCoverage).toBe(true);
    expect(mat.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(.25); // tinted dark
    const key = mat.customProgramCacheKey(); expect(key).toBe(mat.customProgramCacheKey());
    // The real MeshStandardMaterial sources: the injection points must exist, and the rim runs after the normal is final.
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, null as unknown as WebGLRenderer);
    expect(shader.vertexShader).toContain('attribute float aFlash;');
    expect(shader.vertexShader).toContain('#include <begin_vertex>\nvFlash = aFlash;');
    expect(shader.vertexShader).toContain('transformed = (hostWingSkin() * vec4(transformed, 1.0)).xyz;');
    const fs = shader.fragmentShader, at = fs.indexOf('totalEmissiveRadiance += vec3(vFlash) * 1.6');
    expect(at).toBeGreaterThan(fs.indexOf('#include <normal_fragment_maps>'));
    expect(at).toBeGreaterThan(fs.indexOf('#include <emissivemap_fragment>'));
    expect(fs.startsWith('varying float vFlash;\nuniform vec3 uRim;')).toBe(true);
    expect(fs).toContain('totalEmissiveRadiance += uEmber * exposed * vDamage * 3.0;');
    expect((shader.uniforms as Record<string, { value: unknown }>).uWingPose.value).toBe(m.wings.texture);
    expect(m.blade.metalness).toBeGreaterThan(.5); expect(m.blade.map).toBeNull();
    expect(m.eye.toneMapped).toBe(false);
    for (const glow of [m.halo, m.ring]) {
      expect(glow.transparent).toBe(true); expect(glow.depthWrite).toBe(false);
      expect(glow.toneMapped).toBe(false); expect(glow.fog).toBe(false);
    }
    expect(m.halo.map).toBe(m.haloTexture); expect(m.ring.map).toBe(m.ringTexture);
    m.dispose();
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
    const all = [m.feather, m.blade, m.eye, m.halo, m.ring, m.haloTexture, m.ringTexture, m.wings.texture, m.atlas.colour, m.atlas.normal];
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
