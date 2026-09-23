// Shot and impact effect materials and pools: one halo texture, no lights, no per-frame allocation.
import { AdditiveBlending, BoxGeometry, DoubleSide, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage,
  InstancedBufferAttribute, InstancedMesh, LinearFilter, type Material, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  Points, PointsMaterial, RingGeometry, ShaderMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { puffFrame, puffU, type Puffs, type Rgb } from './fxPools';
export const FX = { core: new Color('#f2feff'), fringe: new Color('#58e1ff'), hot: new Color('#ff8a3c'), white: new Color('#ffffff'),
  spark: new Color('#ffd08a'), water: new Color('#9fe3d6'), fire: new Color('#ff9a3c'), ember: new Color('#8a1c0c'),
  smoke: new Color('#4a4450'), steam: new Color('#d9e2e0'), amber: new Color('#ffb347'),
  // Kill burst: a white-hot pop, a flame core that cools yellow -> orange -> ember, and a pale smoke plume that reads on ruins.
  pop: new Color('#fff2c0'), flame: new Color('#ffd27a'), blaze: new Color('#ff7a2a'), plume: new Color('#8c8794') };
/** Sparks never draw below this many drawing-buffer pixels (2 CSS px; ImpactFx sets it from the pixel ratio each frame). */
export const sparkMinPx = { value: 2 };
function sparkShader(shader: WebGLProgramParametersWithUniforms) {
  shader.uniforms.uMinPoint = sparkMinPx;
  shader.vertexShader = shader.vertexShader.replace('uniform float scale;', 'uniform float scale;\nuniform float uMinPoint;')
    .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = max(gl_PointSize, uMinPoint);\n#include <logdepthbuf_vertex>');
}
/** Per-instance heat (aHeat 0..1) glows the kill debris orange as it cools; break chips and cold pieces write 0. */
function debrisShader(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHeat;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .48, .16) * 2. * vHeat;');
}
function haloTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.min(1, Math.hypot(x + .5 - n / 2, y + .5 - n / 2) / (n / 2)), o = (y * n + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = Math.round((1 - r) * (1 - r) * 255);
  }
  const t = new DataTexture(data, n, n); t.magFilter = t.minFilter = LinearFilter; t.needsUpdate = true;
  return t;
}
const tracerVertex = `attribute vec3 aStart; attribute vec3 aEnd; attribute float aWidth; attribute float aAlpha;
varying vec2 vUv; varying float vAlpha;
void main(){ vec3 mid = (aStart + aEnd) * .5, c = cross(aEnd - aStart, cameraPosition - mid); float l = length(c);
  vec3 p = mix(aStart, aEnd, position.x + .5) + (l > 1e-8 ? c / l : vec3(0.)) * aWidth * position.y;
  vUv = uv; vAlpha = aAlpha; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`;
