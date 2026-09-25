import { describe, expect, it } from 'vitest';
import { HINT_STEPS, type HintSeries } from '../src/game/store';
import { HINT_TEXT, LINE_MS, LOOK_TRAVEL, MIN_VISIBLE, SHOTS_FALLBACK, STEP_TIMEOUT, actionDone, hintDone, hintText, hintTrack, nextStep, progressToSave, type HintEnv, type HintObs } from '../src/ui/hintSteps';
// Progressive controls hints: one instruction at a time, advanced only by the action it names, persisted so it never repeats.

const env = (o: Partial<HintEnv> = {}): HintEnv => ({ shooter: true, coarse: false, tapControls: false, desktopMode: 'trackpad', steering: 'simple', scheme: 'twin', ...o });
const obs = (o: Partial<HintObs> = {}): HintObs => ({ flying: false, captured: false, look: 0, hits: 0, shots: 0, moved: false, moves: 0, climbs: 0, touchLook: 0, landed: false, ...o });
const on = { autoFire: true, captured: false }, cap = { autoFire: true, captured: true };
const SERIES: HintSeries[] = ['touch', 'simple', 'mouse'];

describe('hintTrack', () => {
  it('keeps the desktop order: tap, mouse, simple, then the expert line; nothing with the blaster off', () => {
    expect(hintTrack(env({ tapControls: true, desktopMode: 'mouse' }))).toBe('tap');
    expect(hintTrack(env({ desktopMode: 'mouse', steering: 'free' }))).toBe('mouse');
    expect(hintTrack(env())).toBe('simple');
    for (const steering of ['captured', 'flow']) expect(hintTrack(env({ steering }))).toBe('line');
    for (const tapControls of [true, false]) for (const desktopMode of ['trackpad', 'mouse']) for (const steering of ['simple', 'free', 'captured', 'flow'])
      expect(hintTrack(env({ shooter: false, tapControls, desktopMode, steering }))).toBe('none');
  });
  it('free cursor (the desktop default again): no hint, the trackpad pill states the mapping', () => {
    expect(hintTrack({ shooter: true, coarse: false, tapControls: false, desktopMode: 'trackpad', steering: 'free', scheme: 'twin' })).toBe('none');
    expect(hintTrack(env({ steering: 'free', scheme: 'classic' }))).toBe('none');
    expect(hintTrack(env({ steering: 'captured' }))).toBe('line');
    expect(hintTrack(env({ steering: 'flow' }))).toBe('line');
    expect(hintTrack(env({ steering: 'simple' }))).toBe('simple');
    expect(hintTrack(env({ steering: 'free', desktopMode: 'mouse' }))).toBe('mouse');
    expect(hintTrack(env({ steering: 'free', tapControls: true }))).toBe('tap');
  });
  it('touch: twin sticks run the touch series with the blaster on or off; classic is one line, blaster on only', () => {
    for (const shooter of [true, false]) {
      expect(hintTrack(env({ coarse: true, shooter, desktopMode: 'mouse', steering: 'free' }))).toBe('touch');
      expect(hintTrack(env({ coarse: true, shooter, scheme: 'classic' }))).toBe(shooter ? 'classic' : 'none');
    }
  });
  it('tap controls win on touch with the blaster on, and leave main\'s hint alone with it off', () => {
    for (const scheme of ['twin', 'classic']) {
      expect(hintTrack(env({ coarse: true, tapControls: true, scheme }))).toBe('tap');
      expect(hintTrack(env({ coarse: true, tapControls: true, scheme, shooter: false }))).toBe('none');
    }
  });
  it('ignores the touch scheme on a fine pointer', () => {
    expect(hintTrack(env({ scheme: 'classic' }))).toBe('simple');
    expect(hintTrack(env({ scheme: 'classic', desktopMode: 'mouse' }))).toBe('mouse');
  });
});

