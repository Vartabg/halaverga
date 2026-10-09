import { S, STEER, WALLS, smooth, wallGap, type SteerIn } from './limitLatch';
import { peelPitch } from './limitPeel';
import { wedgeSteer } from './limitWedge';
export { STEER, peeling, resetLimitSteer, idleLimitSteer, type Contact, type SteerIn } from './limitLatch';
// Limit steering (limits plan S1, S6, 2026-09-28). Hands-off at a wall, the sky, the water or a hill the suit used to stay pinned
// or slide forever; the exit was an edge hold nobody was told about. Now a suit pressing into a surface turns its heading toward open
// air (yaw at walls and cliff faces, pitch at the ceiling, water and roofs, see limitPeel.ts) and stops as soon as it points clear.
// It runs near a surface, never zeroes velocity and never moves the suit itself. What counts as "into" is the COMMANDED direction
// (motion.flightTarget), not the nose: backing away with S, or skimming a wall that runs parallel, is not a problem and is left alone.
// The pilot always wins: any yaw or pitch the controls made since the last call (edge hold, arrows, cursor edge, slide-look,
// gestures) at a real rate (yieldYaw / yieldPitch, about a third of an edge hold) holds the nudge off for `hold` seconds, and while the
// blaster is aimed or fired it waits too. A slower creep (a thumb resting near the edge) does not: the nudge still turns the suit.
// A pinned pilot waits STEER.delay (0.36 s) first, so a turn started 0.4 s after contact is exactly as fast as before.
// Called every physics step by Player.tsx and the harness in tests/lim.
/** Which way yaw turns the direction `g` toward `u` (+1 / -1), 0 when it points straight at or away from it. */
const turnToward = (g: [number, number], ux: number, uz: number) => { const c = g[1] * ux - g[0] * uz; return Math.abs(c) > .05 ? Math.sign(c) : 0; };
function tie(c: SteerIn, g: [number, number], ux: number, uz: number): number {
  // Which side to take when the direction points straight into the surface: the way it already slides, the way the pilot last turned,
  // the side with more room, then the map centre.
  const dot = c.v.x * ux + c.v.z * uz, hx = c.v.x - dot * ux, hz = c.v.z - dot * uz;
  if (Math.hypot(hx, hz) > .05) { const s = turnToward(g, hx, hz); if (s) return s; }
  if (S.lastTurn) return S.lastTurn;
  if (c.free) { const a = c.free(g[1], -g[0]), b = c.free(-g[1], g[0]); if (Math.abs(a - b) > 1) return a > b ? 1 : -1; }
  const mx = -c.p.x, mz = -40 - c.p.z, d = mx * ux + mz * uz;
  return turnToward(g, mx - d * ux, mz - d * uz) || 1;
}
/** 2 rad/s, rising to 2.6 at surge: a 34 m/s turn at 1.5 (the edge hold) has a 22.7 m radius, wider than the brake zone. */
const yawRate = (c: SteerIn) => STEER.yaw + STEER.fast * smooth((c.commanded - 13) / 21);
/**
 * Wall nudge: the repulsion of every wall the suit is inside the zone of and commanded into, turned toward until the commanded
 * direction points clear. It starts only for a real problem: a commanded inward speed over minIn that reaches the wall within `ttc` s,
 * or a suit already within `hug` metres of the wall (its stop point is 1.14 m) whose commanded direction is not clearly outward.
 */
function wallYaw(c: SteerIn, g: [number, number], hs: number, zone: number): number {
  const gap = wallGap(c.p); let rx = 0, rz = 0, w = 0;
  WALLS.forEach(([ox, oz], i) => {
    const out = g[0] * ox + g[1] * oz, wt = smooth(1 - Math.max(0, gap[i] - .5) / zone);
    if (wt <= 0 || out >= STEER.outWall) return;
    if (!S.wall) {
      // Starts for a real problem: commanded into the wall and reaching it soon, or already hugging it (inside the brake zone, nose not clear).
      const closing = -out * hs;
      if (out >= STEER.startWall || (gap[i] >= STEER.hug && (closing < STEER.minIn || (gap[i] - .5) / closing > STEER.ttc))) return;
    }
    rx += ox * wt; rz += oz * wt; w = Math.max(w, wt);
  });
  const len = Math.hypot(rx, rz);
  if (len < 1e-6 || (g[0] * rx + g[1] * rz) / len >= STEER.outWall) { S.wall = false; S.wallT = 0; return 0; }
  const ux = rx / len, uz = rz / len;
  if (!S.wall) { S.wall = true; S.wallT = 0; S.wallSide = turnToward(g, ux, uz) || tie(c, g, ux, uz); }
  S.wallT += c.dt;
  return S.wallSide * yawRate(c) * w * smooth((S.wallT - STEER.delay) / STEER.ramp) * c.dt;
}
/**
 * Solid face nudge (hills, facades, roofs, overhangs): the clearance assist is holding the suit against a face it is commanded into.
 * After it has pressed for pressS (0.2 s, flicker-tolerant) it latches on the face's normal and turns the commanded direction (yaw
 * toward its horizontal part, pitch toward its vertical part) until it is outFace clear of it. A slow scrape needs no stall: a facade
 * scraped at 26 degrees kept 44% of its speed and never turned. The latch holds for at most faceMaxS seconds.
 */
