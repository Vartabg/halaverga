import { describe, expect, it } from 'vitest';
import { HINT_STEPS, type HintSeries } from '../src/game/store';
import { HINT_TEXT, LINE_MS, LOOK_TRAVEL, MIN_VISIBLE, SHOTS_FALLBACK, STEP_TIMEOUT, actionDone, hintDone, hintText, hintTrack, nextStep, progressToSave, type HintEnv, type HintObs } from '../src/ui/hintSteps';
// Progressive controls hints: one instruction at a time, advanced only by the action it names, persisted so it never repeats.

const env = (o: Partial<HintEnv> = {}): HintEnv => ({ shooter: true, coarse: false, tapControls: false, desktopMode: 'trackpad', steering: 'simple', ...o });
const obs = (o: Partial<HintObs> = {}): HintObs => ({ thumbActive: false, flying: false, captured: false, look: 0, hits: 0, shots: 0, moved: false, ...o });
const on = { autoFire: true, captured: false }, cap = { autoFire: true, captured: true };

describe('hintTrack', () => {
  it('shows nothing with the blaster off, whatever the input', () => {
    for (const coarse of [true, false]) for (const tapControls of [true, false]) for (const desktopMode of ['trackpad', 'mouse'])
      for (const steering of ['simple', 'free', 'captured', 'flow']) expect(hintTrack(env({ shooter: false, coarse, tapControls, desktopMode, steering }))).toBe('none');
  });
  it('picks tap, touch, mouse, simple, then the expert line, in that order', () => {
    expect(hintTrack(env({ tapControls: true, coarse: true }))).toBe('tap');
    expect(hintTrack(env({ tapControls: true, coarse: false, desktopMode: 'mouse' }))).toBe('tap');
    expect(hintTrack(env({ coarse: true, desktopMode: 'mouse', steering: 'free' }))).toBe('touch');
    expect(hintTrack(env({ desktopMode: 'mouse', steering: 'free' }))).toBe('mouse');
    expect(hintTrack(env())).toBe('simple');
    for (const steering of ['free', 'captured', 'flow']) expect(hintTrack(env({ steering }))).toBe('line');
  });
});

describe('hintText', () => {
  it('uses the exact copy for every step', () => {
    expect(hintText('touch', 0, on)).toBe('Drag to fly');
    expect(hintText('touch', 1, on)).toBe('Point at a drone to fire');
    expect(hintText('touch', 1, { autoFire: false, captured: false })).toBe('Point at a drone, hold Fire');
    const simple = ['Click the scene to start', 'Slide to look', 'Click to shoot', 'WASD to fly · Space lifts'];
    const mouse = ['Click the scene to start', 'Move the mouse to look', 'Click to shoot', 'WASD to fly · Space lifts'];
    for (let k = 1; k < 4; k++) { expect(hintText('simple', k, cap)).toBe(simple[k]); expect(hintText('mouse', k, cap)).toBe(mouse[k]); }
    expect(hintText('simple', 0, on)).toBe(simple[0]); expect(hintText('mouse', 0, on)).toBe(mouse[0]);
    expect(hintText('tap', 0, on)).toBe('Tap pad: Fire and Aim toggle');
    expect(hintText('line', 0, on)).toBe('Hold C to fire');
    expect(hintText('none', 0, on)).toBeNull();
  });
  it('shows nothing once a series is done', () => {
    for (const s of ['touch', 'simple', 'mouse'] as HintSeries[]) {
      expect(hintText(s, HINT_STEPS[s], cap)).toBeNull(); expect(hintText(s, HINT_STEPS[s] + 3, on)).toBeNull();
    }
  });
  it('covers the capture poll gap and a lost capture (display only)', () => {
    expect(hintText('simple', 0, cap)).toBe('Slide to look');
    expect(hintText('mouse', 0, cap)).toBe('Move the mouse to look');
    expect(hintText('simple', 2, on)).toBe('Click the scene to start');
    expect(hintText('simple', 2, cap)).toBe('Click to shoot');
    expect(hintText('mouse', 1, on)).toBe('Click the scene to start');
  });
  it('keeps the keys step\'s own text after Esc: it needs no capture, so it never says to click the scene', () => {
    expect(hintText('simple', 3, on)).toBe('WASD to fly · Space lifts');
    expect(hintText('mouse', 3, on)).toBe('WASD to fly · Space lifts');
    expect(hintText('mouse', 3, cap)).toBe('WASD to fly · Space lifts');
  });
  it('never tells a tap-pad player to drag, and every line fits 30 characters', () => {
    expect(HINT_TEXT.tap).not.toMatch(/drag/i);
    const all = [...HINT_TEXT.touch, HINT_TEXT.touchButton, ...HINT_TEXT.simple, ...HINT_TEXT.mouse, HINT_TEXT.tap, HINT_TEXT.line];
    for (const t of all) expect(t.length, t).toBeLessThanOrEqual(30);
  });
  it('keeps the agreed constants', () => {
    expect([MIN_VISIBLE, LOOK_TRAVEL, SHOTS_FALLBACK, STEP_TIMEOUT, LINE_MS]).toEqual([1, .2, 5, 20, 6000]);
  });
});

