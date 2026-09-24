import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StrokeBuffer } from '../src/game/gesture/strokeBuffer';
import {
  brushCircle, classify, fastCircle, isHold, isTap, pointInPolygon, straightFast, tangentialSpeed, winding300,
  type Variant,
} from '../src/game/gesture/strokeFeatures';
import type { PointerKind, StrokeKind } from '../src/game/gesture/types';

// Fixture format (version 1). Synthetic now; Garo's strokeLog exports use the same shape with source 'strokeLog'.
// samples are [x px, y px, t ms]; expect is keyed by scheme and may list any subset of schemes.
type Expect = { kind: StrokeKind; dir?: string | null; sign?: 1 | -1 };
type Fixture = { version: 1; name: string; source: 'synthetic' | 'strokeLog'; pointer: PointerKind;
  samples: [number, number, number][]; expect: Partial<Record<Variant, Expect>> };

const DIR = fileURLToPath(new URL('./fixtures/strokes/', import.meta.url));
const fixtures: Fixture[] = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(DIR + f, 'utf8')) as Fixture);

/** Seeded uniform in [-1, 1) (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

function at(f: Fixture, t: number): [number, number] {
  const s = f.samples;
  let i = 1;
  while (i < s.length - 1 && s[i][2] < t) i++;
  const a = s[i - 1], b = s[i], u = b[2] > a[2] ? Math.min(1, Math.max(0, (t - a[2]) / (b[2] - a[2]))) : 1;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Replay a fixture at hz with +-jitter px (seeded) into buf; onSample runs after each push (not after begin). */
function replay(f: Fixture, buf: StrokeBuffer, hz: number, jitter: number, seed: number, onSample?: (last: boolean) => void) {
  const r = rng(seed), t0 = f.samples[0][2], end = f.samples[f.samples.length - 1][2], T0 = 5000;
  const [x0, y0] = at(f, t0);
  buf.begin(1, f.pointer, x0 + r() * jitter, y0 + r() * jitter, T0);
  for (let t = t0 + 1000 / hz; ; t += 1000 / hz) {
    const last = t >= end - 1e-6, tt = last ? end : t, [x, y] = at(f, tt);
    buf.push(x + r() * jitter, y + r() * jitter, T0 + tt - t0);
    onSample?.(last);
    if (last) break;
  }
  return buf;
}

const find = (name: string) => fixtures.find((f) => f.name === name)!;

describe('stroke fixtures', () => {
  it('loads the synthetic fixture set', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(14);
    for (const f of fixtures) expect(f.version).toBe(1);
  });

  for (const f of fixtures) for (const [variant, want] of Object.entries(f.expect) as [Variant, Expect][]) {
    it(`${f.name} is ${want.kind}${want.dir ? ' ' + want.dir : ''} in ${variant} at 30/60/120 Hz with 1 px jitter`, () => {
      const buf = new StrokeBuffer();
      for (const hz of [30, 60, 120]) for (let seed = 1; seed <= 4; seed++) {
        const c = classify(replay(f, buf, hz, 1, seed * 97 + hz), variant);
        const tag = `${hz} Hz seed ${seed}`;
        expect(c.kind, tag).toBe(want.kind);
        if (want.dir !== undefined) expect(c.dir, tag).toBe(want.dir);
        if (want.sign) expect(Math.sign(c.winding), tag).toBe(want.sign);
      }
    });
  }
});

