import { beforeEach, describe, expect, it } from 'vitest';
import { TOUCH_LOOK, lookWidthScale, touchLook, touchLookGain } from '../src/game/touchLook';
import { runtime } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { ADS_GAIN } from '../src/game/combat';
beforeEach(() => {
  useGame.setState({ touchLook: 1, touchAim: 1, lookAccel: false, reduced: false, invertY: false, aimAssist: 0 });
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
  it('acceleration: 1 below .35 px/ms, smoothstep up to 2.75x at 1.6 px/ms, off when disabled or under reduced motion', () => {
    const p = { touchLook: 1, touchAim: 1, lookAccel: false, reduced: false };
    const base = touchLookGain(p, 0, 0);
    expect(touchLookGain(p, 5, 0)).toBe(base);
    const on = { ...p, lookAccel: true };
    expect(touchLookGain(on, 0, 0)).toBe(base); expect(touchLookGain(on, .35, 0)).toBe(base);
    expect(touchLookGain(on, .35 + 1.25 / 2, 0)).toBeCloseTo(base * (1 + 1.75 / 2), 12);
    expect(touchLookGain(on, 1.6, 0)).toBeCloseTo(base * 2.75, 12); expect(touchLookGain(on, 99, 0)).toBeCloseTo(base * 2.75, 12);
    expect(touchLookGain(on, NaN, 0)).toBe(base);
    expect(touchLookGain({ ...on, reduced: true }, 99, 0)).toBe(base);
    expect(useGame.getInitialState().lookAccel).toBe(true);
  });
  it('gives pitch 40% of the extra gain', () => {
    useGame.setState({ lookAccel: true });
    touchLook(0, -10, 1.6);
    expect(runtime.pitch).toBeCloseTo(.0052 * .8 * 10 * (1 + 1.75 * .4), 12);
  });
  it('blends the ADS multiplier in with the aim blend, on top of look()\'s zoom-matched gain', () => {
    const p = { touchLook: 1, touchAim: .5, lookAccel: false, reduced: false };
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
  it('narrow screens scale only the yaw extra: fine aim and pitch are unchanged, a fast portrait swipe turns past half a circle', () => {
    expect(lookWidthScale(852)).toBe(1); expect(lookWidthScale(700)).toBe(1); expect(lookWidthScale(NaN)).toBe(1);
    expect(lookWidthScale(393)).toBeCloseTo(700 / 393, 12); expect(lookWidthScale(200)).toBe(TOUCH_LOOK.widthMax);
    const on = { touchLook: 1, touchAim: 1, lookAccel: true, reduced: false }, base = touchLookGain(on, 0, 0);
    expect(touchLookGain(on, .2, 0, 393)).toBe(base); // below accelLow: exactly the fine-aim gain
    expect(touchLookGain(on, 1.6, 0, 852)).toBeCloseTo(base * 2.75, 12);
    expect(touchLookGain(on, 1.6, 0, 393)).toBeCloseTo(base * (1 + 1.75 * 700 / 393), 12);
    expect(touchLookGain({ ...on, reduced: true }, 1.6, 0, 393)).toBe(base);
    // A fast 157 px (40% of 393) portrait swipe in 100 ms, min-jerk at 60 Hz: past 180 deg (was about 120).
    useGame.setState({ lookAccel: true });
    const n = 6, D = 157, T = 100, mj = (u: number) => u * u * u * (10 - 15 * u + 6 * u * u);
    let x = 0;
    for (let k = 1; k <= n; k++) { const nx = D * mj(k / n), dx = nx - x; touchLook(dx, 0, dx / (T / n), 393); x = nx; }
    expect(-runtime.yaw * 180 / Math.PI).toBeGreaterThan(180);
    // Pitch keeps the unscaled 40% extra.
    runtime.pitch = 0; touchLook(0, -10, 1.6, 393);
    expect(runtime.pitch).toBeCloseTo(.0052 * .8 * 10 * (1 + 1.75 * .4), 12);
  });
});
