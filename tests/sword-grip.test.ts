import { expect, it } from 'vitest';
import { SkinnedMesh, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { SWORD_BLADE, SWORD_GRIP } from '../src/world/swordGrip';

// docs/plans/2026-11-16-real-fight.md B6: the grip sits inside archangel.glb's closed fist. Around the grip, in a 6 cm slab across
// the blade line, the hand's own skin closes in every direction within a centimetre: the hilt is held, not floating by the hand.
it('holds the hilt inside archangel.glb\'s fist, with the blade leaving along the fist\'s hole', async () => {
  const scene = (await loadSuit('archangel')).scene; scene.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = []; scene.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
  const bones = meshes[0].skeleton.bones, hand = bones.findIndex(b => b.name === 'hand_r'), wrist = bones[hand].getWorldPosition(new Vector3());
  const fist: Vector3[] = [];
  for (const m of meshes) {
    const g = m.geometry, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === hand) w += sw.getComponent(i, c);
      if (w > .5) fist.push(new Vector3().fromBufferAttribute(g.getAttribute('position'), i).applyMatrix4(m.matrixWorld).sub(wrist));
    }
  }
  expect(SWORD_BLADE).toEqual({ x: 0, y: 0, z: -1 }); // the slab below is across this line
  const slab = fist.filter(p => Math.abs(p.z - SWORD_GRIP.z) < .03);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, near = slab.filter(p => {
      const d = Math.abs(Math.atan2(p.y - SWORD_GRIP.y, p.x - SWORD_GRIP.x) - a); return Math.min(d, 2 * Math.PI - d) < Math.PI / 8;
    }).map(p => Math.hypot(p.x - SWORD_GRIP.x, p.y - SWORD_GRIP.y));
    expect(Math.min(...near), `direction ${k * 45}°`).toBeLessThan(.01);
  }
});
