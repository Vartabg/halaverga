import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quaternion, SkinnedMesh, Vector3, type Object3D } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { bindAngelClips, blendAngelClip, clipTime, FULL } from '../src/world/angelClips';
import { SWORD_GRIP, swordGripRotation } from '../src/world/swordGrip';
import { BLADE as SWORD_LENGTH, GUARD } from '../src/world/swordBlade';
import { BLADE, BODY, axisGap, bladeReaches, contactAt } from '../src/game/bladeReach';
import { STRIKE, cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { PHASE, createShooter } from '../src/game/combat';
import { COMMAND, requestCommand } from '../src/game/commands';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { MODE, createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { resetBattle } from '../src/game/celestialBattle';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { CUT_CLIPS } from '../src/world/cutClips';

// Plan 2026-11-16-real-fight A1: the blow lands where the blade meets the body. The constants are measured from the shipped GLBs
// in the game rig; these tests re-measure them so a new body or blade cannot leave them stale.
function restVertices(root: Object3D, each: (v: Vector3) => void) {
  root.updateMatrixWorld(true); const v = new Vector3();
  root.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let k = 0; k < pos.count; k++) { o.getVertexPosition(k, v); v.applyMatrix4(o.matrixWorld); each(v); }
  });
}
let demon: Awaited<ReturnType<typeof loadSuit>>, angel: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { demon = await loadSuit('watcher'); angel = await loadSuit('archangel'); });
beforeEach(() => { cancelStrike(); flowPaths.fill(1); flowVisible.fill(1); });

describe('blade contact: measured bodies and blade', () => {
  it('sizes each Watcher capsule from the model\'s rest bounds in the game rig (both kinds share the model)', () => {
    const rig = buildSuitRig(demon.scene); let radius = 0, low = Infinity, high = -Infinity;
    restVertices(rig.root, v => { radius = Math.max(radius, Math.hypot(v.x, v.z)); low = Math.min(low, v.y); high = Math.max(high, v.y); });
    rig.dispose();
    // radius: the widest point from the vertical axis; half: half the rest height, less the radius (the caps add it back).
    // y: the middle of the rest body from the combat centre (the pelvis), where the capsule is centred.
    for (const body of [BODY.lesser, BODY.warden]) {
      expect(body.radius).toBeCloseTo(radius, 1.7); expect(body.half).toBeCloseTo((high - low) / 2 - radius, 1.7);
      expect(body.y).toBeCloseTo((high + low) / 2, 1.7);
    }
  });
  it('measures the reach from the angel\'s chest to the sword tip at each cut\'s impact, and keeps the least of the three', () => {
    const rig = buildSuitRig(angel.scene), clips = bindAngelClips(angel.animations);
    rig.root.updateMatrixWorld(true);
    expect(rig.joints[11].getWorldPosition(new Vector3()).y).toBeCloseTo(BLADE.chest, 1.7); // the chest bone over the centre
    const reach = CUT_CLIPS.map(c => {
      for (const j of rig.joints) j.quaternion.identity();
      blendAngelClip(rig.joints, clips[c.clip], clipTime(clips[c.clip], c.impact, false), 1, FULL); rig.root.updateMatrixWorld(true);
      const tip = new Vector3(0, -GUARD - SWORD_LENGTH, 0).applyQuaternion(swordGripRotation(new Quaternion()))
        .add(new Vector3(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z)).applyMatrix4(rig.joints[16].matrixWorld);
      return tip.distanceTo(rig.joints[11].getWorldPosition(new Vector3()));
    });
    expect(reach).toHaveLength(3); expect(Math.min(...reach)).toBeCloseTo(BLADE.reach, 1.7); // the rising cut, 1.37 m (2026-11-17)
    rig.dispose();
  });
  it('replaces every use of the old flat contact distance with contactAt', () => {
    expect('contact' in STRIKE).toBe(false);
    for (const file of ['src/game/strike.ts', 'src/game/banish.ts']) expect(readFileSync(file, 'utf8')).not.toMatch(/STRIKE\.contact/);
    const strikeText = readFileSync('src/game/strike.ts', 'utf8');
    expect(strikeText).toContain('(distance - contactAt(target) * .8) / time'); // the step-in's distance
    expect(strikeText).toContain('d < contactAt(strike.target) ? 1.5 : strike.speed'); // the step-in's pace
    expect(readFileSync('src/game/banish.ts', 'utf8')).toContain('bladeReaches(i, c, player, dive.serial) && dive.t >= dive.minTime');
    expect(contactAt(0)).toBeCloseTo(BLADE.reach + BODY.lesser.radius, 9); expect(contactAt(5)).toBeCloseTo(BLADE.reach + BODY.warden.radius, 9);
    expect(contactAt(0)).toBeLessThan(2.2); // the old 3.4 m landed with the blade well short of the body
  });
});

