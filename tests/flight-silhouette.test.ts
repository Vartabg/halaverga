import { describe, expect, it } from 'vitest';
import { cruising, flightPose, frame, rig, settledMix } from './flight-harness';
import { clearance, STATES, silhouette } from './flight-silhouette';
/** Floors in metres at the explorer's depth, from the chase camera, clips on against clips off, per state. */
const FLOOR = { hands: .15, feet: .15 } as const;
/**
 * Interpenetration floors (m), from the rig's proportions: the torso core is about .12 m in radius, a thigh about .08 m and a knee
 * about .055 m, so a hand tip or wrist nearer than these is inside the body. Clips off measures .29, .20, .57 and .24.
 */
const CLEAR = { torso: .15, thigh: .1, head: .3, knees: .11 } as const;
const results = STATES.map(s => silhouette(s));
/** The worst clearance over a static grid of speed, bank, style, brake, slope, loop phase and the landing flare. */
function worstClearance(clips: boolean) {
  const worst: Record<keyof typeof CLEAR, number> = { torso: 9, thigh: 9, head: 9, knees: 9 };
  for (const speed of [0, 8, 13, 20, 34]) for (const bank of [-1, 0, 1]) for (const hero of [0, 1]) for (const brake of [0, .6, 1])
    for (const slope of [-1, 0, 1]) for (const clock of [0, 1.1, 2.3, 3.4]) {
      if (brake > .6 && speed < 8) continue;
      const pitch = slope * .9, p = flightPose({ speed, pitch, viewPitch: pitch, brake }), r = rig();
      const mix = settledMix(p, { x: 0, y: Math.sin(pitch) * speed, z: -Math.cos(pitch) * speed });
      Object.assign(mix, { clock, slope: speed > 2 ? Math.sin(pitch) : 0, fist: speed >= 15 ? 1 : 0, steer: bank, flare: speed === 0 && slope === 0 ? 1 : 0 });
      mix.bank.fill(bank); frame(r, p, mix, cruising(clock * 1.19), hero, false, clips);
      const c = clearance(r);
      for (const k of Object.keys(worst) as (keyof typeof CLEAR)[]) worst[k] = Math.min(worst[k], c[k]);
    }
  return worst;
}
if (process.env.SILHOUETTE_REPORT) {
  console.log(results.map(r => `${r.name.padEnd(18)} hands ${r.hands.toFixed(3)} feet ${r.feet.toFixed(3)} [${r.tips.map(v => v.toFixed(3)).join(' ')}] ${r.px.toFixed(0)} px/m`).join('\n'));
  console.log('clearance on', JSON.stringify(worstClearance(true)), 'off', JSON.stringify(worstClearance(false)));
}
describe('flight clip silhouette from the chase camera', () => {
  for (const r of results) it(`${r.name}: hands and feet each move at least 15 cm on screen`, () => {
    expect(r.hands, 'hands').toBeGreaterThanOrEqual(FLOOR.hands); expect(r.feet, 'feet').toBeGreaterThanOrEqual(FLOOR.feet);
  });
  it('keeps the larger poses out of the body: hands clear of the torso, thighs and head, knees apart', () => {
    const worst = worstClearance(true);
    for (const k of Object.keys(CLEAR) as (keyof typeof CLEAR)[]) expect(worst[k], k).toBeGreaterThanOrEqual(CLEAR[k]);
  });
});
