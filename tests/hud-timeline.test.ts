import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEAT } from '../src/game/combat';
import { chainLabel, controlsHint, crossScale, crosshairRadius, heatColor, hintStaged, markerState, pipAngle, popScale, ventState, type MarkerKind } from '../src/ui/hudTimeline';

const ms = (n: number) => n / 1000;
describe('markerState', () => {
  const kinds: MarkerKind[] = ['hit', 'weak', 'kill', 'blocked'];
  // Kill (approved 2026-09-23 deviation): a larger 1.15x X, never rotated, fading until 450 ms. Other kinds end at 300 ms.
  const baseOf = (k: MarkerKind) => k === 'kill' ? 1.15 : 1, endOf = (k: MarkerKind) => k === 'kill' ? 450 : 300;
  it('pops, holds, fades and disappears on the plan timeline for every kind', () => {
    for (const kind of kinds) {
      const base = baseOf(kind), end = endOf(kind);
      const at = (t: number) => markerState(kind, ms(t), false);
      expect(at(0)).toEqual({ visible: true, scale: 1.4 * base, opacity: 1, rotate: 0 });
      // Ease-out cubic: half the time covers 7/8 of the pop.
      expect(at(35).scale).toBeCloseTo(base * (1 + .4 / 8), 9);
      expect(at(35).opacity).toBe(1);
      expect(at(70).scale).toBeCloseTo(base, 12);
      expect(at(70).opacity).toBe(1);
      expect(at(160)).toMatchObject({ visible: true, opacity: 1, rotate: 0 });
      expect(at(160).scale).toBeCloseTo(base, 12);
      expect(at((160 + end) / 2).opacity).toBeCloseTo(.5, 9);
      expect(at(end)).toMatchObject({ visible: false, opacity: 0 });
      expect(at(-1).visible).toBe(false);
    }
  });
  it('pop is monotonic and ease-out (fast first)', () => {
    let last = Infinity;
    for (let t = 0; t <= 70; t += 5) { const s = markerState('hit', ms(t), false).scale; expect(s).toBeLessThanOrEqual(last); last = s; }
    expect(1.4 - markerState('hit', ms(17.5), false).scale).toBeGreaterThan(.2);
  });
  it('kill is 1.15x and never rotated', () => {
    expect(markerState('kill', ms(100), false)).toMatchObject({ scale: 1.15, rotate: 0 });
    expect(markerState('weak', ms(100), false)).toMatchObject({ scale: 1, rotate: 0 });
  });
  it('reduced motion removes the pop and keeps the fade', () => {
    for (const kind of kinds) {
      const base = baseOf(kind), end = endOf(kind);
      for (const t of [0, 35, 70, 160]) expect(markerState(kind, ms(t), true)).toMatchObject({ visible: true, scale: base, opacity: 1 });
      expect(markerState(kind, ms(230), true).opacity).toBeCloseTo(markerState(kind, ms(230), false).opacity, 12);
      expect(markerState(kind, ms(end), true).visible).toBe(false);
    }
  });
  it('writes into a reused out object', () => {
    const out = { visible: false, scale: 0, opacity: 0, rotate: 0 };
    expect(markerState('kill', 0, false, out)).toBe(out);
    expect(out.scale).toBeCloseTo(1.15 * 1.4, 12);
  });
});

describe('crosshairRadius', () => {
  it('matches the perspective camera projection of the spread cone', () => {
    const half = 2 * Math.PI / 180, fov = 65, H = 800;
    // A ray at `half` off-axis lands tan(half) / tan(fov/2) of the half-height from the centre.
    expect(crosshairRadius(half, fov, H, false)).toBeCloseTo(Math.tan(half) / Math.tan(32.5 * Math.PI / 180) * 400, 9);
    expect(crosshairRadius(half, 50, H, false)).toBeGreaterThan(crosshairRadius(half, 65, H, false));
    expect(crosshairRadius(half, fov, 2 * H, false)).toBeCloseTo(2 * crosshairRadius(half, fov, H, false), 9);
  });
  it('contracts 20% when a drone is acquired', () => {
    const half = 3 * Math.PI / 180;
    expect(crosshairRadius(half, 65, 900, true)).toBeCloseTo(.8 * crosshairRadius(half, 65, 900, false), 12);
  });
  it('never goes below 7 px (before the acquired contraction)', () => {
    expect(crosshairRadius(0, 65, 800, false)).toBe(7);
    expect(crosshairRadius(1e-4, 65, 400, false)).toBe(7);
    expect(crosshairRadius(0, 65, 800, true)).toBeCloseTo(5.6, 12);
  });
});