const tracerFragment = `uniform vec3 core; uniform vec3 fringe; varying vec2 vUv; varying float vAlpha;
void main(){ float d = abs(vUv.y - .5) * 2., k = smoothstep(.15, .6, d);
  gl_FragColor = vec4(mix(core, fringe, k), (1. - smoothstep(.6, 1., d)) * mix(1., .85, k) * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Per-instance alpha and view-space billboarding: the instance matrix carries only position and x/y size. */
function billboard(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
    .replace('#include <project_vertex>', `vAlpha = aAlpha;
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
mvPosition.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
gl_Position = projectionMatrix * mvPosition;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
}
function sprite(halo: DataTexture, additive: boolean) {
  const m = new MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, toneMapped: !additive, fog: !additive,
    ...(additive ? { blending: AdditiveBlending } : {}) });
  m.onBeforeCompile = billboard;
  const key = additive ? 'fx-sprite-add' : 'fx-sprite-alpha';
  m.customProgramCacheKey = () => key;
  return m;
}
function createKit() {
  const halo = haloTexture();
  return { halo, spriteAdd: sprite(halo, true), spriteAlpha: sprite(halo, false),
    tracer: new ShaderMaterial({ vertexShader: tracerVertex, fragmentShader: tracerFragment, uniforms: { core: { value: FX.core },
      fringe: { value: FX.fringe } }, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false,
      side: DoubleSide }),   // the ribbon's winding faces away from the camera with the spec's side = cross(end - start, eye - mid)
    ring: new MeshBasicMaterial({ color: FX.water, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: true }),
    spark: Object.assign(new PointsMaterial({ size: .15, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false,
      blending: AdditiveBlending, fog: true }), { onBeforeCompile: sparkShader, customProgramCacheKey: () => 'fx-spark' }),
    debris: Object.assign(new MeshStandardMaterial({ color: '#4a525c', metalness: .6, roughness: .55 }),
      { onBeforeCompile: debrisShader, customProgramCacheKey: () => 'fx-debris-heat' }) };
}
let kit: ReturnType<typeof createKit> | null = null, users = 0;
export const fxKit = () => kit ??= createKit();
/** Frees the GPU side of every shared material and the halo texture. The objects stay valid: three re-uploads them if used again. */
export function disposeFx() {
  if (!kit) return;
  kit.halo.dispose();
  for (const m of [kit.spriteAdd, kit.spriteAlpha, kit.tracer, kit.ring, kit.spark, kit.debris] as Material[]) m.dispose();
}
/** Effect-side reference count: call from useEffect so StrictMode remounts keep the shared materials. */
export function retainFx() { users++; return () => { if (--users <= 0) { users = 0; disposeFx(); } }; }
function dyn(g: BufferGeometry, name: string, n: number, size: number, instanced = true) {
  const a = instanced ? new InstancedBufferAttribute(new Float32Array(n * size), size) : new BufferAttribute(new Float32Array(n * size), size);
  a.setUsage(DynamicDrawUsage); g.setAttribute(name, a); (g.userData.dyn ??= []).push(a); return a;
}
function pool<T extends InstancedMesh | Points>(m: T) {
  m.castShadow = false; m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false;
  if (m instanceof InstancedMesh) { m.count = 0; m.instanceMatrix.setUsage(DynamicDrawUsage); m.instanceMatrix.array.fill(0); }
  return m;
}
function withColor(m: InstancedMesh) {
  m.instanceColor = new InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
  m.instanceColor.setUsage(DynamicDrawUsage); return m;
}
export function tracerPool(n: number) {
  const g = new PlaneGeometry(1, 1);
  dyn(g, 'aStart', n, 3); dyn(g, 'aEnd', n, 3); dyn(g, 'aWidth', n, 1); dyn(g, 'aAlpha', n, 1);
  return pool(new InstancedMesh(g, fxKit().tracer, n));
}
export function spritePool(n: number, additive: boolean) {
  const g = new PlaneGeometry(1, 1); dyn(g, 'aAlpha', n, 1);
  return pool(withColor(new InstancedMesh(g, additive ? fxKit().spriteAdd : fxKit().spriteAlpha, n)));
}
export function ringPool(n: number) {
  const g = new RingGeometry(.88, 1, 40, 1); g.rotateX(-Math.PI / 2);
  return pool(withColor(new InstancedMesh(g, fxKit().ring, n)));
}
export function debrisPool(n: number) {
  const g = new BoxGeometry(.5, .08, .35); dyn(g, 'aHeat', n, 1);
  return pool(new InstancedMesh(g, fxKit().debris, n));
}
export function sparkPool(n: number) {
  const g = new BufferGeometry(); dyn(g, 'position', n, 3, false); dyn(g, 'color', n, 3, false); g.setDrawRange(0, 0);
  return pool(new Points(g, fxKit().spark));
}
/** Geometry only: the materials are shared and freed by the last retainFx() release. */
export const disposePool = (m: InstancedMesh | Points) => { m.geometry.dispose(); if (m instanceof InstancedMesh) m.dispose(); };
/** Translation plus x/y/z scale; scale 0 hides a slot. */
export function place(m: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const e = m.instanceMatrix.array, o = i * 16;
  e[o] = sx; e[o + 1] = e[o + 2] = e[o + 3] = e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = e[o + 7] = e[o + 8] = e[o + 9] = 0;
  e[o + 10] = sz; e[o + 11] = 0; e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
}
export function tint(m: InstancedMesh, i: number, c: Rgb, k: number) {
  const a = m.instanceColor!.array; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
}
export function setSprite(m: InstancedMesh, i: number, p: { x: number; y: number; z: number }, sx: number, sy: number, c: Rgb, k: number, alpha: number) {
  place(m, i, p.x, p.y, p.z, sx, sy, 1); tint(m, i, c, k); (m.geometry.attributes.aAlpha.array as Float32Array)[i] = alpha;
}
export function hideSprite(m: InstancedMesh, i: number) { place(m, i, 0, 0, 0, 0, 0, 0); (m.geometry.attributes.aAlpha.array as Float32Array)[i] = 0; }
/** Draws live puffs into slots offset.., hides each newly dead slot once; returns the highest live slot + 1 (or 0). */
export function drawPuffs(m: InstancedMesh, p: Puffs, t: number, offset = 0) {
  let top = 0;
  for (let i = 0; i < p.size; i++) {
    const u = puffU(p, i, t);
    if (u < 0) { if (p.shown[i]) { hideSprite(m, offset + i); p.shown[i] = 0; } continue; }
    const a = puffFrame(p, i, u, pos, col, size);
    setSprite(m, offset + i, pos, size.x, size.y, col, 1, a); p.shown[i] = 1; top = offset + i + 1;
  }
  return top;
}
const pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 };
/** Publishes this frame's writes and draws only up to `count` (an empty pool issues no draw call). */
export function commit(m: InstancedMesh, count: number) {
  m.count = count; m.visible = count > 0;
  if (!count) return;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const dyn = m.geometry.userData.dyn as BufferAttribute[] | undefined;
  if (dyn) for (let k = 0; k < dyn.length; k++) dyn[k].needsUpdate = true;
}
