import { afterAll, beforeAll, expect, it } from 'vitest';
import { createCombatCamera, FIGHT_CAMERA, rememberCombatPilot, stepCombatCamera, type CombatCameraInput } from '../src/game/combatCamera';
const input = (over: Partial<CombatCameraInput> = {}): CombatCameraInput => ({ yaw: 0, pitch: 0, pilotYaw: 0, pilotPitch: 0, epoch: 1,
  enabled: true, reduced: false, phase: 1, target: 0, aim: { x: 20, y: 20, z: -30 }, hero: { x: 0, y: 20, z: 0 }, aspect: 1.6, dt: 1 / 60, ...over });
// The planner's follow is switched off in the game (Garo, 2026-11-16: the camera turning itself was dizzying). Off, a strike, a
// string and a watch leave the view exactly where the player holds it; the follow's own behaviour is kept under test below.
it('with the follow off, never turns, pitches or pulls back the view on its own, and never claims the pilot', () => {
  const was = FIGHT_CAMERA.follow; FIGHT_CAMERA.follow = false;
  try {
    const s = createCombatCamera();
    for (const phase of [1, 1, 2, 1, 0]) for (let n = 0; n < 30; n++) {
      stepCombatCamera(s, input({ phase, yaw: .3, pitch: -.1, pilotYaw: .3, pilotPitch: -.1 }));
      expect(s.yaw).toBe(.3); expect(s.pitch).toBe(-.1); expect(s.scale).toBe(1); expect(s.weight).toBe(0); expect(s.tracking).toBe(false);
    }
  } finally { FIGHT_CAMERA.follow = was; }
});
beforeAll(() => { FIGHT_CAMERA.follow = true; }); afterAll(() => { FIGHT_CAMERA.follow = false; });
it('keeps ordinary flight exactly on the existing view and boom', () => {
  const s = createCombatCamera();
  for (const yaw of [0, .4, -2, 4]) {
    stepCombatCamera(s, input({ phase: 0, yaw, pitch: .2, pilotYaw: yaw }));
    expect(s.yaw).toBe(yaw); expect(s.pitch).toBe(.2); expect(s.scale).toBe(1); expect(s.weight).toBe(0);
  }
});
it('tracks a moving victim and gives portrait more framing room without changing FOV', () => {
  const wide = createCombatCamera(), phone = createCombatCamera();
  for (let n = 0; n < 90; n++) {
    const aim = { x: 20 + n * .02, y: 20, z: -30 };
    stepCombatCamera(wide, input({ aim })); stepCombatCamera(phone, input({ aspect: .46, aim }));
  }
  expect(wide.yaw).toBeCloseTo(Math.atan2(-(20 + 89 * .02), 30), 2); expect(wide.weight).toBeGreaterThan(.99);
  expect(phone.scale).toBeGreaterThan(wide.scale); expect(phone.scale).toBeLessThan(2);
});
it('retargets across a reversing chain from the current camera, with bounded angular movement', () => {
  const s = createCombatCamera(); for (let n = 0; n < 50; n++) stepCombatCamera(s, input());
  const before = s.yaw;
  stepCombatCamera(s, input({ target: 1, aim: { x: -30, y: 40, z: 20 } }));
  expect(s.target).toBe(1); expect(Math.abs(s.yaw - before)).toBeLessThanOrEqual(10 / 60);
  expect(s.scale).toBeGreaterThan(1); expect(s.age).toBeCloseTo(1 / 60);
});
it('holds the impact heading instead of spinning to chase the demon falling behind the player', () => {
  const s = createCombatCamera(); for (let n = 0; n < 60; n++) stepCombatCamera(s, input());
  const yaw = s.yaw;
  for (let n = 0; n < 6; n++) stepCombatCamera(s, input({ phase: 2, hero: { x: 80, y: 20, z: -50 }, aim: { x: 20, y: -10, z: -30 } }));
  expect(s.yaw).toBeCloseTo(yaw, 3); expect(s.tracking).toBe(true);
});
it('yields to pilot input and does not mistake its own flight-heading handoff for manual steering', () => {
  const s = createCombatCamera(); stepCombatCamera(s, input()); rememberCombatPilot(s, s.yaw, s.pitch);
  stepCombatCamera(s, input({ pilotYaw: s.yaw, pilotPitch: s.pitch })); expect(s.manual).toBe(0);
  stepCombatCamera(s, input({ pilotYaw: s.yaw + .0002, pilotPitch: s.pitch })); expect(s.manual).toBe(.65); expect(s.tracking).toBe(false);
});
it('pause freezes state; reset, first-person and reduced motion clear automatic framing', () => {
  const s = createCombatCamera(); for (let n = 0; n < 20; n++) stepCombatCamera(s, input());
  const before = JSON.stringify(s); stepCombatCamera(s, input({ dt: 0 })); expect(JSON.stringify(s)).toBe(before);
  for (const override of [{ reduced: true }, { enabled: false }, { epoch: 2, phase: 0 }]) {
    stepCombatCamera(s, input({ yaw: .3, pitch: -.1, ...override }));
    expect(s.yaw).toBe(.3); expect(s.scale).toBe(1); expect(s.weight).toBe(0); expect(s.target).toBe(-1);
  }
});
it('converges consistently at 30, 60 and 120 Hz', () => {
  const results = [30, 60, 120].map(hz => {
    const s = createCombatCamera(); for (let n = 0; n < hz; n++) stepCombatCamera(s, input({ dt: 1 / hz })); return s;
  });
  for (const s of results) { expect(s.yaw).toBeCloseTo(results[0].yaw, 4); expect(s.scale).toBeCloseTo(results[0].scale, 3); }
});
it('holds an elite portal through bound/cast states and latches manual, movement or Brake exits', async () => {
  const { createFinisherFocus, stepFinisherFocus } = await import('../src/game/combatCamera');
  const base = { last: 5, mode: 3, phase: 0, brake: false, steering: false, manual: false };
  for (const exit of [{ brake: true }, { steering: true }, { manual: true }]) {
    const s = createFinisherFocus(); expect(stepFinisherFocus(s, base)).toBe(5);
    expect(stepFinisherFocus(s, { ...base, mode: 4 })).toBe(5);
    expect(stepFinisherFocus(s, { ...base, ...exit })).toBe(-1);
    expect(stepFinisherFocus(s, base)).toBe(-1);
    stepFinisherFocus(s, { ...base, mode: 0 }); expect(stepFinisherFocus(s, base)).toBe(5);
  }
  expect(stepFinisherFocus(createFinisherFocus(), { ...base, last: 0 })).toBe(-1);
  expect(stepFinisherFocus(createFinisherFocus(), { ...base, phase: 1 })).toBe(-1);
});
