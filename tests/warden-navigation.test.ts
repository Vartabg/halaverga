import { afterEach, expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { MODE, WA } from '../src/game/banishState';
import { NAV } from '../src/game/wardenState';
import { wardenWorld } from '../src/game/wardenMath';
import { PURSUIT, findWardenRoute, moveWarden } from '../src/game/wardenSteering';
import { battle } from '../src/game/celestialBattle';
import { stepBanish, resetBanish } from '../src/game/banish';
import { strike, cancelStrike } from '../src/game/strike';
import { COMMAND, requestCommand } from '../src/game/commands';
import { advanceDrones, createDroneContext } from '../src/game/drones';
import { flowVisible } from '../src/game/combatFlow';
import { PHASE } from '../src/game/combat';
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
afterEach(() => { wardenWorld.clear = () => true; flowVisible.fill(1); cancelStrike(); });
function setup(i = 5, d = 30) {
  const a = wardenSetup(i); a.player.z = d; a.w.duel = i; a.w.turns[i] = 1; a.w.cool[i] = 999; a.w.relocate[i] = PURSUIT.beat; return a;
}
it('pursues a moving angel rather than returning to the patrol, then flanks at striking distance', () => {
  const a = setup(); a.tick(.5); expect(a.w.navMode[5]).toBe(NAV.chase); a.tick(1); expect(a.s.drones.pos[5].z).toBeGreaterThan(10);
  a.player.x += 12; a.tick(2.5); expect(a.s.drones.pos[5].x).toBeGreaterThan(1); expect(a.w.navDistance[5]).toBeGreaterThan(15);
  const b = setup(5, 10); b.tick(1.3); expect(b.w.navMode[5]).toBe(NAV.flank); expect(Math.abs(b.s.drones.pos[5].x)).toBeGreaterThan(3);
});
it('the cantor backs away from pressure, orbits at firing range and closes if the angel escapes its useful range', () => {
  const a = setup(7, 8); a.tick(1); expect(a.w.navMode[7]).toBe(NAV.retreat); expect(dist(a.s.drones.pos[7], a.player)).toBeGreaterThan(13);
  const b = setup(7, 27); b.tick(1); expect(b.w.navMode[7]).toBe(NAV.flank); expect(Math.abs(b.s.drones.pos[7].x)).toBeGreaterThan(3);
  const c = setup(7, 55); c.tick(1); expect(c.w.navMode[7]).toBe(NAV.chase); expect(c.s.drones.pos[7].z).toBeGreaterThan(4);
});
it('matches30/60/120Hz travel closely and bounds every acceleration and speed sample', () => {
  const ends: number[] = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const a = setup(); let previous = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 1 / dt; n++) { a.step(dt); const velocity = a.w.navVelocity[5];
      expect(dist(velocity, previous)).toBeLessThanOrEqual(PURSUIT.acceleration * dt + .0001); expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeLessThanOrEqual(12.001); previous = { ...velocity }; }
    ends.push(a.s.drones.pos[5].z);
  }
  expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(.3);
});
it('does not move during tells, earned recoveries, stun, reserved dives, queued or just-requested strikes', () => {
  for (const phase of ['tell', 'opening', 'stun', 'dive', 'queued', 'request'] as const) {
    const a = setup(); const p = { ...a.s.drones.pos[5] };
    if (phase === 'tell') { a.w.phase[5] = WA.tell; a.w.tell[5] = 1.25; a.w.move[5] = WA.rush; a.w.active = 5; }
    if (phase === 'opening') { a.w.phase[5] = WA.recover; a.w.open[5] = 2; a.w.active = 5; }
    if (phase === 'stun') { a.b.mode[5] = MODE.staggered; a.b.timer[5] = 2; }
    if (phase === 'dive') { strike.phase = 1; strike.target = 5; }
    if (phase === 'queued') { strike.queued = true; strike.queueTarget = 5; strike.queueTime = .7; }
    if (phase === 'request') requestCommand(a.s, COMMAND.sword, 5);
    a.step(); expect(a.s.drones.pos[5], phase).toEqual(p); expect(a.w.navMode[5], phase).toBe(NAV.none); cancelStrike();
  }
});
it('uses the held flag as exclusive ownership, and freezes when the authoritative battle clock stops', () => {
  const a = setup(), ctx = createDroneContext(); a.step(); const p = { ...a.s.drones.pos[5] };
  Object.assign(ctx, { dt: 1 / 60, player: a.player, camera: a.player }); advanceDrones(a.s, a.sim, ctx, () => true);
  expect(a.s.drones.pos[5]).toEqual(p); expect(a.s.drones.held[5]).toBe(1);
  stepBanish(a.b, a.s, a.player, .05); expect(a.s.drones.pos[5]).toEqual(p); expect(a.w.navMode[5]).toBe(NAV.none);
});
it('stops on new cover, chooses a clear detour, and never routes through the angel', () => {
  const a = setup(); a.tick(.5); const p = { ...a.s.drones.pos[5] }; wardenWorld.clear = () => false; a.tick(.3);
  expect(a.s.drones.pos[5]).toEqual(p); expect(a.w.navMode[5]).toBe(NAV.blocked);
  wardenWorld.clear = (from, to) => !(from.z < 8 && to.z > 8 && Math.abs(to.x) < 5 && to.y < 40);
  const out = { x: 0, y: 0, z: 0 }, from = { x: 0, y: 35, z: 0 }, to = { x: 0, y: 35, z: 20 };
  expect(findWardenRoute(from, to, from, { x: 0, y: 35, z: 35 }, 1, out)).toBe(true); expect(Math.abs(out.x)).toBeGreaterThan(4);
  wardenWorld.clear = () => true;
  const v = { x: 0, y: 0, z: 0 }; const pos = { x: 0, y: 35, z: 6 }; const player = { x: 0, y: 35, z: 0 };
  for (let n = 0; n < 90; n++) moveWarden(pos, { x: 0, y: 35, z: -15 }, v, from, 12, 1 / 60, player);
  expect(pos.z).toBeGreaterThanOrEqual(5);
});
it('releases and cancels threats after a long escape, prolonged occlusion or battle failure; reset clears movement memory', () => {
  for (const reason of ['distance', 'occluded', 'fallen'] as const) {
    const a = setup(); a.step(); a.w.phase[5] = WA.tell; a.w.active = 5;
    if (reason === 'distance') a.player.z = 160;
    if (reason === 'occluded') wardenWorld.clear = () => false;
    if (reason === 'fallen') battle.status = 'fallen';
    a.tick(reason === 'occluded' ? 5.2 : .1); expect(a.w.duel, reason).toBe(-1); expect(a.w.phase[5], reason).toBe(WA.idle); expect(a.s.drones.held[5], reason).toBe(0);
  }
  const a = setup(); a.tick(1); resetBanish(a.b, a.s); expect(a.w.navSet[5]).toBe(0); expect(a.w.navDistance[5]).toBe(0); expect(a.w.navMode[5]).toBe(NAV.none);
});
it('bounds goals to the arena leash and freezes both wardens for a bind/cast', () => {
  const a = setup(); a.step(); a.player.z = 90; a.tick(8); expect(dist(a.s.drones.pos[5], a.w.navHome[5])).toBeLessThanOrEqual(PURSUIT.leash + .01);
  a.b.mode[5] = MODE.bound; a.b.timer[5] = -1; const p = { ...a.s.drones.pos[5] }; a.tick(.3); expect(a.s.drones.pos[5]).toEqual(p); expect(a.w.navMode[5]).toBe(NAV.none);
});
it('returns from a low rush endpoint gradually instead of snapping into the navigation flight band', () => {
  const p = { x: 0, y: 2, z: 0 }, home = { ...p }, v = { x: 0, y: 0, z: 0 }, player = { x: 0, y: 2, z: 40 };
  for (let n = 0; n < 180; n++) { const old = { ...p }; moveWarden(p, { x: 0, y: 20, z: 0 }, v, home, 12, 1 / 60, player); expect(dist(p, old)).toBeLessThanOrEqual(.201); }
  expect(p.y).toBeGreaterThan(19); expect(p.y).toBeLessThanOrEqual(20.2);
});
it('keeps the moving body target synchronized and vulnerable, then holds still for a fresh sword request', () => {
  const a = setup(); a.b.guardTime[5] = 2; a.step(); expect(a.b.guardTime[5]).toBe(0);
  expect(a.s.targets[5].c).toEqual(a.s.drones.pos[5]);
  const p = { ...a.s.drones.pos[5] }; requestCommand(a.s, COMMAND.sword, 5); a.step();
  expect(a.s.drones.pos[5]).toEqual(p); expect(strike.phase).toBe(1);
});
it('can pursue out of view without starting a hidden attack or handing the turn to the other elite', () => {
  const a = setup(); a.w.cool[5] = 0; a.w.relocate[5] = 0; flowVisible[5] = 0; a.s.aim.dir.z = 1;
  a.s.drones.hp[7] = 6; a.s.drones.phase[7] = PHASE.alert; Object.assign(a.s.drones.pos[7], { x: 2, y: 35, z: 3 }); a.w.cool[7] = 0;
  a.tick(1.5); expect(a.w.navDistance[5]).toBeGreaterThan(5); expect(a.w.duel).toBe(5);
  expect(a.w.phase[5]).toBe(WA.idle); expect(a.w.phase[7]).toBe(WA.idle); expect(battle.ward).toBe(3);
});
it('hands back to the ordinary patrol motor without a position snap after disengagement', () => {
  const a = setup(); a.tick(1); const ctx = createDroneContext();
  Object.assign(ctx, { dt: 1 / 60, player: a.player, camera: a.player }); advanceDrones(a.s, a.sim, ctx, () => true);
  a.player.z = 160; a.step(); expect(a.s.drones.held[5]).toBe(0); const p = { ...a.s.drones.pos[5] };
  advanceDrones(a.s, a.sim, ctx, () => true); expect(dist(p, a.s.drones.pos[5])).toBeLessThan(.5);
});
it('holds the reserved first duel still while ordinary darts drain, before it has delivered a first tell', () => {
  const a = setup(); a.w.turns[5] = 0; const p = { ...a.s.drones.pos[5] }; a.tick(1);
  expect(a.s.drones.pos[5]).toEqual(p); expect(a.w.navMode[5]).toBe(NAV.none); expect(a.s.drones.held[5]).toBe(1);
});