describe('popScale', () => {
  it('is 1.12 at the shot and settles to 1 by 300 ms', () => {
    expect(popScale(0)).toBeCloseTo(1.12, 12);
    expect(Math.abs(popScale(.3) - 1)).toBeLessThan(.005);
    for (let t = .3; t < 2; t += .01) expect(Math.abs(popScale(t) - 1)).toBeLessThan(.005);
  });
  it('follows the 5 Hz, zeta .6 closed form (small undershoot, zero start slope)', () => {
    const w = 10 * Math.PI, z = .6, wd = w * .8;
    const ref = (t: number) => 1 + .12 * Math.exp(-z * w * t) * (Math.cos(wd * t) + z / .8 * Math.sin(wd * t));
    for (const t of [.01, .05, .1, .125, .2]) expect(popScale(t)).toBeCloseTo(ref(t), 12);
    expect(popScale(Math.PI / wd)).toBeLessThan(1);
    expect(popScale(Math.PI / wd)).toBeGreaterThan(.98);
    expect((popScale(1e-6) - popScale(0)) / 1e-6).toBeCloseTo(0, 2);
  });
  it('rests at exactly 1 before any shot (sinceShot Infinity) or for odd input', () => {
    expect(popScale(Infinity)).toBe(1);
    expect(popScale(NaN)).toBe(1);
    expect(popScale(-.1)).toBe(1);
  });
  it('scales the whole curve by amp (default .12)', () => {
    for (const t of [0, .02, .05, .1, .2, .4]) expect(popScale(t, .06) - 1).toBeCloseTo((popScale(t) - 1) / 2, 12);
    expect(popScale(0, .06)).toBeCloseTo(1.06, 12); expect(popScale(Infinity, .06)).toBe(1);
  });
});

describe('crossScale burst attenuation', () => {
  it('pops 1.12 for burst indices 0-2 and 1.06 from index 3, exactly 1 under reduced motion', () => {
    expect([0, 1, 2].map(i => crossScale(0, false, i))).toEqual([1.12, 1.12, 1.12]);
    expect([3, 4, 12].map(i => crossScale(0, false, i))).toEqual([1.06, 1.06, 1.06]);
    expect(crossScale(0, false)).toBe(1.12);
    for (const i of [0, 3, 9]) for (const t of [0, .03, .1, Infinity]) expect(crossScale(t, true, i)).toBe(1);
    expect(crossScale(Infinity, false, 5)).toBe(1);
  });
});

describe('heatColor', () => {
  it('switches cyan -> amber -> red at .6 and .85', () => {
    expect(heatColor(0)).toBe('#58e1ff');
    expect(heatColor(.5999)).toBe('#58e1ff');
    expect(heatColor(.6)).toBe('#ffb347');
    expect(heatColor(.8499)).toBe('#ffb347');
    expect(heatColor(.85)).toBe('#ff5a36');
    expect(heatColor(1)).toBe('#ff5a36');
  });
});

describe('ventState', () => {
  it('places the vent window at .69-.91 s of the 1.6 s lockout', () => {
    const v = ventState(0, HEAT.lock, HEAT.ventAt, HEAT.ventHalf);
    expect(v.windowStart01).toBeCloseTo(.69 / 1.6, 12);
    expect(v.windowEnd01).toBeCloseTo(.91 / 1.6, 12);
    expect(v.sweep01).toBe(0);
    expect(v.inWindow).toBe(false);
  });
  it('sweeps with lockT and is open only inside the window', () => {
    const at = (t: number) => ventState(t, HEAT.lock, HEAT.ventAt, HEAT.ventHalf);
    expect(at(.8).sweep01).toBeCloseTo(.5, 12);
    expect(at(.68).inWindow).toBe(false);
    expect(at(.7).inWindow).toBe(true);
    expect(at(.8).inWindow).toBe(true);
    expect(at(.9).inWindow).toBe(true);
    expect(at(.92).inWindow).toBe(false);
    expect(at(5).sweep01).toBe(1);
  });
  it('is closed while unlocked', () => {
    expect(ventState(.8, 0, HEAT.ventAt, HEAT.ventHalf).inWindow).toBe(false);
  });
});

describe('chainLabel', () => {
  it('shows ×N only for a chain of 2+ within 1.2 s of the last kill', () => {
    expect(chainLabel(1, 0)).toBe('');
    expect(chainLabel(2, 0)).toBe('×2');
    expect(chainLabel(5, 1.2)).toBe('×5');
    expect(chainLabel(5, 1.2001)).toBe('');
    expect(chainLabel(0, -Infinity)).toBe('');
    expect(chainLabel(3, Infinity)).toBe('');
  });
});

describe('pipAngle', () => {
  it('maps camera right/up to screen angles with y down', () => {
    expect(pipAngle(1, 0)).toBe(0);
    expect(pipAngle(0, 1)).toBeCloseTo(-Math.PI / 2, 12);
    expect(pipAngle(0, -1)).toBeCloseTo(Math.PI / 2, 12);
    expect(Math.abs(pipAngle(-1, 0))).toBeCloseTo(Math.PI, 12);
    expect(pipAngle(1, 1)).toBeCloseTo(-Math.PI / 4, 12);
  });
});

