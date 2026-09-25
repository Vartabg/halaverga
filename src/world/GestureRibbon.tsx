'use client';
// The Draw path as a world ribbon (spec 4.1, 7): the committed ink older than 150 ms, re-drawn each frame in 3D so the ink you see
// is the path. Unflown segments bright, spent segments grey and fading 350 ms after the hero passes them, the blocked tail amber.
// One camera-facing triangle strip, at most 128 points, one draw call, every buffer preallocated. Hidden under reduced motion.
// Lazy (default export); it reads ribbonLink.path unless given its own reader.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial } from 'three';
import { useGame } from '@/game/store';
import { INK_WORLD_MS } from '@/game/gesture/tuning';
import { ribbonLink, type RibbonPath } from '@/ui/gesture/guideSteps';
import type { Vec } from '@/game/motion';

export const RIBBON_MAX = 128, RIBBON_HALF_W = .18, SPENT_FADE_MS = 350;
/**
 * Strip hygiene: a segment longer than RIBBON_GAP_M (over 2.5x the 1.5 m spacing) is not drawn, so a stale or far point can never
 * be joined into a screen-filling wedge; points within NEAR_M of the camera fade out over NEAR_FADE_M, so a strip passing the
 * lens never fills the view.
 */
export const RIBBON_GAP_M = 4, NEAR_M = 1, NEAR_FADE_M = 2;
/** Linear RGB + alpha per phase: unflown ink (#58e1ff), spent (grey), blocked (amber). */
const INK = [.098, .75, 1, .9] as const, SPENT = [.36, .4, .42, .55] as const, AMBER = [1, .55, .08, .9] as const;

export type RibbonBuffer = {
  readonly pos: Float32Array; readonly col: Float32Array; readonly index: Uint16Array;
  /** When each ring slot's point was first seen spent, and which absolute point that slot held then. */
  readonly spentAt: Float64Array; readonly spentSeq: Float64Array;
  /** Points written this frame (vertices = 2 x points) and the index count to draw. */
  points: number; drawCount: number;
};

export function createRibbon(): RibbonBuffer {
  const index = new Uint16Array((RIBBON_MAX - 1) * 6);
  for (let i = 0; i < RIBBON_MAX - 1; i++) {
    const v = i * 2, o = i * 6;
    index[o] = v; index[o + 1] = v + 1; index[o + 2] = v + 2; index[o + 3] = v + 1; index[o + 4] = v + 3; index[o + 5] = v + 2;
  }
  return { pos: new Float32Array(RIBBON_MAX * 6), col: new Float32Array(RIBBON_MAX * 8), index,
    spentAt: new Float64Array(RIBBON_MAX), spentSeq: new Float64Array(RIBBON_MAX).fill(-1), points: 0, drawCount: 0 };
}

const clear = (b: RibbonBuffer) => { b.points = 0; b.drawCount = 0; return 0; };

/**
 * Writes the ribbon for `now` (ms) and returns the index count to draw (0 hides it). Only points whose ink is at least INK_WORLD_MS
 * old are drawn (the screen ink still shows the newer tail); a spent point whose fade has ended is dropped from the front.
 */
export function writeRibbon(b: RibbonBuffer, path: RibbonPath | null, now: number, cam: Vec, reduced: boolean): number {
  if (reduced || !path) return clear(b);
  const n = Math.min(path.count, RIBBON_MAX), flown = path.flown, blocked = path.blocked;
  let end = 0;
  while (end < n && now - path.t(end) >= INK_WORLD_MS) end++;
  // Fade clocks for spent points, then skip the fully faded front.
  let start = 0;
  for (let i = 0; i < end && i < flown; i++) {
    const seq = path.seq0 + i, slot = seq % RIBBON_MAX;
    if (b.spentSeq[slot] !== seq) { b.spentSeq[slot] = seq; b.spentAt[slot] = now; }
    if (now - b.spentAt[slot] >= SPENT_FADE_MS && start === i) start = i + 1;
  }
  const count = end - start;
  if (count < 2) return clear(b);
  const { pos, col } = b;
  for (let j = 0; j < count; j++) {
    const i = start + j, x = path.x(i), y = path.y(i), z = path.z(i);
    // Tangent from the neighbours, side = tangent x (camera - point), normalised to the half width.
    const a = Math.max(start, i - 1), c = Math.min(end - 1, i + 1);
    const tx = path.x(c) - path.x(a), ty = path.y(c) - path.y(a), tz = path.z(c) - path.z(a);
    const vx = cam.x - x, vy = cam.y - y, vz = cam.z - z;
    let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
    const len = Math.hypot(sx, sy, sz);
    if (len > 1e-9) { const k = RIBBON_HALF_W / len; sx *= k; sy *= k; sz *= k; } else { sx = RIBBON_HALF_W; sy = sz = 0; }
    const p = j * 6;
    pos[p] = x - sx; pos[p + 1] = y - sy; pos[p + 2] = z - sz; pos[p + 3] = x + sx; pos[p + 4] = y + sy; pos[p + 5] = z + sz;
    const spent = i < flown, tone = blocked >= 0 && i >= blocked ? AMBER : spent ? SPENT : INK;
    const fade = spent ? Math.max(0, 1 - (now - b.spentAt[(path.seq0 + i) % RIBBON_MAX]) / SPENT_FADE_MS) : 1;
    const near = Math.min(1, Math.max(0, (Math.hypot(vx, vy, vz) - NEAR_M) / NEAR_FADE_M));
    const q = j * 8, alpha = tone[3] * fade * near;
    col[q] = col[q + 4] = tone[0]; col[q + 1] = col[q + 5] = tone[1]; col[q + 2] = col[q + 6] = tone[2]; col[q + 3] = col[q + 7] = alpha;
  }
  // Indices for the segments short enough to draw (a long one splits the strip).
  let kept = 0;
  for (let j = 0; j + 1 < count; j++) {
    const i = start + j;
    if (Math.hypot(path.x(i + 1) - path.x(i), path.y(i + 1) - path.y(i), path.z(i + 1) - path.z(i)) > RIBBON_GAP_M) continue;
    const v = j * 2, o = kept * 6, ix = b.index;
    ix[o] = v; ix[o + 1] = v + 1; ix[o + 2] = v + 2; ix[o + 3] = v + 1; ix[o + 4] = v + 3; ix[o + 5] = v + 2; kept++;
  }
  b.points = count; b.drawCount = kept * 6;
  return b.drawCount;
}

export type GestureRibbonProps = { read?: () => RibbonPath | null };

export default function GestureRibbon({ read }: GestureRibbonProps) {
  const { mesh, geometry, material, buffer } = useMemo(() => {
    const buffer = createRibbon(), geometry = new BufferGeometry();
    const pos = new BufferAttribute(buffer.pos, 3), col = new BufferAttribute(buffer.col, 4);
    pos.setUsage(DynamicDrawUsage); col.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', pos); geometry.setAttribute('color', col);
    geometry.setIndex(new BufferAttribute(buffer.index, 1)); geometry.setDrawRange(0, 0);
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
    material.forceSinglePass = true; // a transparent DoubleSide material otherwise draws in two passes (the budget allows +1 call)
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
    return { mesh, geometry, material, buffer };
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(st => {
    const draw = writeRibbon(buffer, read ? read() : ribbonLink.path, performance.now(), st.camera.position, useGame.getState().reduced);
    mesh.visible = draw > 0;
    if (!draw) return;
    geometry.setDrawRange(0, draw);
    geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
    if (geometry.index) geometry.index.needsUpdate = true;
  }, -8);
  return <primitive object={mesh} />;
}