describe('hintText', () => {
  it('teaches the twin sticks in four steps, the last one by blaster and auto-fire', () => {
    expect(HINT_STEPS.touch).toBe(4);
    expect([0, 1, 2].map(k => hintText('touch', k, on))).toEqual(['Left thumb: move', 'Right thumb: look', 'Tap Lift off to fly']);
    expect(hintText('touch', 3, on)).toBe('Aim at drones · Fire to shoot');
    expect(hintText('touch', 3, { autoFire: true, captured: false, shooter: true })).toBe('Aim at drones · Fire to shoot');
    expect(hintText('touch', 3, { autoFire: false, captured: false, shooter: true })).toBe('Hold Fire to shoot');
    for (const autoFire of [true, false]) expect(hintText('touch', 3, { autoFire, captured: false, shooter: false })).toBe('Hold Descend to land');
  });
  it('keeps the desktop and line copy', () => {
    const simple = ['Click the scene to start', 'Slide to look', 'Click to shoot', 'WASD to fly · Space lifts'];
    const mouse = ['Click the scene to start', 'Move the mouse to look', 'Click to shoot', 'WASD to fly · Space lifts'];
    for (let k = 1; k < 4; k++) { expect(hintText('simple', k, cap)).toBe(simple[k]); expect(hintText('mouse', k, cap)).toBe(mouse[k]); }
    expect(hintText('simple', 0, on)).toBe(simple[0]); expect(hintText('mouse', 0, on)).toBe(mouse[0]);
    expect(hintText('tap', 0, on)).toBe('Tap pad: Fire and Aim toggle');
    expect(hintText('line', 0, on)).toBe('Hold C to fire');
    expect(hintText('classic', 0, on)).toBe('One thumb: drag to fly');
    expect(hintText('none', 0, on)).toBeNull();
  });
  it('shows nothing once a series is done', () => {
    for (const s of SERIES) { expect(hintText(s, HINT_STEPS[s], cap)).toBeNull(); expect(hintText(s, HINT_STEPS[s] + 3, on)).toBeNull(); }
  });
  it('covers the capture poll gap and a lost capture on desktop (display only); touch needs no capture', () => {
    expect(hintText('simple', 0, cap)).toBe('Slide to look');
    expect(hintText('mouse', 1, on)).toBe('Click the scene to start');
    expect(hintText('simple', 3, on)).toBe('WASD to fly · Space lifts');
    expect(hintText('touch', 1, on)).toBe('Right thumb: look');
  });
  it('fits every line in 30 characters and never tells a tap-pad player to drag', () => {
    expect(HINT_TEXT.tap).not.toMatch(/drag/i);
    const all = [...HINT_TEXT.touch, HINT_TEXT.touchAuto, HINT_TEXT.touchButton, HINT_TEXT.touchLand, ...HINT_TEXT.simple,
      ...HINT_TEXT.mouse, HINT_TEXT.tap, HINT_TEXT.line, HINT_TEXT.classic];
    for (const t of all) expect(t.length, t).toBeLessThanOrEqual(30);
  });
  it('keeps the agreed constants', () => {
    expect([MIN_VISIBLE, LOOK_TRAVEL, SHOTS_FALLBACK, STEP_TIMEOUT, LINE_MS]).toEqual([1, .2, 5, 20, 6000]);
  });
});

describe('touch step actions', () => {
  it('0: the stick moved (not a look, a climb or lift-off)', () => {
    expect(actionDone('touch', 0, obs({ moves: 1 }), obs())).toBe(true);
    expect(actionDone('touch', 0, obs({ moves: 3 }), obs({ moves: 3 }))).toBe(false);
    expect(actionDone('touch', 0, obs({ touchLook: 5, climbs: 2, flying: true }), obs())).toBe(false);
  });
  it('1: 0.2 rad of touch look since the series began, or a hit', () => {
    expect(actionDone('touch', 1, obs({ touchLook: .2 }), obs())).toBe(true);
    expect(actionDone('touch', 1, obs({ touchLook: .19 }), obs())).toBe(false);
    expect(actionDone('touch', 1, obs({ touchLook: 1.25 }), obs({ touchLook: 1 }))).toBe(true);
    expect(actionDone('touch', 1, obs({ touchLook: 1.15 }), obs({ touchLook: 1 }))).toBe(false);
    expect(actionDone('touch', 1, obs({ hits: 1 }), obs())).toBe(true);
    expect(actionDone('touch', 1, obs({ shots: 9, moves: 4, look: 3 }), obs())).toBe(false);
  });
  it('2: Rise or Descend pressed, or lift-off since the series began', () => {
    expect(actionDone('touch', 2, obs({ climbs: 1 }), obs())).toBe(true);
    expect(actionDone('touch', 2, obs({ flying: true }), obs())).toBe(true);
    expect(actionDone('touch', 2, obs({ flying: true }), obs({ flying: true }))).toBe(false);
    expect(actionDone('touch', 2, obs({ moves: 2 }), obs())).toBe(false);
  });
  it('3 with the blaster: a hit or five shots; without it: a landing', () => {
    expect(actionDone('touch', 3, obs({ hits: 3 }), obs({ hits: 2 }))).toBe(true);
    expect(actionDone('touch', 3, obs({ shots: 14 }), obs({ shots: 10 }))).toBe(false);
    expect(actionDone('touch', 3, obs({ shots: 15 }), obs({ shots: 10 }))).toBe(true);
    expect(actionDone('touch', 3, obs({ landed: true }), obs())).toBe(false);
    expect(actionDone('touch', 3, obs({ landed: true }), obs(), false)).toBe(true);
    expect(actionDone('touch', 3, obs({ hits: 4, shots: 20 }), obs(), false)).toBe(false);
  });
});