describe('blade contact: the swept test', () => {
  const c = { x: 4, y: 30, z: -7 };
  for (const [kind, i] of [['lesser', 0], ['warden', 5]] as const) {
    it(`lands on the ${kind} capsule at the reach and not beyond it, from the side and over the top`, () => {
      const body = BODY[kind], at = (x: number, y: number, z: number, serial: number) => bladeReaches(i, c, { x: c.x + x, y: c.y + body.y + y - BLADE.chest, z: c.z + z }, serial);
      expect(at(0, 0, contactAt(i) - .02, 1)).toBe(true); expect(at(0, 0, contactAt(i) + .02, 2)).toBe(false);
      expect(at(contactAt(i) - .02, body.half, 0, 3)).toBe(true); // level with the top of the axis
      expect(at(0, body.half + contactAt(i) - .02, 0, 4)).toBe(true); expect(at(0, body.half + contactAt(i) + .02, 0, 5)).toBe(false);
      expect(at(0, -body.half - contactAt(i) + .02, 0, 6)).toBe(true); expect(at(0, -body.half - contactAt(i) - .02, 0, 7)).toBe(false);
    });
  }
  it('catches a 130 m/s dive that passes through the body between two .05 s steps (6.5 m apart), and only then', () => {
    const step = STRIKE.maxSpeed * .05, chest = (z: number, x = 0) => ({ x: c.x + x, y: c.y - BLADE.chest, z: c.z + z });
    // Neither step's chest is within reach of the axis: before and after the body.
    expect(step).toBeCloseTo(6.5, 6); expect(step / 2).toBeGreaterThan(contactAt(0));
    expect(bladeReaches(0, c, chest(step / 2), 11)).toBe(false); expect(bladeReaches(0, c, chest(step / 2 + step), 12)).toBe(false);
    // The same two points as one strike's consecutive steps: the path crosses the body.
    expect(bladeReaches(0, c, chest(step / 2), 13)).toBe(false); expect(bladeReaches(0, c, chest(-step / 2), 13)).toBe(true);
    // A pass to the side, outside the reach, is not a hit however fast.
    expect(bladeReaches(0, c, chest(step / 2, contactAt(0) + .1), 14)).toBe(false); expect(bladeReaches(0, c, chest(-step / 2, contactAt(0) + .1), 14)).toBe(false);
  });
  it('sweeps relative to the demon, which may be thrown along the same line as the angel', () => {
    const moving = { ...c }, from = { x: c.x, y: c.y - BLADE.chest, z: c.z + 6 };
    expect(bladeReaches(0, moving, from, 21)).toBe(false);
    moving.z -= 10; const to = { ...from, z: from.z - 18 }; // both moved; the angel overtook the demon, ending 2 m past it
    expect(bladeReaches(0, moving, to, 21)).toBe(true);
    // Side by side at the same pace, 3 m apart: never within reach, though each covered 10 m past where the other began.
    const beside = { ...c }, wide = { x: c.x + 3, y: c.y - BLADE.chest, z: c.z };
    expect(bladeReaches(0, beside, wide, 22)).toBe(false); beside.z -= 10; wide.z -= 10;
    expect(bladeReaches(0, beside, wide, 22)).toBe(false);
  });
  it('measures the gap between a segment and the vertical axis exactly', () => {
    expect(axisGap(3, 0, 0, 3, 0, 0, 1)).toBeCloseTo(3, 9); expect(axisGap(0, 5, 0, 0, 5, 0, 1)).toBeCloseTo(4, 9);
    expect(axisGap(-2, .5, 1, 2, .5, 1, 1)).toBeCloseTo(1, 9); expect(axisGap(3, 4, 0, 3, -4, 0, 1)).toBeCloseTo(3, 9);
    expect(axisGap(1, 3, 0, 1, 3, 0, 0)).toBeCloseTo(Math.hypot(1, 3), 9);
  });
});

describe('blade contact in a live string', () => {
  it('lands all three cuts with the angel flown by the strike itself, while the demon is thrown between them', () => {
    const s = createShooter(); createDroneSim(s); buildTargets(s); for (const t of s.targets) t.los = true;
    const b = createBanish(); resetBanish(b, s); resetBattle(0);
    const p = { x: s.drones.pos[0].x, y: s.drones.pos[0].y, z: s.drones.pos[0].z + 14 }, v = { x: 0, y: 0, z: 0 }, dt = 1 / 60;
    s.aim.valid = true; s.aim.origin = { ...p }; s.aim.dir = { x: 0, y: 0, z: -1 };
    let presses = 0, closest = Infinity;
    for (let n = 0; n < 6 * 60 && b.mode[0] !== MODE.cast; n++) {
      const idle = strike.phase === 0 || strike.phase === 2 && strike.freeze <= 0 && strike.t > .15;
      if (idle && !strike.queued && presses < 6) { requestCommand(s, COMMAND.sword, 0); presses++; }
      stepBanish(b, s, p, dt); buildTargets(s); for (const t of s.targets) t.los = true;
      if (!strikeVelocity(v, p, dt, false)) v.x = v.y = v.z = 0;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if (strike.phase === 1) { // in 3D: the chest to the body's capsule axis, the gap the contact test measures
        const q = s.targets[0].c, x = p.x - q.x, y = p.y + BLADE.chest - q.y - BODY.lesser.y, z = p.z - q.z;
        closest = Math.min(closest, axisGap(x, y, z, x, y, z, BODY.lesser.half));
      }
    }
    expect(b.mode[0]).toBe(MODE.cast); expect(presses).toBe(3); // three presses, three cuts: none fell short
    expect(closest).toBeLessThan(contactAt(0)); // the angel was within the blade's reach, not 3.4 m off
    expect(s.drones.phase[0]).not.toBe(PHASE.dead);
  });
});
