import { describe, expect, it } from 'vitest';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { landing, play, snapshot, turned } from './flight-sim';
const DEG = Math.PI / 180;
/** Landings Player.tsx flies: short, down and forward, and long and to the side. */
const LANDINGS = [[{ x: 0, y: 22.5, z: 0 }, { x: 0, y: 21.06, z: -1 }], [{ x: 0, y: 25, z: 0 }, { x: 0, y: 21.06, z: -8 }],
  [{ x: 0, y: 30, z: 0 }, { x: 5, y: 21.06, z: -20 }]] as const;
describe('flight clip motion continuity', () => {
  it('carries the landing flare and look-down through touchdown: no joint jumps more than clips-off plus 3 degrees (3.5 at the shins)', () => {
    // The shins carry the living layer's absorb onset (about 8.8 degrees in both rigs); clips-off partly cancels it with its
    // fading hover drift, which the authored tread replaces, so they get half a degree more.
    const margin = BONE_NAMES.map(n => (n.startsWith('shin') ? 3.5 : 3) * DEG);
    for (const [from, goal] of LANDINGS) for (const reduced of [false, true]) {
      let before: ReturnType<typeof snapshot> | null = null, legacyBefore: ReturnType<typeof snapshot> | null = null, excess = -9, at = "";
      play(9, 60, landing(from, goal), s => {
        const now = snapshot(s.clips), legacy = snapshot(s.legacy);
        if (before && legacyBefore && !s.life.flying && s.life.switched < 1e-9 + 1 / 60) {
          const clips = turned(before, now), off = turned(legacyBefore, legacy);
          clips.forEach((d, b) => { if (d - off[b] - margin[b] > excess) { excess = d - off[b] - margin[b]; at = `${BONE_NAMES[b]} ${(d / DEG).toFixed(2)} vs ${(off[b] / DEG).toFixed(2)} deg`; } });
        }
        before = now; legacyBefore = legacy;
      }, { reduced });
      expect(excess, `${JSON.stringify(goal)} reduced ${reduced}: ${at}`).toBeGreaterThan(-9);
      expect(excess, `${JSON.stringify(goal)} reduced ${reduced}: ${at}`).toBeLessThanOrEqual(0);
    }
  });
});
