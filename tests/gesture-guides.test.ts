import { describe, expect, it } from 'vitest';
import { gesture } from '../src/game/gesture/bus';
import { BOTTOM_BAND, INK_WORLD_MS, ONBOARD_GHOST_MS, ONBOARD_LOOPS, ONBOARD_REPLAY_S, TRAIL_S } from '../src/game/gesture/tuning';
import {
  GHOST_LOOP_MS, GUIDE_STEPS, NEXT_MS, createGhostFrame, createRunner, ghostAnchor, ghostFrame, guideLink, loadGuideProgress, progressToSave,
  report, reportGuide, saveGuideProgress, skip, type RibbonPath,
} from '../src/ui/gesture/guideSteps';
import { chimeHz, playChime, type ChimeContext } from '../src/ui/gesture/gestureChime';
import { HOLD_REACH, HOLD_TEMPLATES, createHoldModel, holdHide, holdRing, holdShow, holdTrack } from '../src/ui/gesture/HoldGuide';
import { RIBBON_MAX, SPENT_FADE_MS, createRibbon, writeRibbon } from '../src/world/GestureRibbon';
import { TRAIL_CAP, createTrail, pushTrail, writeTrail } from '../src/world/HeroTrail';

const CAM = { x: 0, y: 40, z: 80 };

describe('ghost onboarding steps', () => {
  it('lists the spec 7 steps per scheme, with copy that fits one line', () => {
    expect(GUIDE_STEPS.draw.map(s => s.id)).toEqual(['curve', 'chain', 'tap-drone', 'rooftop']);
    expect(GUIDE_STEPS.conduct.map(s => s.id)).toEqual(['rest-steer', 'stir', 'lift-glide', 'flick', 'circle', 'tap-drone']);
    expect(GUIDE_STEPS.brush.map(s => s.id)).toEqual(['up', 'turn', 'down', 'lasso']);
    for (const list of Object.values(GUIDE_STEPS)) for (const s of list) { expect(s.label.length).toBeLessThanOrEqual(30); expect(s.desk.length).toBeLessThanOrEqual(30); }
  });

  it('retires steps on success, one ghost at a time, and saves only the done prefix', () => {
    const r = createRunner('draw', 0, 0), f = createGhostFrame();
    expect(ghostFrame(r, 100, false, f).step?.id).toBe('curve');
    expect(f.visible).toBe(true);
    expect(report(r, 'tap-drone', 200)).toBe(true); // out of order: retires silently, the current ghost stays
    expect(ghostFrame(r, 300, false, f).step?.id).toBe('curve');
    expect(report(r, 'curve', 400)).toBe(true);
    expect(r.dirty).toBe(true);
    // The next step waits NEXT_MS, then 'tap-drone' is skipped because it is already done.
    expect(ghostFrame(r, 400 + NEXT_MS / 2, false, f).visible).toBe(false);
    expect(ghostFrame(r, 400 + NEXT_MS + 10, false, f).step?.id).toBe('chain');
    expect(f.visible).toBe(true);
    expect(report(r, 'curve', 500)).toBe(false); // an already-retired step never re-fires
    expect(progressToSave(r)).toBe(1);
    report(r, 'chain', 2000);
    expect(progressToSave(r)).toBe(3);
    expect(ghostFrame(r, 2000 + NEXT_MS + 10, false, f).step?.id).toBe('rooftop');
    report(r, 'rooftop', 3000);
    expect(ghostFrame(r, 5000, false, f).step).toBeNull();
    expect(f.visible).toBe(false);
  });

  it('draws at real speed, loops three times, then replays after 8 s with no success', () => {
    const r = createRunner('brush', 0, 0), f = createGhostFrame();
    expect(ONBOARD_LOOPS).toBe(3);
    expect(ghostFrame(r, ONBOARD_GHOST_MS / 2, false, f).progress).toBeCloseTo(.5, 5);
    expect(ghostFrame(r, GHOST_LOOP_MS + 10, false, f).loop).toBe(1);
    expect(ghostFrame(r, 2 * GHOST_LOOP_MS + 10, false, f).loop).toBe(2);
    const loopsEnd = ONBOARD_LOOPS * GHOST_LOOP_MS;
    expect(ghostFrame(r, loopsEnd + 10, false, f).visible).toBe(false);
    expect(f.wakeIn).toBeGreaterThan(0);
    expect(ghostFrame(r, loopsEnd + ONBOARD_REPLAY_S * 1000 - 10, false, f).visible).toBe(false);
    expect(ghostFrame(r, loopsEnd + ONBOARD_REPLAY_S * 1000 + 10, false, f).visible).toBe(true);
  });

  it('skip moves on for this page load without saving the skipped step', () => {
    const r = createRunner('brush', 0, 0), f = createGhostFrame();
    skip(r, 10);
    expect(ghostFrame(r, 20, false, f).step?.id).toBe('turn');
    report(r, 'turn', 30);
    expect(progressToSave(r)).toBe(0);
  });

  it('reduced motion gives a static dotted ghost', () => {
    const r = createRunner('conduct', 0, 0), f = createGhostFrame();
    for (const t of [0, 150, 300, 599]) {
      ghostFrame(r, t, true, f);
      expect(f.visible).toBe(true); expect(f.dotted).toBe(true); expect(f.progress).toBe(1);
      expect(f.wakeIn).toBeGreaterThan(0); // no per-frame animation loop
    }
  });

  it('reportGuide reaches only a mounted runner', () => {
    guideLink.runner = null;
    expect(reportGuide('up', 0)).toBe(false);
    const r = createRunner('brush', 0, 0);
    guideLink.runner = r;
    expect(reportGuide('up', 5)).toBe(true);
    guideLink.runner = null;
  });

  it('places the touch ghost above the bottom band and the desktop ghost centre-right', () => {
    const b = ghostAnchor(true, 390, 844, 34, { x: 0, y: 0, size: 0 });
    expect(b.y + b.size / 2).toBeLessThan(844 - BOTTOM_BAND - 34);
    expect(b.x).toBeGreaterThan(390 / 2);
    const d = ghostAnchor(false, 1440, 900, 0, { x: 0, y: 0, size: 0 });
    expect(d.y).toBe(450); expect(d.x).toBeGreaterThan(720);
  });

  it('persists progress through a storage that may throw', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadGuideProgress(bad)).toEqual({ draw: 0, conduct: 0, brush: 0 });
    expect(() => saveGuideProgress('draw', 2, bad)).not.toThrow();
    const mem = new Map<string, string>(), ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    saveGuideProgress('draw', 2, ok); saveGuideProgress('draw', 1, ok);
    expect(loadGuideProgress(ok).draw).toBe(2);
    expect(createRunner('draw', loadGuideProgress(ok).draw, 0).step).toBe(2);
  });
});