describe('stroke features', () => {
  it('a scribble is unknown: a nudge carrying its chord, never a shot', () => {
    const buf = replay(find('scribble'), new StrokeBuffer(), 60, 1, 7);
    for (const v of ['draw', 'conduct', 'brush'] as const) {
      const c = classify(buf, v);
      expect(c.kind).toBe('nudge');
      expect(c.chordX).toBeCloseTo(buf.lastX - buf.startX, 5);
      expect(c.chordY).toBeCloseTo(buf.lastY - buf.startY, 5);
    }
  });

  it('a slow circle in Conduct is not a roll; a fast circle has the right sign', () => {
    const buf = new StrokeBuffer();
    expect(fastCircle(replay(find('circle-slow-large'), buf, 60, 1, 3))).toBe(0);
    expect(classify(buf, 'conduct').kind).not.toBe('circle');
    expect(fastCircle(replay(find('circle-fast-cw'), buf, 60, 1, 3))).toBeGreaterThan(0);
    expect(classify(buf, 'conduct').winding).toBeGreaterThan(0);
    expect(fastCircle(replay(find('circle-fast-ccw'), buf, 60, 1, 3))).toBeLessThan(0);
    expect(classify(buf, 'conduct').winding).toBeLessThan(0);
  });

  it('a flick with a reversal is rejected', () => {
    const c = classify(replay(find('flick-reversal'), new StrokeBuffer(), 120, 0, 1), 'conduct');
    expect(c.kind).not.toBe('flick');
    expect(classify(replay(find('flick-right'), new StrokeBuffer(), 120, 0, 1), 'conduct').kind).toBe('flick');
  });

  it('a 30 px, 200 ms stroke is not a tap; one tap definition with per-kind slop', () => {
    const buf = replay(find('drag-30'), new StrokeBuffer(), 60, 0, 1);
    expect(isTap(buf)).toBe(false);
    expect(classify(buf, 'draw').kind).not.toBe('tap');
    const m = new StrokeBuffer().begin(1, 'mouse', 0, 0, 0); m.push(8, 0, 100);
    expect(isTap(m)).toBe(false);
    const t = new StrokeBuffer().begin(1, 'touch', 0, 0, 0); t.push(8, 0, 100);
    expect(isTap(t)).toBe(true);
    expect(isTap(t, 251)).toBe(false);
    expect(isHold(t, 260)).toBe(true);
    expect(classify(t, 'brush', 300).kind).toBe('hold');
  });

  it('straightFast fires before up on a clean swipe, and never on a circle', () => {
    for (const hz of [30, 60, 120]) {
      let firedBeforeUp = false;
      const buf = new StrokeBuffer();
      replay(find('swipe-left'), buf, hz, 1, hz, (last) => { if (!last && straightFast(buf)) firedBeforeUp = true; });
      expect(firedBeforeUp, `${hz} Hz`).toBe(true);
      let circleFired = false;
      replay(find('circle-fast-cw'), buf, hz, 1, hz, () => { if (straightFast(buf)) circleFired = true; });
      expect(circleFired).toBe(false);
    }
  });

  it('winding300 reads the trailing turn, clockwise positive', () => {
    const buf = replay(find('circle-fast-cw'), new StrokeBuffer(), 120, 0, 1);
    expect(winding300(buf)).toBeGreaterThan(150);
    expect(buf.winding).toBeGreaterThan(330);
  });

  it('a Brush circle of just over 300 deg at r 70 closes (closure admits the minimum-sweep gap)', () => {
    const buf = new StrokeBuffer().begin(1, 'touch', 300, 330, 0);
    for (let i = 1; i <= 120; i++) {
      const a = -Math.PI / 2 + (308 * Math.PI / 180) * (i / 120);
      buf.push(300 + 70 * Math.cos(a), 400 + 70 * Math.sin(a), i * 8);
    }
    expect(brushCircle(buf)).toBeGreaterThan(300);
    expect(classify(buf, 'brush').kind).toBe('circle');
  });

  it('tangentialSpeed is high when stirring and near zero on a radial sweep', () => {
    const stir = new StrokeBuffer().begin(1, 'touch', 340, 400, 0);
    for (let i = 1; i <= 20; i++) { const a = i * 0.1; stir.push(300 + 40 * Math.cos(a), 400 + 40 * Math.sin(a), i * 10); }
    // 40 px * 0.1 rad per 10 ms = 0.4 px/ms = 400 px/s = 66.7 mm/s (the 50 ms chord reads about 1% short).
    expect(Math.abs(tangentialSpeed(stir, 300, 400) / 66.7 - 1)).toBeLessThan(0.02);
    const sweep = new StrokeBuffer().begin(1, 'touch', 340, 400, 0);
    for (let i = 1; i <= 20; i++) sweep.push(340 + i * 4, 400, i * 10);
    expect(tangentialSpeed(sweep, 300, 400)).toBeLessThan(0.5);
  });

  it('pointInPolygon includes the inside and a 12 px band, excludes beyond it', () => {
    const sq = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    sq.push(100, 0, 10); sq.push(100, 100, 20); sq.push(0, 100, 30);
    expect(pointInPolygon(sq, 50, 50)).toBe(true);
    expect(pointInPolygon(sq, 111, 50)).toBe(true);
    expect(pointInPolygon(sq, 50, -11)).toBe(true);
    expect(pointInPolygon(sq, 113, 50)).toBe(false);
    expect(pointInPolygon(sq, 113, 50, 14)).toBe(true);
  });

  it('classify runs in under 1 ms on the 512-sample worst case', () => {
    const buf = new StrokeBuffer().begin(1, 'touch', 300, 400, 0);
    for (let i = 1; i < 700; i++) {
      const a = i * 0.05;
      buf.push(300 + (60 + 10 * Math.sin(i * 0.7)) * Math.cos(a), 400 + 60 * Math.sin(a), i * 4);
    }
    expect(buf.count).toBe(512);
    for (let k = 0; k < 50; k++) for (const v of ['draw', 'conduct', 'brush'] as const) classify(buf, v);
    const runs = 200, t0 = performance.now();
    for (let k = 0; k < runs; k++) classify(buf, k % 3 === 0 ? 'conduct' : 'brush');
    expect((performance.now() - t0) / runs).toBeLessThan(1);
  });
});
