import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADS_GAIN, pressAim, pressFire, resetShooterFeel } from '../src/game/combat';
import { clearInput, look, runtime, startFlow } from '../src/game/runtime';
import { clearShooterFault, guarded, shooterFault, shooterFaulted } from '../src/game/shooterFault';
import { useGame } from '../src/game/store';
const s = runtime.shooter;
beforeEach(() => {
  clearShooterFault(); resetShooterFeel(s); s.assist.scale = 1;
  runtime.yaw = .2; runtime.pitch = -.12;
  useGame.setState({ shooter: true, message: '' });
});
afterEach(() => { vi.restoreAllMocks(); clearShooterFault(); });
describe('runtime look with the shooter', () => {
  it('leaves look bit-identical while the shooter is idle', () => {
    look(10, -4, 1.3);
    expect(runtime.yaw).toBe(.2 - 10 * .003 * 1.3);
    expect(runtime.pitch).toBe(Math.max(-1.3, Math.min(1.25, -.12 - -4 * .003 * 1.3)));
    runtime.pitch = 1.2; look(0, -100, 1); expect(runtime.pitch).toBe(1.25);
  });
  it('scales the yaw delta by the ADS gain at full blend', () => {
    s.aim.blend = 1;
    look(10, 0, 1.3);
    expect(.2 - runtime.yaw).toBeCloseTo(10 * .003 * 1.3 * ADS_GAIN, 12);
    expect(runtime.pitch).toBe(-.12);
  });
});
describe('clearInput and the shooter', () => {
  it('clears held fire and aim by default', () => {
    pressFire(s, 'touch'); pressAim(s, false); pressAim(s, true); s.input.touchId = 3;
    clearInput();
    expect(s.input).toMatchObject({ fire: false, fireSource: 'none', aim: false, aimLatched: false, touchId: null, pressSerial: 1 });
    pressFire(s, 'keys'); pressAim(s, true);
    clearInput(true);
    expect(s.input.fire).toBe(false); expect(s.input.aimLatched).toBe(false);
  });
  it('keeps the aim latch and a tap fire hold when Stop asks for it', () => {
    pressFire(s, 'tap'); pressAim(s, true); runtime.velocity.x = 5;
    clearInput(true, true);
    expect(s.input.fire).toBe(true); expect(s.input.fireSource).toBe('tap'); expect(s.input.aimLatched).toBe(true);
    expect(runtime.velocity.x).toBe(0);
  });
  it('startFlow drops held shooter controls', () => {
    pressFire(s, 'keys'); pressAim(s, true);
    startFlow();
    expect(s.input.fire).toBe(false); expect(s.input.aimLatched).toBe(false);
    clearInput();
  });
});
describe('guarded shooter frames', () => {
  it('turns the blaster off on the first throw and stays quiet until cleared', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: number[] = [];
    const frame = guarded('test', (a: number, b: number) => { calls.push(a + b); if (a < 0) throw new Error('boom'); });
    frame(1, 2); expect(calls).toEqual([3]); expect(shooterFaulted()).toBe(false);
    s.aim.blend = .5; s.camFx.kickP = .1; pressFire(s, 'click');
    frame(-1, 0);
    expect(shooterFaulted()).toBe(true);
    expect(useGame.getState().shooter).toBe(false);
    expect(useGame.getState().message).toBe('The blaster stopped. Flight continues.');
    expect(s.aim.blend).toBe(0); expect(s.camFx.kickP).toBe(0); expect(s.input.fire).toBe(false);
    expect(s.weapon.handledPress).toBe(s.input.pressSerial);
    frame(5, 5); expect(calls).toEqual([3, -1]);
    shooterFault('again', new Error('second'));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe('[shooter] test');
    clearShooterFault();
    frame(5, 5); expect(calls).toEqual([3, -1, 10]);
  });
});