describe('recognition chime', () => {
  const fake = () => {
    const calls = { osc: 0, gain: 0 };
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const node = () => ({ gain: param, frequency: param, connect() {}, start() {}, stop() {}, type: 'sine' });
    const ctx = { state: 'running', currentTime: 1, destination: {},
      createOscillator: () => { calls.osc++; return node(); }, createGain: () => { calls.gain++; return node(); } } as unknown as ChimeContext;
    return { ctx, calls };
  };
  it('is silent when muted and before the audio context exists', () => {
    const { ctx, calls } = fake();
    expect(playChime(1, { context: () => ctx, muted: () => true })).toBe(false);
    expect(calls.osc + calls.gain).toBe(0);
    expect(playChime(1, { context: () => null, muted: () => false })).toBe(false);
  });
  it('plays when unmuted, pitched by stroke speed', () => {
    const { ctx, calls } = fake();
    expect(playChime(1.5, { context: () => ctx, muted: () => false })).toBe(true);
    expect(calls.osc).toBe(2);
    expect(chimeHz(.3)).toBeLessThan(chimeHz(1)); expect(chimeHz(1)).toBeLessThan(chimeHz(2.5));
    expect(Number.isFinite(chimeHz(NaN))).toBe(true);
  });
});

describe('hold guide (OctoPocus)', () => {
  it('shows only in Draw and Brush, fades diverging templates, and never touches the gesture bus', () => {
    const before = JSON.stringify(gesture), m = createHoldModel();
    holdShow(m, 'conduct', 100, 100);
    expect(m.active).toBe(false);
    holdShow(m, 'brush', 200, 400);
    expect(m.active).toBe(true);
    // A stroke straight up keeps Soar and fades Dive and both Turns.
    for (let k = 1; k <= 10; k++) holdTrack(m, 200, 400 - k * 8, k * 8);
    const soar = HOLD_TEMPLATES.brush.findIndex(t => t.label === 'Soar'), dive = HOLD_TEMPLATES.brush.findIndex(t => t.label === 'Dive');
    expect(m.alpha[soar]).toBeGreaterThan(.9);
    expect(m.alpha[dive]).toBe(0);
    // A later return toward Dive never brings it back within the same hold.
    holdTrack(m, 200, 400 + HOLD_REACH / 2, 200);
    expect(m.alpha[dive]).toBe(0);
    for (let p = 0; p <= 1; p += .1) holdRing(m, p, 200, 400);
    holdRing(m, 1); holdHide(m);
    expect(m.ring).toBe(0);
    expect(JSON.stringify(gesture)).toBe(before);
  });
});

