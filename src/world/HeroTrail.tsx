'use client';
// The hero trail (spec 7, 'Consumed' ink): 1.2 s of the hero's hand path, a camera-facing strip that tapers 0.12 -> 0.06 m and fades
// with age. One draw call; the sample ring and vertex buffers are preallocated and fixed-size. Hidden under reduced motion. It
// samples at most once per 1/60 s (a faster frame moves the newest sample), and a still hero adds nothing, so its trail ages out.
// Lazy (default export). The sampler defaults to the hero position; the host can pass the hand's world position instead.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { TRAIL_S, TRAIL_W_MAX, TRAIL_W_MIN } from '@/game/gesture/tuning';
import type { Vec } from '@/game/motion';

export const TRAIL_STEP = 1 / 60, TRAIL_CAP = Math.ceil(TRAIL_S / TRAIL_STEP) + 2, TRAIL_MIN_MOVE = .02, TRAIL_ALPHA = .7;
const RGB = [.098, .75, 1] as const;

export type TrailBuffer = {
  /** Sample ring: x, y, z, t (seconds) per slot. head is the newest slot. */
  readonly ring: Float64Array; head: number; count: number;
  readonly pos: Float32Array; readonly col: Float32Array; readonly index: Uint16Array;
  drawCount: number;
};

export function createTrail(): TrailBuffer {
  const index = new Uint16Array((TRAIL_CAP - 1) * 6);
  for (let i = 0; i < TRAIL_CAP - 1; i++) {
    const v = i * 2, o = i * 6;
    index[o] = v; index[o + 1] = v + 1; index[o + 2] = v + 2; index[o + 3] = v + 1; index[o + 4] = v + 3; index[o + 5] = v + 2;
  }
  return { ring: new Float64Array(TRAIL_CAP * 4), head: -1, count: 0, pos: new Float32Array(TRAIL_CAP * 6), col: new Float32Array(TRAIL_CAP * 8),
    index, drawCount: 0 };
}

export function resetTrail(b: TrailBuffer) { b.head = -1; b.count = 0; b.drawCount = 0; }

/** Adds the hand position at time t (seconds). */
export function pushTrail(b: TrailBuffer, x: number, y: number, z: number, t: number) {
  const r = b.ring;
  if (b.count > 0) {
    const h = b.head * 4;
    if (t < r[h + 3]) { resetTrail(b); } // clock went back (remount, reset): start over
    else if (Math.hypot(x - r[h], y - r[h + 1], z - r[h + 2]) < TRAIL_MIN_MOVE) return;
    else if (b.count > 1 && t - r[((b.head - 1 + TRAIL_CAP) % TRAIL_CAP) * 4 + 3] < TRAIL_STEP) {
      r[h] = x; r[h + 1] = y; r[h + 2] = z; r[h + 3] = t; return;
    }
  }
  b.head = (b.head + 1) % TRAIL_CAP;
  const o = b.head * 4;
  r[o] = x; r[o + 1] = y; r[o + 2] = z; r[o + 3] = t;
  b.count = Math.min(TRAIL_CAP, b.count + 1);
}

const slotOf = (base: number, j: number) => ((base + j) % TRAIL_CAP) * 4;

/** Writes the strip for time t (seconds) seen from cam; returns the index count to draw (0 hides it). */
export function writeTrail(b: TrailBuffer, t: number, cam: Vec, reduced: boolean): number {
  if (reduced) { resetTrail(b); return 0; }
  const r = b.ring;
  // Drop samples older than TRAIL_S from the tail.
  while (b.count > 0 && t - r[((b.head - b.count + 1 + TRAIL_CAP) % TRAIL_CAP) * 4 + 3] > TRAIL_S) b.count--;
  const n = b.count;
  if (n < 2) { b.drawCount = 0; return 0; }
  const base = (b.head - n + 1 + TRAIL_CAP) % TRAIL_CAP; // slot of the oldest sample
  for (let j = 0; j < n; j++) {
    const o = slotOf(base, j), a = slotOf(base, Math.max(0, j - 1)), c = slotOf(base, Math.min(n - 1, j + 1));
    const x = r[o], y = r[o + 1], z = r[o + 2], tx = r[c] - r[a], ty = r[c + 1] - r[a + 1], tz = r[c + 2] - r[a + 2];
    const vx = cam.x - x, vy = cam.y - y, vz = cam.z - z;
    let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
    const age = Math.min(1, Math.max(0, (t - r[o + 3]) / TRAIL_S)), half = (TRAIL_W_MAX + (TRAIL_W_MIN - TRAIL_W_MAX) * age) / 2;
    const len = Math.hypot(sx, sy, sz);
    if (len > 1e-9) { const k = half / len; sx *= k; sy *= k; sz *= k; } else { sx = half; sy = sz = 0; }
    const p = j * 6, q = j * 8, alpha = TRAIL_ALPHA * (1 - age);
    const pos = b.pos, col = b.col;
    pos[p] = x - sx; pos[p + 1] = y - sy; pos[p + 2] = z - sz; pos[p + 3] = x + sx; pos[p + 4] = y + sy; pos[p + 5] = z + sz;
    col[q] = col[q + 4] = RGB[0]; col[q + 1] = col[q + 5] = RGB[1]; col[q + 2] = col[q + 6] = RGB[2]; col[q + 3] = col[q + 7] = alpha;
  }
  b.drawCount = (n - 1) * 6;
  return b.drawCount;
}

export type HeroTrailProps = { read?: (out: Vec) => boolean };
const heroPosition = (out: Vec) => { const p = runtime.position; out.x = p.x; out.y = p.y; out.z = p.z; return true; };

export default function HeroTrail({ read = heroPosition }: HeroTrailProps) {
  const { mesh, geometry, material, buffer, hand } = useMemo(() => {
    const buffer = createTrail(), geometry = new BufferGeometry();
    const pos = new BufferAttribute(buffer.pos, 3), col = new BufferAttribute(buffer.col, 4);
    pos.setUsage(DynamicDrawUsage); col.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', pos); geometry.setAttribute('color', col);
    geometry.setIndex(new BufferAttribute(buffer.index, 1)); geometry.setDrawRange(0, 0);
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
    material.forceSinglePass = true; // a transparent DoubleSide material otherwise draws in two passes (the budget allows +1 call)
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
    return { mesh, geometry, material, buffer, hand: { x: 0, y: 0, z: 0 } };
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(st => {
    const t = st.clock.elapsedTime, reduced = useGame.getState().reduced;
    if (!reduced && read(hand)) pushTrail(buffer, hand.x, hand.y, hand.z, t);
    const draw = writeTrail(buffer, t, st.camera.position, reduced);
    mesh.visible = draw > 0;
    if (!draw) return;
    geometry.setDrawRange(0, draw);
    geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
  }, -8);
  return <primitive object={mesh} />;
}
