import { expect, it } from 'vitest';
import { createCombatCamera, rememberCombatPilot, stepCombatCamera, type CombatCameraInput } from '../src/game/combatCamera';
const input = (over: Partial<CombatCameraInput> = {}): CombatCameraInput => ({ yaw: 0, pitch: 0, pilotYaw: 0, pilotPitch: 0, epoch: 1,
  enabled: true, reduced: false, phase: 1, target: 0, aim: { x: 20, y: 20, z: -30 }, hero: { x: 0, y: 20, z: 0 }, aspect: 1.6, dt: 1 / 60, ...over });
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
