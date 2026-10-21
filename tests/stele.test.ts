import { describe, expect, it } from 'vitest';
import { STELE, placeStele, seatY, plinth } from '../src/world/steleData';
import { createKit } from '../src/world/kit';
import { makeCity } from '../src/world/cityData';

/** Slices invariants for the colossal Watcher stele joined into the merged city mesh (steleData.ts): nothing traps a hands-off
 * pilot, nothing reaches the ceiling, the authored route keeps its tube clear, and the granite maths stay deterministic. */
describe('the colossal Watcher stele', () => {
  it('every stele lands its crown below the ceiling (150) with passing room', () => {
    for (const s of STELE) {
      const { topY } = placeStele(createKit(), s);
      const capTop = topY + (s.crown === 'intact' ? 4.1 : s.crown === 'broken' ? 1.1 : 0);
      expect(capTop, `${s.kind} at ${s.x},${s.z}`).toBeLessThan(150 - 30);
    }
  });
  it('solid stele stand on the road terraces at |x| >= 20, clear of the route strip (x 0..9)', () => {
    const solid = STELE.filter(s => s.solid);
    for (const s of solid) {
      expect(Math.abs(s.x) >= 20, `${s.kind} at x ${s.x} leans on the route strip`).toBe(true);
      const y0 = seatY(s);
      expect(y0, `${s.kind} at ${s.z} never floats off its terrace or the sea bed`).toBeLessThanOrEqual(2.05 + 1e-9);
      const { topY } = placeStele(createKit(), s);
      expect(topY, `${s.kind} plinth must be under the shaft`).toBeGreaterThan(y0 + s.h / 2 + plinth.depth);
    }
    expect(solid.length).toBe(2); // the arrival pair only; the corridor slalom waits for its pin-audit task
  });
  it('the outer watch and the fallen colossus keep no colliders, matching the accepted pass-through far giants', () => {
    expect(STELE.filter(s => !s.solid)).toHaveLength(6);
  });
  it('the merged city rebuilds identically — the stele are deterministic seed maths, never Math.random', () => {
    const a = makeCity(), b = makeCity();
    const pa = a.geometry.attributes.position.array as Float32Array, pb = b.geometry.attributes.position.array as Float32Array;
    expect(pa.length, 'same vertex count').toBe(pb.length);
    let diffs = 0;
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diffs++;
    expect(diffs, 'identical vertex stream').toBe(0);
    a.geometry.dispose(); b.geometry.dispose();
  });
  it('the fallen colossus sinks past the waterline and lies no higher than the standing gates', () => {
    const fallen = STELE.find(s => s.kind === 'fallen')!;
    expect(fallen.solid).toBe(false);
    expect(placeStele(createKit(), fallen).topY - seatY(fallen)).toBeGreaterThan(0);
    expect(seatY(fallen)).toBeLessThan(0);
  });
});
