import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry, Bone, DataTexture, Group, Mesh, MeshStandardMaterial, NearestFilter, NoColorSpace, Object3D, Quaternion,
  SRGBColorSpace, Vector3,
} from 'three';
import { attachArmCannon, buildArmCannon, detachArmCannon, disposeArmCannon, driveArmCannon, stepArmCannon } from '../src/world/cannonRuntime';
import { BARREL_AXIS, COLORS, NODES, SLIDE_MAX, VENT_MAX, restCannonDrive, type CannonDrive, type CannonLink } from '../src/world/cannonContract';

const tex = () => new DataTexture(new Uint8Array(8 * 8 * 4), 8, 8);
function fixture(skip?: string) {
  const material = new MeshStandardMaterial({ map: tex(), roughnessMap: tex(), metalnessMap: tex(), emissiveMap: tex() });
  const root = new Group(); root.name = NODES.root;
  const add = (parent: Object3D, name: string, o: Object3D) => { o.name = name; if (name !== skip) parent.add(o); return o; };
  const shell = add(root, NODES.shell, new Mesh(new BoxGeometry(.1, .3, .1), material));
  // A rotated, scaled frame between the root and the slide, so the slide direction must really be converted.
  const carrier = add(shell, 'carrier', new Object3D());
  carrier.rotation.set(.3, -.7, .2); carrier.scale.set(1.5, 1.5, 1.5); carrier.position.set(.01, -.2, .02);
  const slide = add(carrier, NODES.slide, new Mesh(new BoxGeometry(.05, .1, .05), material));
  slide.position.set(.002, -.05, .001);
  const vent = add(root, NODES.vent, new Mesh(new BoxGeometry(.07, .006, .045), material));
  vent.position.set(.01, -.19, -.07); vent.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), .4);
  add(slide, NODES.muzzle, new Object3D()).position.set(0, -.1, 0);
  add(shell, NODES.core, new Object3D()).position.set(0, -.25, -.05);
  add(vent, NODES.ventMouth, new Object3D()).position.set(0, .01, .02);
  return { root, material };
}
const drive = (): CannonDrive => {
  const d: CannonDrive = { slide: 0, vent: 0, core: 0, coreColor: { r: 0, g: 0, b: 0 }, strip: 0, stripColor: { r: 0, g: 0, b: 0 }, fins: 0, ring: 0 };
  restCannonDrive(d); return d;
};
const link = (): CannonLink => ({ forearm: null, ready: false, handHidden: false,
  ventMouth: { x: 0, y: 0, z: 0, valid: false }, ventDir: { x: 0, y: 1, z: 0 }, fxMuzzle: { x: 0, y: 0, z: 0, valid: false } });
const inRoot = (root: Object3D, o: Object3D) => { root.updateMatrixWorld(true); return root.worldToLocal(o.getWorldPosition(new Vector3())); };
const src = readFileSync(new URL('../src/world/cannonRuntime.ts', import.meta.url), 'utf8');
const body = (name: string) => { const i = src.indexOf('export function ' + name); return src.slice(i, src.indexOf('\n}\n', i)); };

describe('arm cannon build', () => {
  it('shares one cloned material, turns shadows off and uses nearest textures without mipmaps', () => {
    const { root, material } = fixture(), c = buildArmCannon(root);
    expect(c.shell.material).toBe(c.material); expect(c.slide.material).toBe(c.material); expect(c.vent.material).toBe(c.material);
    expect(c.material).not.toBe(material);
    expect(c.root.visible).toBe(false);
    c.root.traverse((o) => { if ((o as Mesh).isMesh) { expect(o.castShadow).toBe(false); expect(o.receiveShadow).toBe(false); } });
    for (const slot of ['map', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const) {
      const t = c.material[slot]!;
      expect(t.magFilter).toBe(NearestFilter); expect(t.minFilter).toBe(NearestFilter); expect(t.generateMipmaps).toBe(false);
      expect(t.colorSpace).toBe(slot === 'map' ? SRGBColorSpace : NoColorSpace);
    }
  });
  it('throws naming a missing node', () => {
    expect(() => buildArmCannon(fixture(NODES.vent).root)).toThrow(/cannon_vent/);
  });
  it('patches the emissive chunk with the returned uniforms and a stable cache key', () => {
    const c = buildArmCannon(fixture().root);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}' };
    (c.material.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, null);
    expect(shader.uniforms.uCore).toBe(c.uniforms.uCore); expect(shader.uniforms.uHeat).toBe(c.uniforms.uHeat); expect(shader.uniforms.uRing).toBe(c.uniforms.uRing);
    expect(shader.uniforms.uFin).toBe(c.uniforms.uFin);
    expect(shader.fragmentShader).not.toContain('#include <emissivemap_fragment>');
    // Strips are mask G 255 and the copper fins G 128: the fins take their own colour, so they glow only when hot.
    expect(shader.fragmentShader).toContain('float cannonStrip = step( 0.75, cannonMask.g ), cannonFin = step( 0.25, cannonMask.g ) - cannonStrip;');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance = cannonMask.r * uCore + cannonStrip * uHeat + cannonFin * uFin + cannonMask.b * uRing;');
    expect(shader.fragmentShader).toMatch(/uniform vec3 uCore;[\s\S]*uniform vec3 uHeat;[\s\S]*uniform vec3 uFin;[\s\S]*uniform vec3 uRing;[\s\S]*void main/);
    expect(c.material.customProgramCacheKey()).toBe('arm-cannon-mask-v2');
    expect(c.material.emissive.r).toBe(1); expect(c.material.emissive.g).toBe(1); expect(c.material.emissive.b).toBe(1);
  });
});

