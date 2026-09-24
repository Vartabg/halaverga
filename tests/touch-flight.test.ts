import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCKED, LAND_WINDOW, findLandingNear, levelFlight, probeBelow, touchBlockedStep, touchLandStep, type BlockedContext, type TouchLandContext } from '../src/game/touchFlight';
import { notePointer, resetPointerMode } from '../src/game/pointerMode';
import { clearInput, runtime } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { FOOT, advanceVelocity } from '../src/game/motion';
type Hit = { timeOfImpact: number; normal: { x: number; y: number; z: number } } | null;
class Ray { constructor(public origin: { x: number; y: number; z: number }, public dir: { x: number; y: number; z: number }) {} }
function mock(hit: Hit, landable = true) {
  const casts: { origin: unknown; length: number }[] = [];
  const world = { castRayAndGetNormal: (ray: Ray, length: number) => { casts.push({ origin: { ...ray.origin }, length }); return hit && hit.timeOfImpact <= length ? hit : null; } };
  const safe = { canLand: vi.fn(() => landable) };
  return { casts, safe, ctx: (flying = true): TouchLandContext => ({ world: world as never, rapier: { Ray } as never, collider: {} as never, safe, position: { x: 1, y: 10, z: 2 }, flying }) };
}
beforeEach(() => { clearInput(true); useGame.setState({ landing: false }); });
afterEach(() => { resetPointerMode(); vi.unstubAllGlobals(); });
describe('level flight', () => {
  it('is on only for the twin scheme on touch without "Fly where I look"', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    notePointer('touch');
    expect(levelFlight({ touchScheme: 'twin', flyWhereILook: false })).toBe(true);
    expect(levelFlight({ touchScheme: 'twin', flyWhereILook: true })).toBe(false);
    expect(levelFlight({ touchScheme: 'classic', flyWhereILook: false })).toBe(false);
    notePointer('mouse');
    expect(levelFlight({ touchScheme: 'twin', flyWhereILook: false })).toBe(false);
  });
  it('keeps velocity.y at 0 at full forward when the level pitch 0 replaces a view pitch of -.4', () => {
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) v = advanceVelocity(v, { forward: 1, strafe: 0, vertical: 0 }, .3, 0, true, false, 1 / 60);
    expect(v.y).toBe(0); expect(Math.hypot(v.x, v.z)).toBeCloseTo(13, 1);
    let w = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) w = advanceVelocity(w, { forward: 1, strafe: 0, vertical: 0 }, .3, -.4, true, false, 1 / 60);
    expect(w.y).toBeLessThan(-4); // the coupled path would dive
  });
});
describe('probeBelow', () => {
  it('returns the surface point for a flat, landable hit and casts straight down past the feet', () => {
    const m = mock({ timeOfImpact: 3, normal: { x: 0, y: 1, z: 0 } });
    const p = probeBelow(m.ctx().world, { Ray } as never, {} as never, m.safe, { x: 1, y: 10, z: 2 }, FOOT + LAND_WINDOW);
    expect(p && [p.x, p.y, p.z]).toEqual([1, 7, 2]);
    expect(m.casts[0]).toEqual({ origin: { x: 1, y: 10, z: 2 }, length: FOOT + 2.5 });
  });
  it('rejects steep normals (<= .75), non-landable points and misses', () => {
    for (const [hit, landable] of [[{ timeOfImpact: 2, normal: { x: .7, y: .75, z: 0 } }, true], [{ timeOfImpact: 2, normal: { x: 0, y: 1, z: 0 } }, false], [null, true]] as const) {
      const m = mock(hit, landable);
      expect(probeBelow(m.ctx().world, { Ray } as never, {} as never, m.safe, { x: 0, y: 5, z: 0 }, 3.56)).toBeNull();
    }
  });
});
describe('touchLandStep', () => {
  it('starts one landing per Descend hold, only while flying and only with a hit', () => {
    const flat = { timeOfImpact: 3, normal: { x: 0, y: 1, z: 0 } };
    let m = mock(flat);
    expect(touchLandStep(m.ctx())).toBe(false); // Descend not held
    runtime.stick.descend = 1;
    expect(touchLandStep(m.ctx(false))).toBe(false); expect(runtime.landGoal).toBeNull(); // on the ground
    m = mock(null);
    expect(touchLandStep(m.ctx())).toBe(false); expect(runtime.stick.descendUsed).toBe(false); // nothing below
    m = mock(flat);
    expect(touchLandStep(m.ctx())).toBe(true);
    expect(runtime.landGoal && [runtime.landGoal.x, runtime.landGoal.y, runtime.landGoal.z]).toEqual([1, 7 + FOOT, 2]);
    expect(runtime.stick.descendUsed).toBe(true); expect(useGame.getState().landing).toBe(true);
    runtime.landGoal = null;
    expect(touchLandStep(m.ctx())).toBe(false); expect(m.casts.length).toBe(1); // spent for this hold
    runtime.stick.descend = 0;
    expect(touchLandStep(m.ctx())).toBe(false); expect(runtime.stick.descendUsed).toBe(false); // release re-arms
    runtime.stick.descend = 1;
    expect(touchLandStep(m.ctx())).toBe(true);
  });
  it('does not replace a landing already in progress', () => {
    const m = mock({ timeOfImpact: 3, normal: { x: 0, y: 1, z: 0 } });
    runtime.stick.descend = 1; runtime.landGoal = { x: 9, y: 9, z: 9 } as never;
    expect(touchLandStep(m.ctx())).toBe(false); expect(m.casts.length).toBe(0);
  });
});
describe('touchBlockedStep (Descend held, clearance assist stopped the descent)', () => {
  const flat = { timeOfImpact: 5, normal: { x: 0, y: 1, z: 0 } };
  // Ground only beyond 3 m east of the suit: straight down is the canopy (no hit counts as unlandable here).
  function world(ground: (o: { x: number; y: number; z: number }) => boolean) {
    const casts: { x: number; y: number; z: number }[] = [];
    return { casts, w: { castRayAndGetNormal: (ray: Ray, length: number) => { casts.push({ ...ray.origin }); return ground(ray.origin) && flat.timeOfImpact <= length ? flat : null; } } };
  }
  const ctx = (w: unknown, over: Partial<BlockedContext> = {}): BlockedContext => ({ world: w as never, rapier: { Ray } as never, collider: {} as never,
    safe: { canLand: () => true, pathClear: () => true }, position: { x: 0, y: 10, z: 0 }, flying: true, clearance: true, vy: 0, dt: 1 / 60, ...over });
  const steps = (c: BlockedContext, n: number) => { let r = false; for (let i = 0; i < n; i++) r = touchBlockedStep(c) || r; return r; };
  beforeEach(() => { useGame.setState({ descendBlocked: false }); runtime.stick.descend = 0; touchBlockedStep(ctx({ castRayAndGetNormal: () => null })); });
  it('after 0.4 s stalled, lands on the nearest landable spot around the suit', () => {
    const m = world(o => o.x > 2);
    runtime.stick.descend = 1;
    expect(steps(ctx(m.w), Math.floor(BLOCKED.hold * 60) - 1)).toBe(false); expect(m.casts).toHaveLength(0);
    expect(steps(ctx(m.w), 2)).toBe(true);
    expect(runtime.landGoal && [runtime.landGoal.x, runtime.landGoal.y, runtime.landGoal.z]).toEqual([2.5, 10 - 5 + FOOT, 0]);
    expect(runtime.stick.descendUsed).toBe(true); expect(useGame.getState()).toMatchObject({ landing: true, descendBlocked: false });
    expect(findLandingNear(m.w as never, { Ray } as never, {} as never, { canLand: () => true, pathClear: () => false }, { x: 0, y: 10, z: 0 })).toBeNull();
  });
  it('with nothing landable near, Descend reads "No landing" until released; moving 3 m searches again', () => {
    let east = 99; const m = world(o => o.x > east);
    runtime.stick.descend = 1;
    steps(ctx(m.w), 30); expect(useGame.getState().descendBlocked).toBe(true); expect(runtime.landGoal).toBeNull();
    const n = m.casts.length; steps(ctx(m.w, { position: { x: 1, y: 10, z: 0 } }), 30); expect(m.casts.length).toBe(n); // under 3 m: no new search
    east = 5; expect(steps(ctx(m.w, { position: { x: 3.5, y: 10, z: 0 } }), 1)).toBe(true);
    runtime.landGoal = null; runtime.stick.descendUsed = false;
    east = 99; steps(ctx(m.w, { position: { x: 20, y: 10, z: 0 } }), 30); expect(useGame.getState().descendBlocked).toBe(true);
    runtime.stick.descend = 0; touchBlockedStep(ctx(m.w)); expect(useGame.getState().descendBlocked).toBe(false);
  });
  it('does nothing while descending, on the ground, or without the clearance assist', () => {
    const m = world(() => true); runtime.stick.descend = 1;
    for (const over of [{ vy: -9 }, { flying: false }, { clearance: false }]) expect(steps(ctx(m.w, over), 60)).toBe(false);
    expect(m.casts).toHaveLength(0); expect(runtime.landGoal).toBeNull();
  });
});
