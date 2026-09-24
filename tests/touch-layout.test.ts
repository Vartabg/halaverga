import { describe, expect, it } from 'vitest';
import { LAYOUT_TABLES, computeLayout, routeTouch, type Insets, type LayoutPrefs, type Rect, type TouchButton, type TouchLayout } from '../src/game/touchLayout';
const EPS = 1e-6;
const Z: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const LAND: [number, number][] = [[852, 393], [844, 390], [932, 430], [667, 375], [852, 350], [844, 340], [667, 320], [568, 262]];
const PORT: [number, number][] = [[393, 852], [375, 667], [430, 932], [393, 659], [320, 568]];
const LAND_INSETS: Insets[] = [{ top: 0, right: 59, bottom: 21, left: 59 }, Z];
const PORT_INSETS: Insets[] = [{ top: 59, right: 0, bottom: 34, left: 0 }, { top: 20, right: 0, bottom: 0, left: 0 }, Z];
const PREFS: Omit<LayoutPrefs, 'size' | 'flip'>[] = [
  { fire: true, aim: true, tapPad: false }, { fire: false, aim: false, tapPad: false },
  { fire: true, aim: false, tapPad: false }, { fire: true, aim: false, tapPad: true },
];
type Case = { w: number; h: number; insets: Insets; top: number; prefs: LayoutPrefs };
function* cases(): Generator<Case> {
  for (const size of [.85, 1, 1.2]) for (const flip of [false, true]) for (const p of PREFS) {
    const prefs = { ...p, size, flip };
    for (const [w, h] of LAND) for (const insets of LAND_INSETS) yield { w, h, insets, top: 64, prefs };
    for (const [w, h] of PORT) for (const insets of PORT_INSETS) for (const top of [111, 72]) yield { w, h, insets, top, prefs };
  }
}
const spots = (L: TouchLayout) => (Object.entries(L.buttons) as [TouchButton, NonNullable<TouchLayout['buttons'][TouchButton]>][]);
const circleHitsRect = (c: { x: number; y: number; r: number }, R: Rect) => {
  const dx = c.x - Math.max(R.l, Math.min(R.r, c.x)), dy = c.y - Math.max(R.t, Math.min(R.b, c.y));
  return Math.hypot(dx, dy) < c.r - EPS;
};
const inside = (p: { x: number; y: number }, R: Rect) => p.x >= R.l - EPS && p.x <= R.r + EPS && p.y >= R.t - EPS && p.y <= R.b + EPS;
const centre = (R: Rect) => ({ x: (R.l + R.r) / 2, y: (R.t + R.b) / 2 });
const tag = (c: Case) => `${c.w}x${c.h} ${JSON.stringify(c.insets)} top${c.top} ${JSON.stringify(c.prefs)}`;

