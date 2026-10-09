import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { makeCity } from '../src/world/cityData';
import { EVENT_RING, MAX_DRONES, PHASE, createShooter, readEvents, type ShooterState, type ShotEvent, type Vec3 } from '../src/game/combat';
import { PATROLS, patrolPeakSpeed, patrolPosition } from '../src/game/dronePatrols';
import { startTelegraph } from '../src/game/droneDodge';
import { DRONE, advanceDrones, buildTargets, createDroneContext, createDroneSim, damageDrone, nearMiss, type DroneSim } from '../src/game/drones';
const ctx = createDroneContext();
let s: ShooterState, sim: DroneSim, blocked: ((a: Vec3, b: Vec3) => boolean) | null, events: ShotEvent[], cursor: { last: number };
const clear = (a: Vec3, b: Vec3) => !(blocked && blocked(a, b));
const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3) => { const l = len(a); return v(a.x / l, a.y / l, a.z / l); };
const set = (o: Vec3, a: Vec3) => { o.x = a.x; o.y = a.y; o.z = a.z; };
const collect = (e: ShotEvent) => { events.push({ ...e, from: { ...e.from }, point: { ...e.point } }); };
const drain = () => readEvents(s, cursor, collect);
const busy = () => { let n = 0; for (let i = 0; i < s.drones.count; i++) if (s.drones.phase[i] >= PHASE.telegraph && s.drones.phase[i] <= PHASE.punish) n++; return n; };
const alerted = () => { let n = 0; for (let i = 0; i < s.drones.count; i++) if (s.drones.phase[i] >= PHASE.alert && s.drones.phase[i] <= PHASE.punish) n++; return n; };
beforeEach(() => {
  s = createShooter(); sim = createDroneSim(s); blocked = null; events = []; cursor = { last: 0 };
  Object.assign(ctx, { dt: 0, aimDist: 250, ads: 0, threat: false, tier: 'mouse', tutorialLocked: false, reduced: false });
  set(ctx.player, v()); set(ctx.camera, v()); set(ctx.aimDir, v(0, 0, -1));
});
/** Parks every drone except `keep` (dead, never respawning), so a test watches one brain. */
function only(...keep: number[]) {
  for (let i = 0; i < s.drones.count; i++) if (!keep.includes(i)) { s.drones.phase[i] = PHASE.dead; sim.respawnAt[i] = Infinity; }
}
/** Camera and player 30 m in front of drone i (+z), level with it. */
function viewFrom(i: number, d = 30) { const p = s.drones.pos[i]; set(ctx.camera, v(p.x, p.y, p.z + d)); set(ctx.player, v(p.x, p.y - .5, p.z + d)); }
const aimAt = (p: Vec3) => set(ctx.aimDir, unit(sub(p, ctx.camera)));
function step(seconds: number, dt = 1 / 60, each?: () => void) {
  const n = Math.round(seconds / dt);
  for (let k = 0; k < n; k++) { each?.(); ctx.dt = dt; s.clock += dt; advanceDrones(s, sim, ctx, clear); drain(); }
}
/** Seconds until drone i reaches phase `phase` (Infinity within `limit`). */
function until(i: number, phase: number, limit: number, dt = 1 / 60, each?: () => void) {
  for (let t = 0; t < limit; t += dt) { each?.(); ctx.dt = dt; s.clock += dt; advanceDrones(s, sim, ctx, clear); drain(); if (s.drones.phase[i] === phase) return t + dt; }
  return Infinity;
}
/** Pins drone i in ALERT at p with no orbit drift left to settle. */
function alertAt(i: number, p: Vec3) {
  const f = s.drones; f.phase[i] = PHASE.alert; f.phaseT[i] = 0; f.cooldown[i] = 0; f.dwell[i] = 0;
  set(f.pos[i], p); set(f.home[i], p); set(f.anchor[i], p); set(sim.prev[i], p);
}
describe('drone alert', () => {
  it('needs line of sight and a range of 70 m', () => {
    only(0); viewFrom(0); blocked = () => true; step(1);
    expect(s.drones.phase[0]).toBe(PHASE.patrol);
    blocked = null; set(ctx.player, v(s.drones.pos[0].x, s.drones.pos[0].y, s.drones.pos[0].z + 75)); step(1);
    expect(s.drones.phase[0]).toBe(PHASE.patrol);
    viewFrom(0); step(.25);
    expect(s.drones.phase[0]).toBe(PHASE.alert);
  });
  it('keeps at most 3 drones alert at once', () => {
    set(ctx.player, v(0, 22, 25)); set(ctx.camera, v(0, 23, 27));
    const inRange = PATROLS.filter((_, i) => len(sub(s.drones.pos[i], ctx.player)) <= 70).length;
    expect(inRange).toBeGreaterThanOrEqual(4);
    let peak = 0; step(2, 1 / 60, () => { peak = Math.max(peak, alerted()); });
    expect(peak).toBe(3); expect(alerted()).toBe(3);
  });
  it('loses the player beyond 85 m, or after 3 s unseen', () => {
    only(1); viewFrom(1); step(.3); expect(s.drones.phase[1]).toBe(PHASE.alert);
    const p = s.drones.pos[1]; set(ctx.player, v(p.x, p.y, p.z + 90)); step(1 / 60);
    expect(s.drones.phase[1]).toBe(PHASE.patrol);
    viewFrom(1); step(.3); expect(s.drones.phase[1]).toBe(PHASE.alert);
    blocked = () => true; step(2.9); expect(s.drones.phase[1]).toBe(PHASE.alert);
    step(.4); expect(s.drones.phase[1]).toBe(PHASE.patrol);
  });
  it('anchors the orbit where the drone noticed the player, not at the patrol centre', () => {
    only(2); viewFrom(2); blocked = () => true; step(1.3); blocked = null;
    let before = { ...s.drones.pos[2] };
    for (let k = 0; k < 30 && s.drones.phase[2] === PHASE.patrol; k++) { before = { ...s.drones.pos[2] }; step(1 / 60); }
    expect(s.drones.phase[2]).toBe(PHASE.alert); expect(s.drones.anchor[2]).toEqual(before); expect(s.drones.home[2]).toEqual(before);
    expect(len(sub(s.drones.anchor[2], PATROLS[2].c))).toBeGreaterThan(1);
  });
  it('keeps tower-orbit anchors at least 5.7 m from the tower OBB, wherever it notices the player', () => {
    const city = makeCity(); city.geometry.dispose();
    const tower = city.solids.filter(b => b.kind === 'building' && Math.abs(b.position[0] - 36) < 8 && Math.abs(b.position[2] + 38) < 8);
    expect(tower.length).toBe(2);
    const obb = (p: Vec3) => Math.min(...tower.map(b => {
      const l = new Vector3(p.x, p.y, p.z).sub(new Vector3(...b.position)).applyQuaternion(new Quaternion().setFromEuler(new Euler(...b.rotation)).invert());
      return Math.hypot(Math.max(0, Math.abs(l.x) - b.size[0]), Math.max(0, Math.abs(l.y) - b.size[1]), Math.max(0, Math.abs(l.z) - b.size[2]));
    }));
    for (let n = 0; n < 8; n++) {
      s = createShooter(); sim = createDroneSim(s); only(4); cursor = { last: 0 };
      blocked = () => true; viewFrom(4); step(n * 4.4); blocked = null;
      expect(s.drones.phase[4]).toBe(PHASE.patrol);
      viewFrom(4); step(.3);
      expect(s.drones.phase[4]).toBe(PHASE.alert);
      expect(obb(s.drones.anchor[4]), `sample ${n}`).toBeGreaterThanOrEqual(5.7);
    }
  });
});
describe('drone perception dwell', () => {
  const watch = () => aimAt(s.drones.pos[1]);
  function telegraphAfter(tier: 'mouse' | 'trackpad' | 'touch' | 'tap', nudges = 0) {
    only(1); viewFrom(1); step(.1); expect(s.drones.phase[1]).toBe(PHASE.alert);
    s.drones.cooldown[1] = 0; s.drones.dwell[1] = 0; ctx.tier = tier; ctx.threat = true;
    for (let k = 0; k < nudges; k++) nearMiss(s, 1);
    return until(1, PHASE.telegraph, 3, 1 / 120, watch);
  }
  it('starts the telegraph after .35 s (mouse, trackpad), .55 s (touch) or .8 s (tap) of threatening aim', () => {
    for (const [tier, need] of [['mouse', .35], ['trackpad', .35], ['touch', .55], ['tap', .8]] as const) {
      s = createShooter(); sim = createDroneSim(s); cursor = { last: 0 };
      const t = telegraphAfter(tier);
      expect(t, tier).toBeGreaterThanOrEqual(need - 1e-6); expect(t, tier).toBeLessThanOrEqual(need + 2 / 120);
    }
  });
  it('never telegraphs without threat, off target, or when the aim ray stops short of the drone', () => {
    only(1); viewFrom(1); step(.1); s.drones.cooldown[1] = 0;
    expect(until(1, PHASE.telegraph, 2, 1 / 60, watch)).toBe(Infinity);
    ctx.threat = true;
    const off = () => { const p = s.drones.pos[1]; aimAt(v(p.x + 4, p.y, p.z)); };
    expect(until(1, PHASE.telegraph, 2, 1 / 60, off)).toBe(Infinity);
    ctx.aimDist = 20;
    expect(until(1, PHASE.telegraph, 2, 1 / 60, watch)).toBe(Infinity);
    expect(s.drones.dwell[1]).toBe(0);
  });
  it('shortens the dwell after near misses', () => {
    const t = telegraphAfter('mouse', 1);
    expect(t).toBeLessThanOrEqual(.2 + 2 / 120); expect(t).toBeGreaterThanOrEqual(.2 - 1e-6);
  });
});
describe('drone dodge', () => {
  const P = v(0, 30, 0);
  /** ALERT at P, camera 30 m behind; the crosshair sits `lead` m left of the drone, so the drone is off to its right. */
  function ready(lead = .3) {
    only(1); alertAt(1, P); set(ctx.camera, v(0, 30, 30)); set(ctx.player, v(0, 29.5, 30)); aimAt(v(P.x - lead, P.y, P.z));
  }
  it('lands 4 m perpendicular to the aim ray, away from the crosshair, at the same point at 30/60/120/165 Hz', () => {
    const ends: Vec3[] = [];
    for (const hz of [30, 60, 120, 165]) {
      s = createShooter(); sim = createDroneSim(s); cursor = { last: 0 }; events = []; ready();
      expect(startTelegraph(s, sim, ctx, 1, clear)).toBe(true);
      expect(until(1, PHASE.punish, 2, 1 / hz)).toBeLessThan(.22 + .35 + 3 / hz);
      const d = sub(s.drones.pos[1], P);
      expect(Math.abs(len(d) - 4)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(dot(d, ctx.aimDir))).toBeLessThanOrEqual(1e-9);
      const crosshair = sub(v(P.x - .3, P.y, P.z), ctx.camera), offset = sub(P, v(ctx.camera.x + crosshair.x, 30, ctx.camera.z + crosshair.z));
      expect(dot(d, offset)).toBeGreaterThan(0);
      expect(events.filter(e => e.kind === 'telegraph')).toHaveLength(1);
      ends.push({ ...s.drones.pos[1] });
    }
    for (const e of ends) expect(e).toEqual(ends[0]);
  });
  it('peaks near 21.4 m/s (15/8 * 4 m / .35 s)', () => {
    ready(); startTelegraph(s, sim, ctx, 1, clear);
    let peak = 0, last = { ...s.drones.pos[1] };
    until(1, PHASE.punish, 2, 1 / 165, () => { const p = s.drones.pos[1]; peak = Math.max(peak, len(sub(p, last)) * 165); last = { ...p }; });
    expect(peak).toBeGreaterThan(21.2); expect(peak).toBeLessThan(21.5);
  });
  it('falls back to the other side, then up, and skips the dodge when every way is blocked', () => {
    const right = () => unit(v(-ctx.aimDir.z, 0, ctx.aimDir.x));
    const side = (b: Vec3) => dot(sub(b, P), right());
    ready(); blocked = (a, b) => side(b) > 1;
    startTelegraph(s, sim, ctx, 1, clear); expect(side(s.drones.to[1])).toBeCloseTo(-4, 9); expect(s.drones.side[1]).toBe(-1);
    ready(); sim.dodger = -1; blocked = (a, b) => Math.abs(side(b)) > 1;
    startTelegraph(s, sim, ctx, 1, clear); expect(sub(s.drones.to[1], P)).toEqual(v(0, 4, 0));
    ready(); sim.dodger = -1; blocked = (a, b) => Math.abs(side(b)) > 1 || b.y > P.y + 1;
    startTelegraph(s, sim, ctx, 1, clear); expect(sub(s.drones.to[1], P)).toEqual(v(0, -4, 0));
    ready(); sim.dodger = -1; blocked = () => true; drain(); events = [];
    expect(startTelegraph(s, sim, ctx, 1, clear)).toBe(false);
    drain(); expect(events.filter(e => e.kind === 'telegraph')).toHaveLength(0);
    expect(s.drones.phase[1]).toBe(PHASE.alert); expect(s.drones.cooldown[1]).toBe(1); expect(sim.dodger).toBe(-1);
  });
  it('never dodges downward below 6 m', () => {
    only(1); alertAt(1, v(0, 9, 0)); set(ctx.camera, v(0, 9, 30)); aimAt(v(0, 9, 0));
    blocked = (a, b) => b.y <= a.y + .5 && b.y >= a.y - .5 || b.y > a.y + 1;
    expect(startTelegraph(s, sim, ctx, 1, clear)).toBe(false);
  });
  it('holds at its dodge position, then drifts home to the anchor within about 3 s', () => {
    ready(); startTelegraph(s, sim, ctx, 1, clear); until(1, PHASE.alert, 3);
    const f = s.drones, to = { ...f.to[1] };
    expect(len(sub(f.home[1], f.anchor[1]))).toBeCloseTo(4, 3);
    step(1 / 60); expect(len(sub(f.pos[1], to))).toBeLessThan(.05);
    step(3); expect(len(sub(f.home[1], f.anchor[1]))).toBeLessThan(.05);
    expect(len(sub(f.pos[1], P))).toBeLessThan(3.3);
  });
});
describe('drone punish and cooldown', () => {
  it('punishes for .7 s, then cools down 3.5 +- .5 s (4.5 +- .5 s on touch)', () => {
    for (const tier of ['mouse', 'touch', 'tap'] as const) for (let n = 0; n < 4; n++) {
      s = createShooter(); sim = createDroneSim(s, 7 + n); cursor = { last: 0 }; ctx.tier = tier;
      only(1); alertAt(1, v(0, 30, 0)); set(ctx.camera, v(0, 30, 30)); aimAt(v(-.3, 30, 0));
      startTelegraph(s, sim, ctx, 1, clear); until(1, PHASE.punish, 2);
      const t = until(1, PHASE.alert, 2);
      expect(t).toBeGreaterThanOrEqual(.7 - 1e-6); expect(t).toBeLessThanOrEqual(.7 + 2 / 60);
      const base = tier === 'mouse' ? 3.5 : 4.5;
      expect(Math.abs(s.drones.cooldown[1] - base)).toBeLessThanOrEqual(.5 + 1 / 60);
      expect(sim.dodger).toBe(-1);
    }
  });
  it('lets only one drone dodge at a time', () => {
    only(1, 2); alertAt(1, v(0, 30, 0)); alertAt(2, v(10, 30, 0)); set(ctx.camera, v(5, 30, 30)); set(ctx.player, v(5, 29, 30));
    ctx.threat = true; let peak = 0; const dodged = new Set<number>();
    step(4, 1 / 60, () => { nearMiss(s, 1); nearMiss(s, 2); peak = Math.max(peak, busy()); if (sim.dodger >= 0) dodged.add(sim.dodger); });
    expect(peak).toBe(1); expect([...dodged].sort()).toEqual([1, 2]);
  });
  it('cancels the dodge on a weakpoint hit during the telegraph', () => {
    only(1); alertAt(1, v(0, 30, 0)); set(ctx.camera, v(0, 30, 30)); aimAt(v(-.3, 30, 0));
    startTelegraph(s, sim, ctx, 1, clear); step(.1);
    expect(damageDrone(s, sim, 1, true, v(0, 0, -1))).toBe('weak');
    expect(s.drones.phase[1]).toBe(PHASE.punish); expect(sim.dodger).toBe(-1);
    step(.5); expect(len(sub(s.drones.pos[1], v(0, 30, 0)))).toBeLessThan(.01);
  });
  it('keeps tutorial drone 0 from telegraphing while tutorialLocked', () => {
    only(0); viewFrom(0); step(.1); expect(s.drones.phase[0]).toBe(PHASE.alert);
    s.drones.cooldown[0] = 0; ctx.threat = true; ctx.tutorialLocked = true;
    const watch = () => aimAt(s.drones.pos[0]);
    expect(until(0, PHASE.telegraph, 3, 1 / 60, watch)).toBe(Infinity);
    ctx.tutorialLocked = false; s.drones.cooldown[0] = 0;
    expect(until(0, PHASE.telegraph, 1, 1 / 60, watch)).toBeLessThan(1);
  });
});
describe('drone damage and respawn', () => {
  const dir = v(0, 0, -1);
  it('dies to 6 body hits or 3 weakpoint hits, breaking exactly once at <= 3 HP', () => {
    only(1);
    const body: string[] = [], breaksAt: number[] = [];
    for (let k = 0; k < 6; k++) { body.push(damageDrone(s, sim, 1, false, dir)); drain(); if (events.some(e => e.kind === 'break')) breaksAt.push(s.drones.hp[1]); events = []; }
    expect(body).toEqual(['hit', 'hit', 'hit', 'hit', 'hit', 'kill']);
    expect(breaksAt[0]).toBe(3); expect(breaksAt).toHaveLength(1);
    expect(damageDrone(s, sim, 1, false, dir)).toBe('none');
    s = createShooter(); sim = createDroneSim(s); cursor = { last: 0 }; events = []; only(2);
    expect([0, 1, 2].map(() => damageDrone(s, sim, 2, true, dir))).toEqual(['weak', 'weak', 'kill']); drain();
    expect(events.filter(e => e.kind === 'break')).toHaveLength(1); expect(s.drones.broken[2]).toBe(1);
  });
  it('bursts after the .08 s hit-stop, stays dead 8 s, then arrives with full HP and rejoins its patrol path', () => {
    only(3); viewFrom(3, 40);
    for (let k = 0; k < 6; k++) damageDrone(s, sim, 3, false, dir);
    const frozen = { ...s.drones.pos[3] };
    expect(s.drones.phase[3]).toBe(PHASE.dying);
    const tBurst = until(3, PHASE.dead, 1, 1 / 120);
    expect(tBurst).toBeGreaterThanOrEqual(.08 - 1e-6); expect(tBurst).toBeLessThanOrEqual(.08 + 2 / 120);
    expect(events.filter(e => e.kind === 'burst')).toHaveLength(1); expect(s.drones.pos[3]).toEqual(frozen);
    const tArrive = until(3, PHASE.arriving, 10, 1 / 120);
    expect(tArrive).toBeGreaterThanOrEqual(8 - 1e-6); expect(tArrive).toBeLessThanOrEqual(8 + 2 / 120);
    const arrive = events.find(e => e.kind === 'arrive')!;
    expect(s.drones.hp[3]).toBe(6); expect(s.drones.broken[3]).toBe(0);
    expect(len(sub(arrive.from, arrive.point))).toBeGreaterThan(45);
    expect(damageDrone(s, sim, 3, false, dir)).toBe('hit'); s.drones.hp[3] = 6;
    const tJoin = until(3, PHASE.patrol, 6, 1 / 120);
    expect(tJoin).toBeCloseTo(50 / 12, 1);
    expect(s.drones.pos[3]).toEqual(arrive.point);
    const on = patrolPosition(PATROLS[3], s.drones.patrolT[3], v());
    expect(len(sub(on, s.drones.pos[3]))).toBeLessThan(1e-4);
    set(ctx.player, v(0, 21, 120)); step(1); expect(s.drones.phase[3]).toBe(PHASE.patrol);
    // It trails its moving goal by at most the follow lag, peak speed / follow rate.
    expect(len(sub(patrolPosition(PATROLS[3], s.drones.patrolT[3], v()), s.drones.pos[3]))).toBeLessThan(patrolPeakSpeed(PATROLS[3]) / DRONE.followRate);
  });
  it('knocks back .25 m along the shot and wobbles 8 deg, then settles to exact rest', () => {
    only(1); alertAt(1, v(0, 30, 0)); s.drones.phase[1] = PHASE.punish;
    const shot = unit(v(1, 0, -1)); damageDrone(s, sim, 1, false, shot);
    let knock = 0, wobble = 0;
    for (let k = 0; k < 240; k++) { step(1 / 480, 1 / 480); knock = Math.max(knock, dot(s.drones.knock[1], shot)); wobble = Math.max(wobble, Math.abs(s.drones.wobble[1])); }
    expect(knock).toBeCloseTo(.25, 3); expect(wobble).toBeCloseTo(8 * Math.PI / 180, 3);
    step(3); expect(s.drones.knock[1]).toEqual(v()); expect(s.drones.wobble[1]).toBe(0); expect(s.drones.knockV[1]).toEqual(v());
  });
  it('fills targets with the knocked centre, eye, liveness and line of sight', () => {
    only(1); viewFrom(1); step(.1); damageDrone(s, sim, 1, false, v(0, 0, -1)); step(1 / 60);
    expect(buildTargets(s)).toBe(5);
    const t = s.targets[1], f = s.drones;
    expect(t.c).toEqual(v(f.pos[1].x + f.knock[1].x, f.pos[1].y + f.knock[1].y, f.pos[1].z + f.knock[1].z));
    expect(t.alive).toBe(true); expect(t.los).toBe(true); expect(s.targets[0].alive).toBe(false);
    expect(len(sub(t.eye, t.c))).toBeCloseTo(.72, 6);
  });
});
describe('drone flash gate', () => {
  it('gives at most 3 bright flashes per second under 9/s fire, a steady tint, then exact rest', () => {
    only(1); s.drones.hp[1] = 100;
    const rises: number[] = []; let prev = 0, lastHit = 0;
    const dt = 1 / 180;
    for (let k = 0; k < 27 * 20; k++) {
      if (k % 20 === 0) { damageDrone(s, sim, 1, false, v(0, 0, -1)); lastHit = s.clock; }
      if (s.drones.flash[1] > .6 && prev <= .6) rises.push(s.clock);
      prev = s.drones.flash[1];
      step(dt, dt);
      if (k > 0) expect(s.drones.tint[1]).toBeCloseTo(DRONE.tint, 6);
    }
    expect(rises.length).toBeGreaterThanOrEqual(3);
    for (const t of rises) expect(rises.filter(u => u >= t && u < t + 1).length).toBeLessThanOrEqual(3);
    step(.15, dt); expect(s.drones.tint[1]).toBeCloseTo(DRONE.tint, 6);
    step(3 - (s.clock - lastHit), dt); expect(s.drones.tint[1]).toBe(0); expect(s.drones.flash[1]).toBe(0);
  });
});
describe('drone hygiene', () => {
  it('never calls Math.random', () => {
    for (const file of ['drones', 'droneDodge', 'dronePatrols']) {
      const src = readFileSync(`src/game/${file}.ts`, 'utf8');
      expect(src, file).not.toContain('Math.random');
      for (const marker of ["from 'three'", '@react-three', '@dimforge', 'WebGLRenderer', 'isVector3', 'BufferGeometry', 'powerHero', 'bankLeft'])
        expect(src, `${file}: ${marker}`).not.toContain(marker);
    }
  });
  it('does not grow any array over 10k steps of play', () => {
    const f = s.drones as unknown as Record<string, ArrayLike<unknown>>, simArrays = sim as unknown as Record<string, ArrayLike<unknown>>;
    const lengths = () => [...Object.entries(f), ...Object.entries(simArrays)].filter(([, a]) => typeof a === 'object' && a !== null && 'length' in a).map(([k, a]) => [k, a.length]);
    const before = JSON.stringify(lengths());
    set(ctx.player, v(0, 22, 25)); set(ctx.camera, v(0, 23, 27)); ctx.threat = true;
    for (let k = 0; k < 10000; k++) {
      aimAt(s.drones.pos[k % 5]);
      if (k % 7 === 0) damageDrone(s, sim, k % 5, k % 3 === 0, ctx.aimDir);
      if (k % 11 === 0) nearMiss(s, (k + 2) % 5);
      step(1 / 60); buildTargets(s);
    }
    expect(JSON.stringify(lengths())).toBe(before);
    expect(s.events).toHaveLength(EVENT_RING); expect(s.targets).toHaveLength(MAX_DRONES);
    expect(s.eventSerial).toBeGreaterThan(20);
  });
});
