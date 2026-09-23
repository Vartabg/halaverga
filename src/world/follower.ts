// Second-order follower (t3ssel8r "Giving personality to procedural animations"): y tracks the input x with natural frequency f (Hz),
// damping z and response r (r > 1 overshoots the input's motion, r < 0 anticipates it). Semi-implicit Euler with the stability-clamped
// k2, so it stays bounded at any frame rate and allows z >= 1 (unlike springStep). The input is held for the frame (it was sampled at
// the frame start) and the frame is split into substeps of at most 1/480 s, so 30, 60, 120 and 165 Hz trace the same curve; the input's
// jump (the r term) lands whole in the first substep. Plain numbers only: no allocation after create.
export type Follower = { y: number; yd: number; xp: number; k1: number; k2: number; k3: number };
const H = 1 / 480;

function tune(s: Follower, f: number, z: number, r: number) {
  const w = 2 * Math.PI * f;
  s.k1 = z / (Math.PI * f); s.k2 = 1 / (w * w); s.k3 = r * z / w;
}
export function createFollower(f: number, z: number, r: number): Follower {
  const s: Follower = { y: 0, yd: 0, xp: 0, k1: 0, k2: 0, k3: 0 };
  tune(s, f, z, r);
  return s;
}
/** Changes f, z and r; the output, its velocity and the remembered input are kept, so a retune never jumps. */
export function retuneFollower(s: Follower, f: number, z: number, r: number) { tune(s, f, z, r); }
/** Exact rest at x: output x, no velocity, and the input derivative starts from x. */
export function resetFollower(s: Follower, x: number) { s.y = x; s.yd = 0; s.xp = x; }
/** Advances by dt (clamped to [0, .05]; NaN counts as 0 and changes nothing) toward input x. Returns the output. */
export function stepFollower(s: Follower, x: number, dt: number) {
  const T = dt > 0 ? Math.min(dt, .05) : 0;
  if (T === 0 || !Number.isFinite(x)) return s.y;
  const n = Math.ceil(T / H - 1e-9), h = T / n;
  const k2s = Math.max(s.k2, h * h / 2 + h * s.k1 / 2, h * s.k1);
  let xd = (x - s.xp) / h;
  s.xp = x;
  for (let i = 0; i < n; i++) {
    s.y += h * s.yd;
    s.yd += h * (x + s.k3 * xd - s.y - s.k1 * s.yd) / k2s;
    xd = 0;
  }
  return s.y;
}
