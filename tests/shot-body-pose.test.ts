import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Matrix4, PerspectiveCamera, Quaternion, SkinnedMesh, Vector3, type Object3D } from 'three';
import { createShooter } from '../src/game/combat';
import { advanceWeapon } from '../src/game/weapon';
import { AIM_BASE } from '../src/world/aimPose';
import { BARREL_AXIS, MUZZLE } from '../src/world/cannonContract';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { advanceShotBody, createShotBody, type ShotBody } from '../src/world/shotBody';
import { BONE, BRACE, POSE, PRE_JOINTS, VENT_ROLL, applyShotBodyPost, applyShotBodyPre } from '../src/world/shotBodyPose';
import { CH } from '../src/world/shotSprings';
import { BONE_COUNT, LIMITS } from '../src/world/suitSkeleton';
import { loadSuit } from './load-suit';

const DEG = Math.PI / 180, B = BONE, W = 390, H = 844;
let root: Object3D, joints: Object3D[], mesh: SkinnedMesh;
beforeAll(async () => {
  const r = buildSkinnedSuit((await loadSuit()).scene); root = r.root; joints = r.joints;
  root.traverse(o => { if (o instanceof SkinnedMesh) mesh = o; });
});
const v3 = () => new Vector3(), q4 = () => new Quaternion();
const world = (b: number, local = v3()) => { root.updateMatrixWorld(true); return joints[b].localToWorld(local.clone()); };
const muzzle = () => world(B.forearm_r, new Vector3(MUZZLE.x, MUZZLE.y, MUZZLE.z));
const barrel = () => new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z).applyQuaternion(joints[B.forearm_r].getWorldQuaternion(q4()));
function rest() { joints.forEach(j => j.quaternion.identity()); root.position.set(0, 0, 0); root.updateMatrixWorld(true); }
/** Chase camera at 390x844: head point (pelvis + .65) plus the boom, pitched -.12. */
function chase() {
  rest(); const cam = new PerspectiveCamera(65, W / H, .1, 200), qv = q4().setFromEuler(new Euler(-.12, 0, 0, 'YXZ'));
  cam.position.copy(world(B.pelvis).add(new Vector3(0, .65, 0)).add(new Vector3(.85, .7, 5.3).applyQuaternion(qv)));
  cam.quaternion.copy(qv); cam.updateMatrixWorld(true);
  return { cam, target: cam.position.clone().addScaledVector(new Vector3(0, 0, -1).applyQuaternion(qv), 30) };
}
/** AIM_BASE on the right arm, then the barrel-exact shoulder swing onto `target` (what the aim solve does at weight 1). */
function aim(target: Vector3) {
  rest();
  for (const [name, b] of [['clavicle_r', B.clavicle_r], ['upperarm_r', B.upperarm_r], ['forearm_r', B.forearm_r], ['hand_r', B.hand_r]] as const)
    joints[b].rotation.set(...(AIM_BASE[name] as unknown as [number, number, number]));
  for (let i = 0; i < 4; i++) {
    const arc = q4().setFromUnitVectors(barrel(), target.clone().sub(muzzle()).normalize()), pq = joints[B.clavicle_r].getWorldQuaternion(q4());
    joints[B.upperarm_r].quaternion.premultiply(pq.clone().invert().multiply(arc).multiply(pq)); root.updateMatrixWorld(true);
  }
}
const quats = () => joints.map(j => j.quaternion.toArray());
const body = (): ShotBody => { const b = createShotBody(); b.vary = 0; return b; };
const px = (cam: PerspectiveCamera, p: Vector3) => { const s = p.clone().project(cam); return [s.x * W / 2, -s.y * H / 2]; };
const elevation = (d: Vector3) => Math.asin(d.y / d.length());