describe('controlsHint', () => {
  const env = (coarse: boolean, desktopMode: string, steering: string) => controlsHint({ coarse, desktopMode, steering });
  it('gives each input profile its own line', () => {
    expect(env(true, 'mouse', 'simple')).toBe('FIRE BUTTON · DRAG IT TO AIM · AIM FOR PRECISION');
    expect(env(false, 'mouse', 'free')).toBe('CLICK FIRES · RIGHT-CLICK AIMS');
    // One finger + keyboard: before capture a click only captures, so the full line waits for the captured pointer.
    expect(env(false, 'trackpad', 'simple')).toBe('CLICK THE SCENE TO START · THEN SLIDE TO LOOK · CLICK TO FIRE');
    expect(controlsHint({ coarse: false, desktopMode: 'trackpad', steering: 'simple', captured: true })).toBe('SLIDE TO LOOK · CLICK TO FIRE (HOLD FOR AUTO) · HOLD Q TO AIM · WASD FLY · SPACE LIFT/LAND · ESC PAUSE');
    expect(controlsHint({ coarse: false, desktopMode: 'trackpad', steering: 'simple', aimToggle: true, captured: true })).toBe('SLIDE TO LOOK · CLICK TO FIRE (HOLD FOR AUTO) · Q TOGGLES AIM · WASD FLY · SPACE LIFT/LAND · ESC PAUSE');
    for (const steering of ['free', 'captured', 'flow'])
      expect(env(false, 'trackpad', steering)).toBe('HOLD C TO FIRE · HOLD Q TO AIM · MOUSE + KEYBOARD LETS A CLICK FIRE');
  });
  it('stages only the desktop one-finger line around capture; touch, tap pad, mouse and other profiles never wait', () => {
    expect(hintStaged({ coarse: false, desktopMode: 'trackpad', steering: 'simple' })).toBe(true);
    expect(hintStaged({ coarse: true, desktopMode: 'trackpad', steering: 'simple' })).toBe(false);
    expect(hintStaged({ coarse: false, desktopMode: 'trackpad', steering: 'simple', tapControls: true })).toBe(false);
    expect(hintStaged({ coarse: false, desktopMode: 'mouse', steering: 'simple' })).toBe(false);
    for (const steering of ['free', 'captured', 'flow']) expect(hintStaged({ coarse: false, desktopMode: 'trackpad', steering })).toBe(false);
    // Captured or not, the touch and tap lines are unchanged.
    expect(controlsHint({ coarse: true, desktopMode: 'trackpad', steering: 'simple', captured: false })).toBe('FIRE BUTTON · DRAG IT TO AIM · AIM FOR PRECISION');
  });
});

describe('HUD sources', () => {
  const read = (f: string) => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8');
  it('stay landing-safe, allocation-light and inside the 200 line budget', () => {
    for (const f of ['hudTimeline.ts', 'ShooterHud.tsx', 'ControlsHint.tsx', 'ShooterSettings.tsx', 'ShooterHud.module.css']) {
      const src = read(f);
      expect(src.split('\n').length).toBeLessThan(200);
      expect(src).not.toMatch(/Math\.random\(|from 'three'|@react-three|invalidate\(/);
    }
  });
  it('keeps a 1 px opaque dark edge on the hit-marker ticks', () => {
    const css = read('ShooterHud.module.css'), edge = css.match(/--edge:(#[0-9a-f]{6})\b/i);
    // A six-digit hex colour is fully opaque (alpha 1 >= .6).
    expect(edge).not.toBeNull();
    expect(css).toMatch(/\.marker i\{[^}]*box-shadow:0 0 0 1px var\(--edge\)/);
  });
  it('pops the crosshair from the index of the last shot in its burst', () => {
    expect(read('ShooterHud.tsx')).toMatch(/crossScale\(w\.sinceShot, reduced, lastShotIndex\(\)\)/);
  });
  it('keeps the live region outside the aria-hidden root and the HUD free of pointer events', () => {
    const hud = read('ShooterHud.tsx'), css = read('ShooterHud.module.css');
    const rootEnd = hud.lastIndexOf('</div>', hud.indexOf('data-testid="shooter-live"'));
    expect(hud.indexOf('aria-hidden="true"')).toBeLessThan(rootEnd);
    expect(hud.slice(rootEnd, hud.indexOf('data-testid="shooter-live"'))).toMatch(/^<\/div>\s*<div className="sr-only" aria-live="polite" $/);
    expect(css).toMatch(/\.hud,\.hud \*\{pointer-events:none\}/);
    expect(hud).toMatch(/cancelAnimationFrame\(raf\); clearInterval\(timer\)/);
  });
});
