import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, PlaneGeometry, ShaderMaterial, type Mesh } from 'three';
import { FLIGHT_FLOOR, WORLD } from '@/game/motion';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { easeFace, faceTarget, type FaceKind } from '@/game/faceFade';
// Visible faces for the six district limits (limits plan S4). The survey frame alone was twelve hairline edges, so a wall face had no
// cue at all and the canal and skyline ran on past it. Each face is one grid plane with a soft wash that fades in as the suit nears it
// (faceFade.ts: from 30 m at cruise to 60 m at surge, full inside half of that) and is brightest on the nearest face; the floor and the
// sky face show only while their limit cue is on. Purely visual: no collider, no input, depthWrite off, and a face out of range is not
// drawn, so the cost is at most six draw calls, none while the edges are far.
const W = WORLD.maxX - WORLD.minX, D = WORLD.maxZ - WORLD.minZ, H = WORLD.ceiling, CZ = (WORLD.minZ + WORLD.maxZ) / 2;
type Face = { kind: FaceKind; size: [number, number]; at: [number, number, number]; rot: [number, number, number]; gap: (p: { x: number; y: number; z: number }) => number };
const FACES: Face[] = [
  { kind: 'wall', size: [D, H], at: [WORLD.minX, H / 2, CZ], rot: [0, Math.PI / 2, 0], gap: p => p.x - WORLD.minX },
  { kind: 'wall', size: [D, H], at: [WORLD.maxX, H / 2, CZ], rot: [0, -Math.PI / 2, 0], gap: p => WORLD.maxX - p.x },
  { kind: 'wall', size: [W, H], at: [0, H / 2, WORLD.minZ], rot: [0, 0, 0], gap: p => p.z - WORLD.minZ },
  { kind: 'wall', size: [W, H], at: [0, H / 2, WORLD.maxZ], rot: [0, Math.PI, 0], gap: p => WORLD.maxZ - p.z },
  { kind: 'ceiling', size: [W, D], at: [0, WORLD.ceiling, CZ], rot: [Math.PI / 2, 0, 0], gap: p => WORLD.ceiling - p.y },
  { kind: 'floor', size: [W, D], at: [0, FLIGHT_FLOOR, CZ], rot: [-Math.PI / 2, 0, 0], gap: p => p.y - FLIGHT_FLOOR },
];
const vertex = `varying vec2 vUv; varying vec3 vView; varying vec3 vN;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vView = cameraPosition - w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const fragment = `uniform float uFade; uniform vec2 uSize; uniform vec3 uColor; varying vec2 vUv; varying vec3 vView; varying vec3 vN;
void main() {
  vec2 c = vUv * uSize / 8.0; vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c); float line = 1.0 - min(min(g.x, g.y), 1.0);
  float rim = pow(1.0 - abs(dot(normalize(vView), vN)), 2.0);
  gl_FragColor = vec4(uColor, uFade * (0.16 + 0.55 * line + 0.3 * rim));
}`;
export default function BoundaryFaces() {
  const refs = useRef<(Mesh | null)[]>([]), levels = useRef<number[]>(FACES.map(() => 0));
  const parts = useMemo(() => FACES.map(f => ({ geometry: new PlaneGeometry(f.size[0], f.size[1]),
    material: new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: { uFade: { value: 0 }, uSize: { value: f.size }, uColor: { value: [1, .66, .32] } } }) })), []);
  useEffect(() => () => parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }), [parts]);
  useFrame((_, delta) => {
    const on = useGame.getState().started && !useGame.getState().paused, speed = runtime.speed, cue = runtime.clearance.cue;
    let nearest = Infinity; for (const f of FACES) nearest = Math.min(nearest, f.gap(runtime.position));
    FACES.forEach((f, i) => {
      const m = refs.current[i]; if (!m) return;
      const gap = f.gap(runtime.position), target = on ? faceTarget(f.kind, gap, speed, gap <= nearest + .01, cue) : 0;
      const level = levels.current[i] = easeFace(levels.current[i], target, Math.min(delta, .1));
      m.visible = level > .01; (parts[i].material.uniforms.uFade as { value: number }).value = level;
    });
  });
  return <>{FACES.map((f, i) => <mesh key={i} ref={n => { refs.current[i] = n; }} geometry={parts[i].geometry} material={parts[i].material}
    position={f.at} rotation={f.rot} visible={false} renderOrder={2} frustumCulled={false} />)}</>;
}