describe('shot body pose', () => {
  it('leaves every joint quaternion bit-identical when idle', () => {
    rest(); joints.forEach((j, i) => j.rotation.set(.01 * i, -.005 * i, .003 * i));
    const before = quats(), b = body(), s = createShooter(), env = { dt: 1 / 60, paused: false, reduced: false, epoch: 1, aimWeight: 0, ads: 0, ground: 1, pxPerM: 0 };
    for (let i = 0; i < 30; i++) { advanceShotBody(b, s, env); applyShotBodyPre(joints, b); applyShotBodyPost(joints, b); }
    quats().forEach((q, i) => q.forEach((c, k) => expect(Object.is(c, before[i][k])).toBe(true)));
    expect(b.offset.y).toBe(0);
  });
  it('matches every local Euler sign convention in world space', () => {
    const cases: [string, number, [number, number, number], () => number][] = [
      ['chest +x leans back', B.chest, [.2, 0, 0], () => world(B.head).z], ['chest +z raises the right shoulder', B.chest, [0, 0, .2], () => world(B.upperarm_r).y],
      ['chest -y takes the right shoulder back', B.chest, [0, -.2, 0], () => world(B.upperarm_r).z], ['spine +x leans back', B.spine, [.2, 0, 0], () => world(B.head).z],
      ['forearm +x flexes the elbow', B.forearm_r, [.3, 0, 0], () => -world(B.hand_r).z], ['thigh +x flexes the hip', B.thigh_r, [.3, 0, 0], () => -world(B.shin_r).z],
      ['shin -x flexes the knee', B.shin_r, [-.3, 0, 0], () => world(B.foot_r).z], ['foot +x lifts the toes', B.foot_r, [.3, 0, 0], () => world(20).y],
      ['clavicle_r +z lifts', B.clavicle_r, [0, 0, .2], () => world(B.upperarm_r).y], ['clavicle_r -y retracts', B.clavicle_r, [0, -.2, 0], () => world(B.upperarm_r).z],
      ['upperarm_l -z abducts outward', B.upperarm_l, [0, 0, -.3], () => -world(B.forearm_l).x], ['head -x nods the chin down', B.head, [-.3, 0, 0], () => -world(B.head, new Vector3(0, 0, -.2)).y],
      ['head -y turns right', B.head, [0, -.3, 0], () => world(B.head, new Vector3(0, 0, -.2)).x], ['neck -y turns right', B.neck, [0, -.3, 0], () => world(B.head, new Vector3(0, 0, -.2)).x],
      ['pelvis +x swings the feet forward', B.pelvis, [.1, 0, 0], () => -world(B.foot_r).z], ['pelvis +x swings the feet up', B.pelvis, [.3, 0, 0], () => world(B.foot_r).y],
    ];
    for (const [name, b, e, measure] of cases) {
      rest(); const before = measure(); joints[b].rotation.set(...e); root.updateMatrixWorld(true);
      expect(measure() - before, name).toBeGreaterThan(.005);
    }
    // Vent roll: in the vent pose (elbow +30 deg) the roll turns the cannon top (forearm bind -Z) toward the camera (world +Z and up).
    const { target } = chase(), toward = new Vector3(0, 1, 1).normalize(), top = () => new Vector3(0, 0, -1).applyQuaternion(joints[B.forearm_r].getWorldQuaternion(q4()));
    aim(target); joints[B.forearm_r].rotation.x += 30 * DEG; root.updateMatrixWorld(true); const unrolled = top().dot(toward);
    joints[B.upperarm_r].quaternion.multiply(q4().setFromAxisAngle(new Vector3(0, 1, 0), VENT_ROLL)); root.updateMatrixWorld(true);
    expect(top().dot(toward)).toBeGreaterThan(unrolled);
  });
  it('writes only spine, chest, pelvis and legs before the solve (source and runtime)', () => {
    const src = readFileSync(new URL('../src/world/shotBodyPose.ts', import.meta.url), 'utf8');
    const pre = src.slice(src.indexOf('export function applyShotBodyPre'), src.indexOf('export const shotOut'));
    for (const m of pre.matchAll(/B\.(\w+)/g)) expect(PRE_JOINTS, m[1]).toContain(B[m[1] as keyof typeof B]);
    rest(); const b = body(); b.B = 1; b.gw = 1; b.breath = 1; const before = quats();
    applyShotBodyPre(joints, b);
    const after = quats();
    for (let i = 0; i < BONE_COUNT; i++) if (!PRE_JOINTS.includes(i)) expect(after[i]).toEqual(before[i]);
    expect(after[B.chest]).not.toEqual(before[B.chest]);
  });
  it('lands the commanded clavicle lift and head yaw exactly after the aim pose', () => {
    const { target } = chase(); aim(target);
    const clav = joints[B.clavicle_r].rotation.z, head = joints[B.head].rotation.y, b = body();
    b.springs.x[CH.clav] = .7; b.killYaw = -3 * DEG; b.killK = .5;
    applyShotBodyPost(joints, b);
    expect(joints[B.clavicle_r].rotation.z - clav).toBeCloseTo(POSE.clavLift * DEG * .7, 6);
    expect(joints[B.head].rotation.y - head).toBeCloseTo(-3 * DEG * .5, 6);
  });
  it('moves each channel landmark at least 1.5 px at chase portrait (the body chain at least 4 px)', () => {
    const { cam, target } = chase(), report: string[] = [];
    const marks: [string, number, number, () => Vector3][] = [
      ['elbow', CH.elbow, 1, muzzle], ['shoulder', CH.shoulder, 1, muzzle], ['clav', CH.clav, 1, muzzle],
      ['torso/head top', CH.torso, 1, () => world(B.head, new Vector3(0, .2, 0))], ['torso/shoulder', CH.torso, 1, () => world(B.upperarm_r)],
      ['offArm', CH.offArm, 1, () => world(B.hand_l)], ['hoverPitch', CH.hoverPitch, 0, () => world(B.foot_r)], ['legTrail', CH.legTrail, 0, () => world(B.foot_r)],
    ];
    for (const [name, c, gw, mark] of marks) {
      aim(target); const a = px(cam, mark()), b = body(); b.gw = gw; b.springs.x[c] = 1;
      applyShotBodyPre(joints, b); applyShotBodyPost(joints, b); const d = Math.hypot(...px(cam, mark()).map((v, i) => v - a[i]));
      // The body chain must read at chase (the first tune's 2-3 px was not seen): head, off arm and hover legs at least 4 px.
      const min = name === 'torso/head top' || name === 'offArm' || name === 'hoverPitch' || name === 'legTrail' ? 4 : 1.5;
      report.push(`${name} ${d.toFixed(2)} px`); expect(d, name).toBeGreaterThanOrEqual(min);
    }
    console.info('single-peak landmark motion at chase portrait:', report.join(', '));
  });
  it('caps the combined cannon rise at 10 deg over a max-gain 2.5 s burst, and keeps touched joints within LIMITS', () => {
    const { target } = chase(); aim(target); const base = elevation(barrel()), pose = quats();
    for (const ground of [1, 0]) {
      const s = createShooter(), b = createShotBody(), env = { dt: 1 / 60, paused: false, reduced: false, epoch: 1, aimWeight: 1, ads: 0, ground, pxPerM: 40 };
      advanceShotBody(b, s, env); s.input.pressSerial++; let worst = 0;
      for (let i = 0; i < 150; i++) {
        advanceWeapon(s.weapon, true, s.input.pressSerial, 1 / 60); advanceShotBody(b, s, env);
        // Only the post-solve arm snap lifts the cannon (the pre-solve body layers are re-aimed by the solve, which this test does not run).
        joints.forEach((j, k) => j.quaternion.fromArray(pose[k])); applyShotBodyPost(joints, b); root.updateMatrixWorld(true);
        worst = Math.max(worst, (elevation(barrel()) - base) / DEG);
        for (let k = 0; k < BONE_COUNT; k++) { const e = joints[k].rotation, l = LIMITS[k];
          expect(e.x).toBeGreaterThanOrEqual(l[0] - 1e-6); expect(e.x).toBeLessThanOrEqual(l[1] + 1e-6); expect(e.y).toBeGreaterThanOrEqual(l[2] - 1e-6);
          expect(e.y).toBeLessThanOrEqual(l[3] + 1e-6); expect(e.z).toBeGreaterThanOrEqual(l[4] - 1e-6); expect(e.z).toBeLessThanOrEqual(l[5] + 1e-6); }
      }
      console.info(`max cannon rise, max-gain burst, ground ${ground}: ${worst.toFixed(2)} deg`);
      expect(worst).toBeLessThanOrEqual(POSE.riseCap + .05); expect(worst).toBeGreaterThan(3);
    }
  });
  it('braces knees-out from the rig leg lengths: feet planted, pelvis BRACE.drop (2.1 cm) lower, the right knee bowing out at chase', () => {
    const head = (i: number) => new Vector3().setFromMatrixPosition(new Matrix4().copy(mesh.skeleton.boneInverses[i]).invert());
    expect(head(B.thigh_r).distanceTo(head(B.shin_r))).toBeCloseTo(.4828, 3); expect(head(B.shin_r).distanceTo(head(B.foot_r))).toBeCloseTo(.432, 3);
    const { cam } = chase(); rest();
    const feet = [world(B.foot_l), world(B.foot_r)], pelvis = world(B.pelvis), b = body(); b.B = 1; b.gw = 1;
    const kink = () => { const h = px(cam, world(B.thigh_r)), k = px(cam, world(B.shin_r)), f = px(cam, world(B.foot_r));
      return k[0] - (h[0] + (f[0] - h[0]) * (k[1] - h[1]) / (f[1] - h[1])); };
    const straight = kink();
    applyShotBodyPre(joints, b); root.position.y += b.offset.y; root.updateMatrixWorld(true);
    [world(B.foot_l), world(B.foot_r)].forEach((f, i) => {
      expect(Math.abs(f.y - feet[i].y)).toBeLessThanOrEqual(.005); expect(Math.hypot(f.x - feet[i].x, f.z - feet[i].z)).toBeLessThanOrEqual(.01);
    });
    expect(Math.abs(pelvis.y - world(B.pelvis).y - BRACE.drop)).toBeLessThanOrEqual(.004);
    // A knee bent straight forward moves along the chase view line; turned out, it bows at least 5 px sideways.
    console.info(`brace knee bow at chase portrait: ${(kink() - straight).toFixed(1)} px`);
    expect(kink() - straight).toBeGreaterThanOrEqual(5);
    // Both sides mirror exactly in world space.
    expect(world(B.shin_l).x).toBeCloseTo(-world(B.shin_r).x, 4); expect(world(B.shin_l).z).toBeCloseTo(world(B.shin_r).z, 4);
  });
  it('cancels the torso kick at the head (roll always, pitch and yaw by 1 - aim weight): world pitch and roll within .3 deg at the torso peak', () => {
    const { target } = chase(); aim(target); root.updateMatrixWorld(true);
    const fwd = () => new Vector3(0, 0, -1).applyQuaternion(joints[B.head].getWorldQuaternion(q4()));
    const side = () => new Vector3(1, 0, 0).applyQuaternion(joints[B.head].getWorldQuaternion(q4()));
    const p0 = elevation(fwd()), r0 = elevation(side()), b = body(); b.springs.x[CH.torso] = 1; b.aw = 0;
    applyShotBodyPre(joints, b); applyShotBodyPost(joints, b); root.updateMatrixWorld(true);
    expect(Math.abs(elevation(fwd()) - p0)).toBeLessThanOrEqual(.3 * DEG); expect(Math.abs(elevation(side()) - r0)).toBeLessThanOrEqual(.3 * DEG);
  });
});