describe('desktop step actions (unchanged)', () => {
  it('capture, look, shoot, keys', () => {
    for (const s of ['simple', 'mouse'] as HintSeries[]) {
      expect(hintDone(s, 0, obs({ captured: true }), obs(), .2)).toBe('done');
      expect(hintDone(s, 0, obs(), obs(), 60)).toBe(false);
      expect(actionDone(s, 1, obs({ captured: true, look: .2 }), obs())).toBe(true);
      expect(actionDone(s, 1, obs({ captured: true, look: .19, touchLook: 5 }), obs())).toBe(false);
      expect(actionDone(s, 2, obs({ shots: 5 }), obs())).toBe(true);
      expect(actionDone(s, 3, obs({ moved: true }), obs())).toBe(true);
      expect(actionDone(s, 3, obs({ flying: true, climbs: 2 }), obs())).toBe(false);
    }
  });
});

describe('hintDone', () => {
  it('holds every non-capture step for one second even when its action happened', () => {
    const cases: [HintSeries, number, HintObs][] = [
      ['touch', 0, obs({ moves: 1 })], ['touch', 1, obs({ touchLook: 1 })], ['touch', 2, obs({ climbs: 1 })], ['touch', 3, obs({ hits: 1 })],
      ['simple', 1, obs({ captured: true, look: 1 })], ['simple', 2, obs({ hits: 1 })], ['mouse', 3, obs({ moved: true })],
    ];
    for (const [s, k, now] of cases) {
      expect(hintDone(s, k, now, obs(), .99), `${s} ${k}`).toBe(false);
      expect(hintDone(s, k, now, obs(), 1), `${s} ${k}`).toBe('done');
    }
  });
  it('times out steps 2 and 3 only, after 20 s visible, never as done', () => {
    for (const s of SERIES) for (const k of [2, 3]) {
      expect(hintDone(s, k, obs(), obs(), 19.9), `${s} ${k}`).toBe(false);
      expect(hintDone(s, k, obs(), obs(), STEP_TIMEOUT), `${s} ${k}`).toBe('timeout');
    }
    expect(hintDone('touch', 3, obs(), obs(), STEP_TIMEOUT, false)).toBe('timeout');
    for (const k of [0, 1]) expect(hintDone('touch', k, obs(), obs(), 600), `touch ${k}`).toBe(false);
    expect(hintDone('simple', 1, obs({ captured: true }), obs(), 60)).toBe(false);
  });
  it('passes the blaster flag to the last touch step', () => {
    expect(hintDone('touch', 3, obs({ landed: true }), obs(), 2, false)).toBe('done');
    expect(hintDone('touch', 3, obs({ landed: true }), obs(), 2, true)).toBe(false);
  });
});

describe('actions done out of order', () => {
  it('touch: a look, a climb and a hit during "Left thumb: move", then a move, finish the series', () => {
    const since = obs(), early = obs({ touchLook: .3, climbs: 1, hits: 1 }), now = obs({ touchLook: .3, climbs: 1, hits: 1, moves: 1 });
    expect(hintDone('touch', 0, early, since, 5)).toBe(false);
    expect(hintDone('touch', 0, now, since, 5)).toBe('done');
    expect(nextStep('touch', 1, now, since)).toBe(4);
    expect(hintText('touch', 4, on)).toBeNull();
  });
  it('touch: stops at the first step not yet done, and the last step follows the blaster', () => {
    expect(nextStep('touch', 1, obs({ climbs: 1 }), obs())).toBe(1);
    expect(nextStep('touch', 1, obs({ touchLook: .2, flying: true }), obs())).toBe(3);
    expect(nextStep('touch', 1, obs({ touchLook: .2, flying: true, landed: true }), obs(), false)).toBe(4);
    expect(nextStep('touch', 1, obs({ touchLook: .2, flying: true, landed: true }), obs(), true)).toBe(3);
  });
  it('desktop: W and six clicks during "Slide to look", then a look: straight to done; the capture step is never skipped', () => {
    const since = obs(), now = obs({ captured: true, shots: 6, moved: true, look: .25 });
    expect(hintDone('simple', 1, now, since, 5)).toBe('done');
    expect(nextStep('simple', 2, now, since)).toBe(4);
    expect(nextStep('simple', 2, obs({ captured: true, moved: true }), obs())).toBe(2);
    expect(nextStep('simple', 0, obs({ captured: true, moved: true, look: 1, hits: 1 }), obs())).toBe(0);
  });
  it('a finished series returns null for every track position past its end', () => {
    for (const s of SERIES) expect(hintText(s, nextStep(s, HINT_STEPS[s], obs(), obs()), cap)).toBeNull();
  });
});

describe('saved progress after a timeout', () => {
  it('never saves a step that only timed out: that lesson returns on the next visit', () => {
    expect(progressToSave(4, 2)).toBe(2);
    expect(progressToSave(4, 3)).toBe(3);
    expect(progressToSave(4, -1)).toBe(4); expect(progressToSave(3, 3)).toBe(3);
  });
});