function faceSteer(rt: { pitch: number }, c: SteerIn, g: [number, number], d: [number, number, number], pitchFree: boolean): number {
  const n = c.scrape.active ? c.scrape.normal : c.contact.normal, on = (c.scrape.active || c.contact.active) && c.commanded > .5;
  if (on) { const l = Math.hypot(n.x, n.y, n.z) || 1; S.fx = n.x / l; S.fy = n.y / l; S.fz = n.z / l; }
  // How clear of the face the commanded direction points. A facade (horizontal normal) only asks for yaw, so the horizontal part
  // decides: climbing at 0.8 rad leaves 70% of the heading horizontal, and the 3D dot could never reach outFace.
  const h = Math.hypot(S.fx, S.fz), away = Math.abs(S.fy) < .3 && h > .3 ? g[0] * S.fx / h + g[1] * S.fz / h : d[0] * S.fx + d[1] * S.fy + d[2] * S.fz;
  const into = on && (away < -STEER.into || (away <= 0 && c.speed < STEER.stallSpeed * c.commanded));
  // Contact flickers every other step in a slide: gaps under STEER.gap still count as pressing.
  S.fpGap = into ? 0 : S.fpGap + c.dt; S.fp = S.fpGap > STEER.gap ? 0 : S.fp + c.dt;
  S.faceGap = on ? 0 : S.faceGap + c.dt;
  if (S.face) { S.faceT += c.dt; if (S.faceT > STEER.faceMaxS || S.faceGap > STEER.faceLostS || away >= STEER.outFace) S.face = false; }
  if (!S.face) {
    if (S.fp < STEER.pressS || away > 0) return 0;
    S.face = true; S.faceT = 0; S.faceSide = 0;
  }
  if (pitchFree && Math.abs(S.fy) > .3) {
    const target = Math.max(-1.25, Math.min(1.25, Math.asin(S.fy))), step = STEER.pitch * c.dt;
    rt.pitch += Math.sign(target - rt.pitch) * Math.min(step, Math.abs(target - rt.pitch));
  }
  if (h < .3) return 0;
  if (!S.faceSide) S.faceSide = turnToward(g, S.fx / h, S.fz / h) || tie(c, g, S.fx / h, S.fz / h);
  // The taller Blender envelopes need a slightly tighter surge escape, without changing perimeter turns or player look.
  const faceRate = yawRate(c) + .05 * smooth((c.commanded - 13) / 21);
  return S.faceSide * Math.max(STEER.face, faceRate) * c.dt;
}
export function limitSteer(rt: { yaw: number; pitch: number }, c: SteerIn): void {
  const dt = c.dt, dy = Number.isFinite(S.yaw) ? rt.yaw - S.yaw : 0, dp = Number.isFinite(S.pitch) ? rt.pitch - S.pitch : 0;
  // Whatever moved the view since our last write is the pilot's (or a scheme's): a real rate holds the nudge off for a moment.
  if (Math.abs(dy) > 1e-4) S.lastTurn = Math.sign(dy);
  S.holdYaw = Math.abs(dy) > STEER.yieldYaw * dt ? STEER.hold : Math.max(0, S.holdYaw - dt);
  S.holdPitch = Math.abs(dp) > STEER.yieldPitch * dt ? STEER.hold : Math.max(0, S.holdPitch - dt);
  S.live = true;
  const t = c.target, hs = Math.hypot(t.x, t.z), len = Math.hypot(t.x, t.y, t.z), asked = c.commanded >= .05 && len > .05;
  const g: [number, number] | null = asked && hs > .5 ? [t.x / hs, t.z / hs] : null;
  const pitchFree = c.pitchFlies && asked && S.holdPitch <= 0 && !c.aiming;
  if (!g || S.holdYaw > 0 || c.aiming) { S.wall = S.face = S.wedge = false; S.wallT = S.fp = S.stuckT = 0; S.fpGap = S.stuckGap = 9; }
  else if (wedgeSteer(rt, c, pitchFree)) { S.wall = S.face = false; S.wallT = S.fp = 0; S.fpGap = 9; S.peel = 0; S.leaveT = 0; S.touchT = 0; S.touchGap = 9; }
  else {
    const a = wallYaw(c, g, hs, Math.max(STEER.zone, STEER.zoneSpeed * Math.max(c.commanded, Math.hypot(c.v.x, c.v.y, c.v.z))));
    const b = faceSteer(rt, c, g, [t.x / len, t.y / len, t.z / len], pitchFree);
    rt.yaw += Math.abs(a) >= Math.abs(b) ? a : b;
  }
  if (S.wedge) { S.yaw = rt.yaw; S.pitch = rt.pitch; return; }
  if (pitchFree) peelPitch(rt, c, Math.asin(Math.max(-1, Math.min(1, t.y / len)))); else { S.peel = 0; S.touchT = 0; S.touchGap = 9; S.settle = false; }
  S.yaw = rt.yaw; S.pitch = rt.pitch;
}
