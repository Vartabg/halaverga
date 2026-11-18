import { ARCH, archSection, type ArchSection } from '@/world/archData';
import { heightAt } from '@/world/massifData';
import type { Vec } from '@/game/motion';
import type { Crossing } from './flight';

const section: ArchSection = { cy: 0, cz: 0, ry: 0, rz: 0, slope: 0 };
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => { const u = clamp01(n); return u * u * (3 - 2 * u); };
export const WALK_END = 23;

/** Both people and the outcome camera follow the same walk on the crown of the stone. */
export function travelerAt(flight: Crossing, index: number, out: Vec) {
  const safe = flight.phase === 'safe', late = flight.phase === 'late';
  const t = safe || late ? Math.max(0, flight.after - (safe ? .65 : .4) - index * .2) : 0;
  const start = index ? 20.15 : 17.52, end = safe ? -37 + index * 1.65 : 37 + index * 1.9;
  const distance = Math.min(Math.abs(end - start), (safe ? 2.85 : 3.4) * (t - .3 * (1 - Math.exp(-t / .3))));
  const x = start + (safe ? -distance : distance);
  const s = archSection(clamp01((x - ARCH.x0) / (ARCH.x1 - ARCH.x0)), section);
  const side = (index ? 1.12 : .58) + (late ? .58 * distance * ease(distance / 3.8) : 0);
  const z = s.cz + side, land = heightAt(x, z);
  const crown = side < s.rz ? s.cy + s.ry * Math.sqrt(1 - (side / s.rz) ** 2) : land;
  const beyond = Math.max(0, ARCH.x0 - x, x - ARCH.x1);
  out.x = x; out.y = Math.max(land, crown + (land - crown) * ease(beyond / 3)); out.z = z;
  return distance;
}
