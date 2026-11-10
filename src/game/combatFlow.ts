// Generous directional selection, never through walls or behind the camera. Explicit phone taps retain their chosen target.
import { droneAlive, type ShooterState, type Vec3 } from './combat';
import { BANISH, MODE, type BanishState } from './banishState';
export const flowWorld = { clear: (_a: Vec3, _b: Vec3) => true };
export const flowPaths = new Uint8Array(8).fill(1), flowVisible = new Uint8Array(8).fill(1);
export function updateFlowPaths(s: ShooterState, player: Vec3, clear: (a: Vec3, b: Vec3) => boolean, size?: { width: number; height: number }) {
  flowWorld.clear = clear;
  for (let i = 0; i < s.drones.count; i++) {
    const t = s.targets[i], a = s.aim;
    flowPaths[i] = t.alive && t.los && clear(player, t.c) ? 1 : 0;
    flowVisible[i] = 1;
    if (!size) continue;
    const x = t.c.x - a.origin.x, y = t.c.y - a.origin.y, z = t.c.z - a.origin.z;
    const depth = x * a.dir.x + y * a.dir.y + z * a.dir.z, half = Math.tan(a.fov * Math.PI / 360);
    const sx = size.width / 2 + (x * a.right.x + y * a.right.y + z * a.right.z) * size.height / (2 * depth * half);
    const sy = size.height / 2 - (x * a.up.x + y * a.up.y + z * a.up.z) * size.height / (2 * depth * half);
    flowVisible[i] = depth > 0 && sx > 28 && sx < size.width - 28 && sy > 85 && sy < size.height - 90 ? 1 : 0;
  }
}
export function flowTarget(b: BanishState, s: ShooterState, player: Vec3, allowGuard = false) {
  if (!s.aim.valid) return -1;
  const chaining = b.combo > 0 && b.clock <= b.comboUntil;
  let best = -1, score = Infinity;
  for (let i = 0; i < s.drones.count; i++) {
    const t = s.targets[i];
    if (!allowGuard && b.guardTime[i] > 0 || !flowPaths[i] || (!chaining && !flowVisible[i]) || !t.alive || !t.los || !droneAlive(s.drones, i) || b.mode[i] >= MODE.down) continue;
    const x = t.c.x - player.x, y = t.c.y - player.y, z = t.c.z - player.z;
    const d = Math.hypot(x, y, z);
    if (d > BANISH.swordReach || d < .01) continue;
    const dot = (x * s.aim.dir.x + y * s.aim.dir.y + z * s.aim.dir.z) / d;
    const opening = b.wardens.open[i] > 0 && !!flowVisible[i];
    if (!chaining && !opening && dot < .42) continue; // An earned, visible counter works even just past the angel's shoulder.
    const rank = (1 - dot) * 80 + d * .15 - (opening ? 200 : 0);
    if (rank < score) { score = rank; best = i; }
  }
  return best;
}
