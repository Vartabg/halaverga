/** Visual flight choreography. The flight controller owns lift/trajectory; wings express the current effort. */
export type WingInput = { flying: boolean; paused: boolean; reduced: boolean; speed: number; vy: number; brake: number; roll: number };
export const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export function createWingMotion() {
  return { phase: 0, unfold: 0, glide: 0, climb: 0, brake: 0, launch: 0, flying: false, flutter: 0, flutterGain: 0,
    stroke: 0, recovery: 0, amplitude: 0, roll: 0, mode: 'folded' as 'folded' | 'launch' | 'hover' | 'powered' | 'glide' | 'brake' };
}
export type WingMotion = ReturnType<typeof createWingMotion>;
const settle = (v: number, to: number, rate: number, dt: number) => to + (v - to) * Math.exp(-rate * dt);
export function advanceWingMotion(w: WingMotion, f: WingInput, dt: number) {
  if (f.paused) return;
  const h = Math.max(0, Math.min(.1, dt)), climb = smooth(.8, 6, f.vy), brake = Math.max(0, Math.min(1, f.brake));
  if (f.flying && !w.flying) { w.phase = 0; w.launch = 1.15; }
  w.flying = f.flying;
  const launchBefore = w.launch; w.launch = f.flying ? Math.max(0, w.launch - h) : 0;
  w.unfold = settle(w.unfold, f.flying ? 1 : 0, f.flying ? 10 : 5, h);
  w.climb = settle(w.climb, climb, 5, h); w.brake = settle(w.brake, brake, 7, h);
  const gliding = smooth(9, 18, f.speed) * (1 - climb) * (1 - brake);
  w.glide = settle(w.glide, f.flying ? gliding : 0, 4, h); w.roll = settle(w.roll, f.roll, 7, h);
  if (f.flying && !f.reduced) w.phase = (w.phase + h * (1.45 + climb * .65 + (launchBefore + w.launch) * .14)) % 1;
  const downEnd = .46, p = w.phase;
  w.stroke = f.reduced ? 0 : p < downEnd ? 1 - 2 * smooth(0, downEnd, p) : -1 + 2 * smooth(downEnd, 1, p);
  w.recovery = f.reduced || p < downEnd ? 0 : Math.sin((p - downEnd) / (1 - downEnd) * Math.PI);
  w.amplitude = f.reduced ? 0 : (1 - w.glide) * (.64 + .20 * w.climb + .13 * Math.min(1, w.launch));
  // Fast gliding air ripples the trailing feathers (a fine, fast flutter); none at rest or with reduced motion.
  if (f.flying && !f.reduced) w.flutter = (w.flutter + h) % 1000;
  w.flutterGain = f.reduced ? 0 : w.glide * smooth(12, 30, f.speed);
  w.mode = !f.flying ? 'folded' : brake > .25 ? 'brake' : w.launch > .1 ? 'launch' : gliding > .8 ? 'glide' : f.speed < 5 ? 'hover' : 'powered';
}
