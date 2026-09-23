import { describe, expect, it } from 'vitest';
import { HAND_AXIS, LIMB_AXIS, MUZZLE_OFS } from '../src/world/aimPose';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { loadSuit } from './load-suit';
import { meshAxes } from './aim-metrics';
const DEG = Math.PI / 180;
/** The aim layer's hand constants are measurements of public/models/suit.glb; a changed asset must fail here, not look wrong. */
describe('suit aim asset constants', () => {
  it('match the GLB hand and lower arm, measured in the bind frame', async () => {
    const suit = buildSkinnedSuit((await loadSuit()).scene), axes = meshAxes(suit.root, suit.joints);
    suit.joints.forEach(j => expect(j.quaternion.angleTo(j.quaternion.clone().identity())).toBe(0));
    expect(axes.knuckle.angleTo(HAND_AXIS) / DEG).toBeLessThan(1);
    expect(axes.limb.angleTo(LIMB_AXIS) / DEG).toBeLessThan(1);
    // The muzzle sits .18 m along the knuckle axis, inside the hand (its distal centroid is about .25 m out).
    expect(MUZZLE_OFS.length()).toBeCloseTo(.18, 12); expect(MUZZLE_OFS.angleTo(HAND_AXIS)).toBeLessThan(1e-7);
    // The bone heads sit on the back of the wrist, so the fingers run well ahead of the forearm bone: why the solver aims the knuckles.
    expect(HAND_AXIS.angleTo(suit.joints[16].position.clone().normalize()) / DEG).toBeGreaterThan(30);
  });
});