describe('arm cannon drive', () => {
  it('moves the slide exactly along -BARREL_AXIS in the root frame and clamps it', () => {
    const c = buildArmCannon(fixture().root), d = drive();
    const rest = inRoot(c.root, c.slide);
    d.slide = .02; driveArmCannon(c, d);
    const moved = inRoot(c.root, c.slide).sub(rest), axis = new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z).normalize();
    expect(moved.distanceTo(axis.multiplyScalar(-.02))).toBeLessThan(1e-9);
    d.slide = 1; driveArmCannon(c, d);
    expect(Math.abs(inRoot(c.root, c.slide).distanceTo(rest) - SLIDE_MAX)).toBeLessThan(1e-9);
  });
  it('opens the hatch by VENT_MAX about its local X', () => {
    const c = buildArmCannon(fixture().root), d = drive();
    d.vent = 1; driveArmCannon(c, d);
    const rel = c.ventRest.clone().invert().multiply(c.vent.quaternion);
    expect(2 * Math.acos(Math.min(1, Math.abs(rel.w)))).toBeCloseTo(VENT_MAX, 9);
    const axis = new Vector3(rel.x, rel.y, rel.z).normalize();
    expect(Math.abs(axis.x)).toBeCloseTo(1, 9); expect(Math.sign(rel.x * rel.w)).toBe(1);
  });
  it('falls back to the rest transform and glow on NaN', () => {
    const c = buildArmCannon(fixture().root), d = drive();
    d.slide = .02; d.vent = 1; driveArmCannon(c, d);
    Object.assign(d, { slide: NaN, vent: NaN, core: NaN, strip: NaN, fins: NaN, ring: NaN }); driveArmCannon(c, d);
    expect(c.slide.position.distanceTo(c.slideRest)).toBe(0);
    expect(c.vent.quaternion.angleTo(c.ventRest)).toBeLessThan(1e-7);
    expect(c.uniforms.uCore.value.r).toBeCloseTo(COLORS.fringe.r * .25, 12); expect(c.uniforms.uRing.value.b).toBe(0);
    expect([c.uniforms.uCore.value, c.uniforms.uHeat.value].every((v) => Number.isFinite(v.r + v.g + v.b))).toBe(true);
  });
  it('sets the uniforms to colour times intensity', () => {
    const c = buildArmCannon(fixture().root), d = drive();
    Object.assign(d, { core: 1.7, strip: .35, fins: .6, ring: .5, coreColor: { r: .9, g: .2, b: .1 }, stripColor: { ...COLORS.amber } });
    driveArmCannon(c, d);
    const u = c.uniforms;
    expect([u.uCore.value.r, u.uCore.value.g, u.uCore.value.b]).toEqual([.9 * 1.7, .2 * 1.7, .1 * 1.7]);
    expect([u.uHeat.value.r, u.uHeat.value.g, u.uHeat.value.b]).toEqual([COLORS.amber.r * .35, COLORS.amber.g * .35, COLORS.amber.b * .35]);
    expect([u.uFin.value.r, u.uFin.value.g, u.uFin.value.b]).toEqual([COLORS.amber.r * .6, COLORS.amber.g * .6, COLORS.amber.b * .6]);
    expect([u.uRing.value.r, u.uRing.value.g, u.uRing.value.b]).toEqual([COLORS.fringe.r * .5, COLORS.fringe.g * .5, COLORS.fringe.b * .5]);
  });
  it('allocates nothing in the per-frame functions (source guard)', () => {
    for (const name of ['driveArmCannon', 'stepArmCannon']) {
      const text = body(name);
      expect(text.length).toBeGreaterThan(50);
      expect(text).not.toMatch(/\bnew\s/);
      expect(text).not.toMatch(/[=(,:?]\s*[{[]/);
      expect(text).not.toMatch(/\.\.\./);
    }
  });
});

describe('arm cannon handshake', () => {
  const posed = () => { const b = new Bone(); b.position.set(.3, 1.2, -.1); b.rotation.set(.8, .2, -.4); b.updateMatrixWorld(true); return b; };
  it('stays unready without a forearm and becomes ready once parented to the bone', () => {
    const c = buildArmCannon(fixture().root), l = link();
    expect(attachArmCannon(c, l)).toBe(false); expect(l.ready).toBe(false); expect(c.root.parent).toBeNull();
    const bone = posed(); l.forearm = bone;
    expect(attachArmCannon(c, l)).toBe(true); expect(c.root.parent).toBe(bone); expect(l.ready).toBe(true);
    expect(c.root.position.lengthSq()).toBe(0); expect(c.root.quaternion.equals(new Quaternion())).toBe(true);
    expect(attachArmCannon(c, l)).toBe(false); expect(l.ready).toBe(true);
  });
  it('shows only once the hand is hidden and publishes the node world positions', () => {
    const c = buildArmCannon(fixture().root), l = link(), d = drive();
    l.forearm = posed();
    expect(stepArmCannon(c, l, d)).toBe(true);
    expect(c.root.visible).toBe(false); expect(l.fxMuzzle.valid).toBe(false); expect(l.ventMouth.valid).toBe(false);
    l.handHidden = true; d.slide = .015; d.vent = .8;
    expect(stepArmCannon(c, l, d)).toBe(false);
    expect(c.root.visible).toBe(true); expect(l.fxMuzzle.valid).toBe(true); expect(l.ventMouth.valid).toBe(true);
    l.forearm.updateMatrixWorld(true);
    const m = c.muzzle.getWorldPosition(new Vector3()), v = c.ventMouth.getWorldPosition(new Vector3());
    for (const [s, w] of [[l.fxMuzzle, m], [l.ventMouth, v]] as const) {
      expect(Math.abs(s.x - w.x)).toBeLessThan(1e-9); expect(Math.abs(s.y - w.y)).toBeLessThan(1e-9); expect(Math.abs(s.z - w.z)).toBeLessThan(1e-9);
    }
  });
  it('detach clears ready and both sockets; a changed forearm re-parents; a null forearm detaches', () => {
    const c = buildArmCannon(fixture().root), l = link(), d = drive();
    l.forearm = posed(); l.handHidden = true; stepArmCannon(c, l, d);
    detachArmCannon(c, l);
    expect(l.ready).toBe(false); expect(l.fxMuzzle.valid).toBe(false); expect(l.ventMouth.valid).toBe(false); expect(c.root.parent).toBeNull();
    stepArmCannon(c, l, d); expect(l.ready).toBe(true);
    const next = posed(); l.forearm = next;
    expect(stepArmCannon(c, l, d)).toBe(true); expect(c.root.parent).toBe(next); expect(l.ready).toBe(true);
    l.forearm = null; stepArmCannon(c, l, d);
    expect(c.root.parent).toBeNull(); expect(l.ready).toBe(false); expect(c.root.visible).toBe(false); expect(l.fxMuzzle.valid).toBe(false);
  });
});

describe('arm cannon warm-up and disposal', () => {
  it('warms the shaders against the real scene (source guard)', () => {
    const tsx = readFileSync(new URL('../src/world/ArmCannon.tsx', import.meta.url), 'utf8');
    expect(tsx).toMatch(/compileAsync\(\s*cannon\.root,\s*state\.camera,\s*state\.scene\s*\)/);
    expect(tsx).toMatch(/useFrame\(tick,\s*-19\)/);
    expect(tsx).toMatch(/guarded\('ArmCannon'/);
  });
  it('disposes the geometries, the cloned material and its textures', () => {
    const c = buildArmCannon(fixture().root), spies: ReturnType<typeof vi.fn>[] = [];
    c.root.traverse((o) => { if ((o as Mesh).isMesh) spies.push(vi.spyOn((o as Mesh).geometry, 'dispose') as never); });
    for (const slot of ['map', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const) spies.push(vi.spyOn(c.material[slot]!, 'dispose') as never);
    spies.push(vi.spyOn(c.material, 'dispose') as never);
    disposeArmCannon(c);
    expect(spies).toHaveLength(8);
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});
