import { beforeEach, describe, expect, it } from 'vitest';
import { TOUCH_LOOK, touchLook, touchLookGain } from '../src/game/touchLook';
import { runtime } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { ADS_GAIN } from '../src/game/combat';
beforeEach(() => {
  useGame.setState({ touchLook: 1, touchAim: 1, lookAccel: false, invertY: false, aimAssist: 0 });
  runtime.yaw = 0; runtime.pitch = 0; runtime.stick.lookTravel = 0;
  const s = runtime.shooter; s.aim.blend = 0; s.assist.slow = 0; s.assist.engaged = false;
});
describe('touch look', () => {
  it('turns exactly .0052 rad of yaw per pixel and .8x that in pitch, drag up looks up', () => {
    touchLook(100, 0, 0);
    expect(runtime.yaw).toBeCloseTo(-.52, 12);
    runtime.yaw = 0; touchLook(0, -50, 0);
    expect(runtime.pitch).toBeCloseTo(.0052 * .8 * 50, 12);
    expect(TOUCH_LOOK.radPerPx * 180 / Math.PI).toBeCloseTo(.298, 3);
  });
  it('inverts pitch only with invertY', () => {
    useGame.setState({ invertY: true });
    touchLook(0, -50, 0);
    expect(runtime.pitch).toBeCloseTo(-.0052 * .8 * 50, 12);
    touchLook(40, 0, 0); expect(runtime.yaw).toBeCloseTo(-.0052 * 40, 12);
  });
  it('scales linearly with the sensitivity setting', () => {
    for (const k of [.5, 1.3, 2]) {
      useGame.setState({ touchLook: k }); runtime.yaw = 0;
      touchLook(10, 0, 0);
      expect(runtime.yaw).toBeCloseTo(-.0052 * k * 10, 12);
    }
  });
  it('keeps acceleration off by default and bounds it to 1..1.5 when on', () => {
    const p = { touchLook: 1, touchAim: 1, lookAccel: false };
    const base = touchLookGain(p, 0, 0);
    expect(touchLookGain(p, 5, 0)).toBe(base);
    const on = { ...p, lookAccel: true };
    expect(touchLookGain(on, 0, 0)).toBe(base); expect(touchLookGain(on, .4, 0)).toBe(base);
    expect(touchLookGain(on, 1, 0)).toBeCloseTo(base * 1.25, 12);
    expect(touchLookGain(on, 1.6, 0)).toBeCloseTo(base * 1.5, 12); expect(touchLookGain(on, 99, 0)).toBeCloseTo(base * 1.5, 12);
    expect(touchLookGain(on, NaN, 0)).toBe(base);
  });
  it('blends the ADS multiplier in with the aim blend, on top of look()\'s zoom-matched gain', () => {
    const p = { touchLook: 1, touchAim: .5, lookAccel: false };
    expect(touchLookGain(p, 0, 0)).toBeCloseTo(.0052 / .003, 12);
    expect(touchLookGain(p, 0, .5)).toBeCloseTo(.0052 / .003 * .75, 12);
    useGame.setState({ touchAim: .5 }); runtime.shooter.aim.blend = 1;
    touchLook(10, 0, 0);
    expect(runtime.yaw).toBeCloseTo(-.0052 * .5 * ADS_GAIN * 10, 12);
  });
  it('accumulates the turn actually applied in lookTravel, including a pitch clamp', () => {
    touchLook(10, 0, 0); touchLook(-10, 0, 0);
    expect(runtime.stick.lookTravel).toBeCloseTo(.104, 12);
    runtime.pitch = 1.2; runtime.stick.lookTravel = 0;
    touchLook(0, -1000, 0);
    expect(runtime.pitch).toBe(1.25); expect(runtime.stick.lookTravel).toBeCloseTo(.05, 12);
  });
});