/** A drawPath-like ring: points 1.5 m apart, each committed `dt` ms after the last. */
function mockPath(): RibbonPath & { n: number; s0: number; fl: number; bl: number; t0: number; dt: number } {
  return {
    n: 0, s0: 0, fl: 0, bl: -1, t0: 0, dt: 16,
    get count() { return this.n; }, get seq0() { return this.s0; }, get flown() { return this.fl; }, get blocked() { return this.bl; },
    x(i: number) { return (this.s0 + i) * 1.5; }, y() { return 20; }, z(i: number) { return -(this.s0 + i) * .5; },
    t(i: number) { return this.t0 + (this.s0 + i) * this.dt; },
  };
}

describe('world ribbon and hero trail', () => {
  it('the ribbon covers exactly the committed ink older than 150 ms while inking', () => {
    const b = createRibbon(), p = mockPath();
    p.n = 40; // points committed at 0, 16, ... 624 ms
    const now = 700, old = Array.from({ length: p.n }, (_, i) => now - p.t(i) >= INK_WORLD_MS).filter(Boolean).length;
    expect(writeRibbon(b, p, now, CAM, false)).toBe((old - 1) * 6);
    expect(b.points).toBe(old);
    // First and last vertex pairs straddle the first and the last old-enough point.
    const mid = (j: number) => [(b.pos[j * 6] + b.pos[j * 6 + 3]) / 2, (b.pos[j * 6 + 1] + b.pos[j * 6 + 4]) / 2];
    expect(mid(0)[0]).toBeCloseTo(p.x(0), 4);
    expect(mid(old - 1)[0]).toBeCloseTo(p.x(old - 1), 4);
  });

  it('colours spent, unflown and blocked points, and fades spent ink 350 ms behind the hero', () => {
    const b = createRibbon(), p = mockPath();
    p.n = 30; p.fl = 10; p.bl = 25;
    writeRibbon(b, p, 1000, CAM, false);
    const alpha = (j: number) => b.col[j * 8 + 3], red = (j: number) => b.col[j * 8];
    expect(red(12)).toBeLessThan(.2); // unflown ink is cyan
    expect(red(27)).toBe(1); // the blocked tail is amber
    expect(alpha(5)).toBeGreaterThan(0);
    writeRibbon(b, p, 1000 + SPENT_FADE_MS + 1, CAM, false);
    expect(b.points).toBe(20); // the fully faded spent front is dropped
  });

  it('both buffers stay fixed-size over 1000 simulated frames', () => {
    const rb = createRibbon(), tb = createTrail(), p = mockPath();
    const refs = [rb.pos, rb.col, rb.index, tb.ring, tb.pos, tb.col, tb.index], sizes = refs.map(a => a.length);
    for (let f = 0; f < 1000; f++) {
      const now = f * 16.7, t = now / 1000;
      p.n = Math.min(RIBBON_MAX + 20, f); p.fl = f / 3; p.s0 = Math.floor(f / 5);
      writeRibbon(rb, p, now, CAM, false);
      pushTrail(tb, Math.sin(t) * 10, 20 + t, Math.cos(t) * 10, t);
      writeTrail(tb, t, CAM, false);
      expect(rb.points).toBeLessThanOrEqual(RIBBON_MAX);
      expect(tb.count).toBeLessThanOrEqual(TRAIL_CAP);
    }
    expect([rb.pos, rb.col, rb.index, tb.ring, tb.pos, tb.col, tb.index].every((a, i) => a === refs[i] && a.length === sizes[i])).toBe(true);
  });

  it('the trail keeps 1.2 s and ages out when the hero is still', () => {
    const tb = createTrail();
    for (let f = 0; f < 200; f++) pushTrail(tb, f * .2, 20, 0, f / 60);
    writeTrail(tb, 199 / 60, CAM, false);
    expect(tb.count).toBeLessThanOrEqual(Math.ceil(TRAIL_S * 60) + 1);
    for (let f = 200; f < 300; f++) { pushTrail(tb, 199 * .2, 20, 0, f / 60); writeTrail(tb, f / 60, CAM, false); }
    expect(tb.drawCount).toBe(0);
  });

  it('reduced motion hides the trail and the ribbon', () => {
    const tb = createTrail(), rb = createRibbon(), p = mockPath();
    for (let f = 0; f < 30; f++) pushTrail(tb, f, 20, 0, f / 60);
    expect(writeTrail(tb, 30 / 60, CAM, true)).toBe(0);
    expect(tb.count).toBe(0);
    p.n = 40;
    expect(writeRibbon(rb, p, 2000, CAM, true)).toBe(0);
  });
});