describe('touch layout matrix', () => {
  it('keeps every control inside the bands, apart, big enough, and routes each region', () => {
    let checked = 0;
    for (const c of cases()) {
      const L = computeLayout(c.w, c.h, c.insets, c.top, c.prefs), B = L.bands, why = tag(c);
      expect(L.cramped, why).toBe(false);
      const list = spots(L);
      for (const [name, s] of list) {
        expect(s.x - s.r >= B.l - EPS && s.x + s.r <= B.r + EPS && s.y - s.r >= B.t - EPS && s.y + s.r <= B.b + EPS, `${why} ${name} in bands`).toBe(true);
        expect(2 * s.r, `${why} ${name} size`).toBeGreaterThanOrEqual(44);
        if (name === 'fire') expect(2 * s.r, `${why} fire size`).toBeGreaterThanOrEqual(68);
        expect(routeTouch(L, s.x, s.y), `${why} ${name} route`).toEqual({ kind: 'button', button: name });
        expect(circleHitsRect(s, L.lookPad), `${why} ${name} vs look pad`).toBe(false);
        if (L.stickZone) expect(circleHitsRect(s, L.stickZone), `${why} ${name} vs stick zone`).toBe(false);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const [a, p] = list[i], [b, q] = list[j];
        expect(Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r, `${why} gap ${a}-${b}`).toBeGreaterThanOrEqual(8 - EPS);
      }
      const padW = L.lookPad.r - L.lookPad.l, padH = L.lookPad.b - L.lookPad.t;
      if (L.variant === 'normal') expect(padW, `${why} pad`).toBeGreaterThanOrEqual(60);
      if (L.variant === 'portrait') expect(padH, `${why} pad`).toBeGreaterThanOrEqual(44);
      // Landscape: a hit circle beside the island or notch (vertically centred) stays out of the side insets.
      if (c.w > c.h) for (const [name, s] of list) if (Math.abs(s.y - c.h / 2) < 70 + s.r) {
        expect(s.x - s.r >= c.insets.left - EPS && s.x + s.r <= c.w - c.insets.right + EPS, `${why} ${name} beside the cutout`).toBe(true);
      }
      // Only a thin strip at each physical edge is ignored, whatever the safe-area insets.
      expect([B.l, c.w - B.r], why).toEqual([12, 12]);
      expect(c.h - B.b, why).toBeLessThanOrEqual(Math.max(12, (c.w > c.h ? c.insets.bottom : c.insets.bottom) - 8) + EPS);
      expect(routeTouch(L, centre(L.lookPad).x, centre(L.lookPad).y).kind, `${why} pad route`).toBe('look');
      expect(routeTouch(L, B.l - 5, c.h / 2).kind, why).toBe('ignore');
      expect(routeTouch(L, c.w / 2, B.b + 5).kind, why).toBe('ignore');
      // The zone the stick would use (unflipped layout with tap controls off) routes to look when the tap pad is on.
      const Z2 = computeLayout(c.w, c.h, c.insets, c.top, { ...c.prefs, tapPad: false }).stickZone!;
      if (L.stickZone) {
        const z = L.stickZone;
        expect(z.r - z.l, `${why} zone width`).toBeGreaterThanOrEqual(Math.min(120, .4 * c.w) - EPS);
        expect(z.b - z.t, `${why} zone height`).toBeGreaterThanOrEqual(100);
        expect(inside(L.ghost!, z), `${why} ghost`).toBe(true);
        expect(routeTouch(L, centre(z).x, centre(z).y).kind, why).toBe('stick');
      } else {
        expect(L.ghost).toBeNull();
        expect(routeTouch(L, centre(Z2).x, centre(Z2).y).kind, `${why} tap pad zone`).toBe('look');
      }
      checked++;
    }
    expect(checked).toBe(3 * 2 * 4 * (8 * 2 + 5 * 3 * 2));
  });
  it('mirrors every x when flipped, with the side insets swapped', () => {
    for (const c of cases()) {
      if (!c.prefs.flip) continue;
      const F = computeLayout(c.w, c.h, c.insets, c.top, c.prefs);
      const N = computeLayout(c.w, c.h, { ...c.insets, left: c.insets.right, right: c.insets.left }, c.top, { ...c.prefs, flip: false });
      const m = (R: Rect | null) => R && { l: c.w - R.r, r: c.w - R.l, t: R.t, b: R.b };
      const close = (a: unknown, b: unknown) => expect(JSON.stringify(a, (_, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)).toBe(JSON.stringify(b, (_, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v));
      close(F.bands, m(N.bands)); close(F.lookPad, m(N.lookPad)); close(F.stickZone, m(N.stickZone));
      close(F.ghost, N.ghost && { x: c.w - N.ghost.x, y: N.ghost.y });
      for (const [name, s] of spots(N)) close(F.buttons[name], { ...s, x: c.w - s.x });
      expect([F.k, F.variant, F.cramped]).toEqual([N.k, N.variant, N.cramped]);
      // The real bands match the unflipped layout with the real insets.
      close(F.bands, computeLayout(c.w, c.h, c.insets, c.top, { ...c.prefs, flip: false }).bands);
    }
  });
});

describe('touch layout fit and variants', () => {
  const all = (size = 1): LayoutPrefs => ({ size, flip: false, fire: true, aim: true, tapPad: false });
  const b21 = { top: 0, right: 59, bottom: 21, left: 59 };
  it('switches a very short landscape to the compact table and keeps the rest normal', () => {
    for (const ins of [Z, b21]) {
      const L = computeLayout(568, 262, ins, 64, all());
      expect([L.variant, L.cramped]).toEqual(['compact', false]);
      expect(L.k).toBeCloseTo(.85, 9);
    }
    const a = computeLayout(852, 350, b21, 64, all(1.2));
    expect(a.variant).toBe('normal'); expect(a.k).toBeCloseTo(1.2 * 350 / 390, 9);
    const b = computeLayout(852, 300, b21, 64, all(1.2)); // height-capped: Rise's top sits exactly on the top band
    expect(b.variant).toBe('normal'); expect(b.k).toBeCloseTo((300 - 21 - 64) / 230, 9);
    expect(b.buttons.rise!.y - b.buttons.rise!.r).toBeCloseTo(b.bands.t, 9);
    expect(computeLayout(844, 340, b21, 64, all(1.2)).variant).toBe('normal');
    expect(computeLayout(667, 320, Z, 64, all()).variant).toBe('normal');
    expect(computeLayout(393, 852, Z, 111, all()).variant).toBe('portrait');
  });
  it('places the exact table centres at k = 1 (852x393, no insets)', () => {
    const L = computeLayout(852, 393, Z, 64, all());
    expect(L.k).toBe(1); expect(L.R).toBe(64);
    expect(L.bands).toEqual({ l: 12, r: 840, t: 64, b: 381 });
    for (const name of ['fire', 'aim', 'rise', 'descend'] as const) {
      const t = LAYOUT_TABLES.normal[name];
      expect(L.buttons[name]).toEqual({ x: 840 - t.dx, y: 381 - t.dy, r: t.r, visual: t.vis });
    }
    const left = 840 - 200 - 36;
    expect(L.stickZone).toEqual({ l: 12, t: .3 * 393, r: Math.min(.45 * 852, left - 12), b: 381 });
    expect(L.lookPad).toEqual({ l: .45 * 852, r: left, t: 64, b: 381 });
    expect(L.ghost).toEqual({ x: 12 + 130, y: 381 - 96 });
  });
  it('keeps the landscape cluster on the right thumb (iPhone 15 insets): Fire ~118 px in, Descend in the corner', () => {
    const L = computeLayout(852, 393, b21, 64, all()), f = L.buttons.fire!, d = L.buttons.descend!;
    expect(L.k).toBe(1);
    expect(852 - f.x).toBeGreaterThanOrEqual(110); expect(852 - f.x).toBeLessThanOrEqual(130);
    expect(393 - f.y).toBeGreaterThanOrEqual(90); expect(393 - f.y).toBeLessThanOrEqual(115);
    expect(d.x).toBeGreaterThan(f.x); expect(d.y).toBeGreaterThan(f.y); // Descend to the corner side of Fire
    for (const s of Object.values(L.buttons)) expect(Math.hypot(852 - 12 - s!.x, 393 - 21 - s!.y)).toBeLessThanOrEqual(215);
  });
  it('arcs the portrait cluster on the corner: Fire nearest the corner, every centre within 220 px', () => {
    for (const [w, h, ins] of [[393, 852, { top: 59, right: 0, bottom: 34, left: 0 }], [393, 659, Z]] as const) {
      const L = computeLayout(w, h, ins, 111, all()), ax = w - 12, ay = h - Math.max(12, ins.bottom);
      const d = (b: TouchButton) => Math.hypot(ax - L.buttons[b]!.x, ay - L.buttons[b]!.y);
      for (const b of ['aim', 'rise', 'descend'] as const) { expect(d(b)).toBeLessThanOrEqual(220); expect(d(b)).toBeGreaterThan(d('fire')); }
      expect(L.buttons.aim!.y).toBeLessThan(L.buttons.fire!.y); expect(L.buttons.descend!.x).toBeLessThan(L.buttons.fire!.x);
      expect(L.lookPad.b).toBeLessThan(Math.min(...Object.values(L.buttons).map(s => s!.y - s!.r)));
    }
  });
  it('moves Rise into Fire\'s spot with the blaster off, hides Aim when asked, and keeps Rise and Descend with the tap pad', () => {
    const off = computeLayout(852, 393, Z, 64, { ...all(), fire: false, aim: true });
    expect(Object.keys(off.buttons).sort()).toEqual(['descend', 'rise']);
    expect(off.buttons.rise).toMatchObject({ x: 840 - 106, y: 381 - 88, r: 40 });
    expect(Object.keys(computeLayout(852, 393, Z, 64, { ...all(), aim: false }).buttons).sort()).toEqual(['descend', 'fire', 'rise']);
    // Tap controls: the stick goes, but Rise (lift off) and Descend (land) stay, since they need no drag.
    const tap = computeLayout(852, 393, Z, 64, { ...all(), aim: false, tapPad: true });
    expect(Object.keys(tap.buttons).sort()).toEqual(['descend', 'fire', 'rise']); expect(tap.stickZone).toBeNull(); expect(tap.ghost).toBeNull();
    expect(routeTouch(tap, 200, 300).kind).toBe('look');
  });
  it('is cramped only when the height cannot fit the cluster at k = .74', () => {
    const L = computeLayout(568, 180, Z, 64, all());
    const availH = L.bands.b - L.bands.t;
    expect(availH).toBeLessThan(.74 * 150);
    expect([L.cramped, L.k, L.variant]).toEqual([true, .74, 'compact']);
    for (const c of cases()) {
      const M = computeLayout(c.w, c.h, c.insets, c.top, c.prefs);
      expect(M.cramped).toBe(false);
    }
  });
  it('starts touches where thumbs rest, inside the side insets and the bottom strip (iPhone 15 landscape)', () => {
    const L = computeLayout(852, 393, b21, 64, all());
    for (const [x, y] of [[70, 300], [100, 300], [150, 355], [150, 330], [20, 370]]) expect(routeTouch(L, x, y), `${x},${y}`).toEqual({ kind: 'stick' });
    for (const [x, y] of [[790, 250], [835, 150], [600, 370]]) expect(routeTouch(L, x, y), `${x},${y}`).toEqual({ kind: 'look' });
    for (const [x, y] of [[8, 300], [846, 200], [400, 385]]) expect(routeTouch(L, x, y), `${x},${y}`).toEqual({ kind: 'ignore' });
  });
  it('routes a button before the bands, the stick zone before look, and ignores outside the bands', () => {
    const L = computeLayout(844, 390, b21, 64, all());
    expect(routeTouch(L, 10, 200)).toEqual({ kind: 'ignore' });
    expect(routeTouch(L, 834, 200)).toEqual({ kind: 'ignore' });
    expect(routeTouch(L, 400, 20)).toEqual({ kind: 'ignore' });
    const z = L.stickZone!;
    expect(routeTouch(L, z.l + 1, z.b - 1)).toEqual({ kind: 'stick' });
    expect(routeTouch(L, z.l + 1, z.t - 1)).toEqual({ kind: 'look' });
    const f = L.buttons.fire!;
    expect(routeTouch(L, f.x + f.r * .99, f.y)).toEqual({ kind: 'button', button: 'fire' });
    expect(routeTouch(L, f.x + f.r * 1.01, f.y)).toEqual({ kind: 'look' });
  });
});
