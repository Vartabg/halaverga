import { beforeEach, expect, it } from 'vitest';
import { createShooter, PHASE } from '../src/game/combat';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { createBanish, MODE, resetBanish, stepBanish } from '../src/game/banish';
import { flowPaths, flowVisible, flowTarget, updateFlowPaths } from '../src/game/combatFlow';
import { COMMAND, requestCommand } from '../src/game/commands';
import { cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { resetBattle } from '../src/game/celestialBattle';
const player = { x: 0, y: 30, z: 0 };
function setup() {
  const s = createShooter(); createDroneSim(s); buildTargets(s);
  const b = createBanish(); resetBanish(b, s);
  s.aim.valid = true; Object.assign(s.aim.origin, player); Object.assign(s.aim.dir, { x: 0, y: 0, z: -1 });
  for (let i = 0; i < s.drones.count; i++) {
    const p = { x: i * 4, y: 30, z: -20 - i * 4 };
    Object.assign(s.targets[i].c, p); Object.assign(s.drones.pos[i], p);
    s.targets[i].alive = true; s.targets[i].los = true; s.drones.phase[i] = PHASE.patrol;
  }
  const step = (p = player, dt = 1 / 60) => stepBanish(b, s, p, dt);
  const command = (target = -1) => { requestCommand(s, COMMAND.context, target); step(); };
  return { s, b, step, command };
}
beforeEach(() => { flowPaths.fill(1); flowVisible.fill(1); cancelStrike(); resetBattle(0); });
it('buffers a chosen second demon, waits for impact, then carries into it without a circle', () => {
  const { s, b, step, command } = setup();
  command(0); command(1); expect(strike.target).toBe(0); expect(strike.queued).toBe(true);
  // The opener wounds demon 0 and holds the angel on it; the buffered press then breaks off to the chosen second demon.
  step(s.targets[0].c); expect(b.wounds[0]).toBe(1); expect(b.mode[0]).toBe(MODE.staggered); expect(b.combo).toBe(1);
  const v = { x: 0, y: 0, z: -60 };
  for (let i = 0; i < 12 && strike.target !== 1; i++) { strikeVelocity(v, s.targets[0].c, 1 / 60, false); step(s.targets[0].c); }
  expect(strike.target).toBe(1); expect(strike.phase).toBe(1); expect(strike.lunge).toBe(false); // a fresh dive, not a step-in
  strikeVelocity(v, s.targets[0].c, .14, false); expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(25);
  step(s.targets[1].c); expect(b.combo).toBe(2); expect(b.wounds[1]).toBe(1); expect(b.mode[1]).toBe(MODE.staggered);
  for (let i = 0; i < 100; i++) step();
  expect(s.stats.kills).toBe(0); expect(s.stats.shots).toBe(2);
  expect(strike.queued).toBe(false); // the buffer is one request, never auto-play.
});
it('directional assist excludes casting, occluded, rear and distant demons', () => {
  const { s, b } = setup();
  expect(flowTarget(b, s, player)).toBe(0); b.mode[0] = MODE.cast;
  expect(flowTarget(b, s, player)).toBe(1); s.targets[1].los = false;
  for (let i = 2; i < s.drones.count; i++) s.targets[i].c.z = 100;
  expect(flowTarget(b, s, player)).toBe(-1);
  s.targets[2].c.z = -100; expect(flowTarget(b, s, player)).toBe(-1);
});
it('a wall or cancellation cancels the dive and drops buffered attacks without rewarding a hit', () => {
  const { s, b, step, command } = setup();
  command(0); command(1); s.targets[0].los = false; step();
  expect(strike.phase).toBe(0); expect(strike.queued).toBe(false); expect(b.combo).toBe(0); expect(s.stats.kills).toBe(0);
  s.targets[0].los = true; command(0); command(1); cancelStrike(); step(); expect(strike.phase).toBe(0);
});
it('an expired buffer does not replay after a slow or missed dive; regroup clears the chain', () => {
  const { b, s, step, command } = setup(); command(0); command(1);
  for (let i = 0; i < 50; i++) step();
  expect(strike.queued).toBe(false); expect(b.combo).toBe(0);
  step(s.targets[0].c); expect(b.combo).toBe(1);
  for (let i = 0; i < 85; i++) step(player, .05);
  expect(b.combo).toBe(0); b.resetRequested = true; step(); expect(strike.phase).toBe(0);
});
it('strike view follows a curved launch with bounded angular speed and no camera mutation', async () => {
  const { strikeLook } = await import('../src/game/strikeLook');
  const view = { yaw: 0, pitch: 0 }, target = { x: 20, y: 45, z: -20 };
  strikeLook(view, player, target, 1 / 60);
  expect(view.yaw).toBeLessThan(0); expect(Math.abs(view.yaw)).toBeLessThanOrEqual(4 / 60);
  expect(view.pitch).toBeGreaterThan(0); expect(view.pitch).toBeLessThanOrEqual(2 / 60);
  for (let i = 0; i < 120; i++) strikeLook(view, player, target, 1 / 60);
  expect(view.yaw).toBeCloseTo(-Math.PI / 4, 4);
});

it('rejects a launch when the camera sees a demon but stone blocks the angel itself', () => {
  const { s, b, command } = setup();
  updateFlowPaths(s, player, () => false);
  expect(flowTarget(b, s, player)).toBe(-1);
  command(0); expect(strike.phase).toBe(0); expect(b.combo).toBe(0);
});

it('a missed dive drops a late buffer instead of launching an unearned chain', () => {
  const { command } = setup(); command(0);
  strike.t = .9; command(1);
  const v = { x: 0, y: 0, z: -60 };
  strikeVelocity(v, player, .15, false);
  expect(strike.phase).toBe(0); expect(strike.queued).toBe(false); // a miss hands flight back; it no longer carries on
});

it('a chain can select a reachable demon behind the angel, but never one behind stone', () => {
  const { s, b } = setup();
  for (let i = 0; i < s.drones.count; i++) s.targets[i].c.z = 20;
  expect(flowTarget(b, s, player)).toBe(-1);
  b.combo = 1; b.comboUntil = 4;
  expect(flowTarget(b, s, player)).toBeGreaterThanOrEqual(0);
  flowPaths.fill(0); expect(flowTarget(b, s, player)).toBe(-1);
});
it('a reversing chain follows a finite arc without losing speed at its midpoint', async () => {
  const { strikeArc } = await import('../src/game/strikeArc');
  const out = { x: 0, y: 0, z: 0 };
  for (const blend of [0, .25, .5, .75, 1]) {
    strikeArc(out, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, blend, 60);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(60, 6);
    if (blend === .5) expect(Math.abs(out.x)).toBeGreaterThan(59);
  }
});