describe('hintDone', () => {
  it('advances the capture step as soon as the pointer is captured, with no minimum', () => {
    for (const s of ['simple', 'mouse'] as HintSeries[]) {
      expect(hintDone(s, 0, obs({ captured: true }), obs(), .2)).toBe('done');
      expect(hintDone(s, 0, obs(), obs(), 60)).toBe(false);
    }
  });
  it('holds every other step for one second even when its action happened', () => {
    const cases: [HintSeries, number, HintObs][] = [
      ['touch', 0, obs({ thumbActive: true })], ['touch', 1, obs({ hits: 1 })],
      ['simple', 1, obs({ captured: true, look: 1 })], ['simple', 2, obs({ hits: 1 })], ['simple', 3, obs({ moved: true })],
      ['mouse', 1, obs({ captured: true, look: 1 })], ['mouse', 2, obs({ shots: 5 })], ['mouse', 3, obs({ moved: true })],
    ];
    for (const [s, k, now] of cases) {
      expect(hintDone(s, k, now, obs(), .99), `${s} ${k}`).toBe(false);
      expect(hintDone(s, k, now, obs(), 1), `${s} ${k}`).toBe('done');
    }
  });
  it('finishes the first touch step by a thumb or by lifting off, and never by time alone', () => {
    expect(hintDone('touch', 0, obs({ thumbActive: true }), obs(), 1)).toBe('done');
    expect(hintDone('touch', 0, obs({ flying: true }), obs(), 1)).toBe('done');
    expect(hintDone('touch', 0, obs({ flying: true }), obs({ flying: true }), 1)).toBe(false);
    expect(hintDone('touch', 0, obs(), obs(), 60)).toBe(false);
  });
  it('needs 0.2 rad of captured look travel since the series began, or a hit', () => {
    expect(hintDone('simple', 1, obs({ captured: true, look: .2 }), obs(), 2)).toBe('done');
    expect(hintDone('simple', 1, obs({ captured: true, look: .19 }), obs(), 2)).toBe(false);
    expect(hintDone('mouse', 1, obs({ captured: true, hits: 1 }), obs(), 2)).toBe('done');
    // Shots that missed and moving do not teach looking.
    expect(hintDone('simple', 1, obs({ captured: true, shots: 9, moved: true }), obs(), 2)).toBe(false);
  });
  it('finishes a shoot step on a hit or five shots since the series began', () => {
    for (const [s, k] of [['touch', 1], ['simple', 2], ['mouse', 2]] as [HintSeries, number][]) {
      expect(hintDone(s, k, obs({ hits: 3 }), obs({ hits: 2 }), 2)).toBe('done');
      expect(hintDone(s, k, obs({ shots: 14 }), obs({ shots: 10 }), 2)).toBe(false);
      expect(hintDone(s, k, obs({ shots: 15 }), obs({ shots: 10 }), 2)).toBe('done');
    }
  });
  it('ends the shoot and keys steps after 20 s visible as a timeout, never as done', () => {
    for (const [s, k] of [['touch', 1], ['simple', 2], ['simple', 3], ['mouse', 2], ['mouse', 3]] as [HintSeries, number][]) {
      expect(hintDone(s, k, obs(), obs(), 19.9), `${s} ${k}`).toBe(false);
      expect(hintDone(s, k, obs(), obs(), STEP_TIMEOUT), `${s} ${k}`).toBe('timeout');
    }
    expect(hintDone('simple', 1, obs({ captured: true }), obs(), 60)).toBe(false);
  });
  it('finishes the keys step once the player has moved (a key or a flying change latched since the series began)', () => {
    expect(hintDone('simple', 3, obs({ moved: true }), obs(), 1.5)).toBe('done');
    expect(hintDone('simple', 3, obs({ flying: true }), obs(), 1.5)).toBe(false);
  });
});

describe('actions done out of order', () => {
  it('credits a shot, a hit or a move made before its hint, so that hint is skipped', () => {
    const since = obs({ shots: 2, hits: 1 });
    expect(actionDone('simple', 2, obs({ shots: 7, hits: 1 }), since)).toBe(true);
    expect(actionDone('simple', 2, obs({ shots: 6, hits: 1 }), since)).toBe(false);
    expect(actionDone('mouse', 3, obs({ moved: true }), since)).toBe(true);
    expect(actionDone('touch', 1, obs({ hits: 2 }), since)).toBe(true);
  });
  it('W and six clicks during "Slide to look", then a look: straight to done', () => {
    const since = obs(), now = obs({ captured: true, shots: 6, moved: true, look: .25 });
    expect(hintDone('simple', 1, obs({ captured: true, shots: 6, moved: true }), since, 5)).toBe(false);
    expect(hintDone('simple', 1, now, since, 5)).toBe('done');
    expect(nextStep('simple', 2, now, since)).toBe(4);
    expect(hintText('simple', 4, { autoFire: true, captured: true })).toBeNull();
  });
  it('stops at the first step not yet done, and never skips the capture step', () => {
    expect(nextStep('simple', 2, obs({ captured: true, moved: true }), obs())).toBe(2);
    expect(nextStep('mouse', 2, obs({ captured: true, hits: 1 }), obs())).toBe(3);
    expect(nextStep('simple', 0, obs({ captured: true, moved: true, look: 1, hits: 1 }), obs())).toBe(0);
    expect(nextStep('touch', 1, obs(), obs())).toBe(1);
  });
});

describe('saved progress after a timeout', () => {
  it('never saves a step that only timed out: the phone shooting lesson returns on the next visit', () => {
    // Touch: "Point at a drone to fire" (step 1) timed out with no shot; this page load hides it (reached 2), the save stays 1.
    expect(progressToSave(2, 1)).toBe(1);
    // Desktop: the shoot step timed out, then the keys step was done: the save stops at the shoot step.
    expect(progressToSave(4, 2)).toBe(2);
    expect(progressToSave(4, -1)).toBe(4); expect(progressToSave(3, 3)).toBe(3);
  });
});
