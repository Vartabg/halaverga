import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAB_STATS_KEY, STROKE_LOG_CAP } from '@/game/gesture/tuning';
import type { Scheme, StrokeClass, StrokeView } from '@/game/gesture/types';
import {
  clearStats, count, createProbe, emptyStats, FRAME_BINS, LAB_IDS, loadStats, percentile, rate, recordAbort, recordFrame,
  recordStroke, revive, sampleProbe, saveStats, statsTable, type StatStorage,
} from '@/ui/gesture/labStats';
import { createStrokeLog, instrumentScheme } from '@/ui/gesture/strokeLog';

const throwing: StatStorage = {
  getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); },
};
function memory(): StatStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
}
function stroke(n: number, x0 = 0, id = 1): StrokeView {
  return {
    pointerId: id, kind: 'touch', count: n, x: i => x0 + i * 5, y: i => 100 + i, t: i => 1000 + i * 16,
    startX: x0, startY: 100, startT: 1000, lastX: x0 + (n - 1) * 5, lastY: 100 + n - 1, lastT: 1000 + (n - 1) * 16,
    arc: n * 5, chord: n * 5, minX: x0, minY: 100, maxX: x0 + n * 5, maxY: 100 + n, winding: 0, straightness: 1,
    speed60: 0.3, speed150: 0.3, travel: n * 5,
  };
}
const cls = (kind: StrokeClass['kind']): StrokeClass => ({ kind, dir: kind === 'swipe' ? 'right' : null, angle: 0, magnitude: 0.5,
  winding: 0, speed: 1.2, chordX: 10, chordY: 0 });

describe('labStats storage', () => {
  it('survives a throwing storage with an empty, render-safe state', () => {
    const st = loadStats(throwing);
    expect(st).toEqual(emptyStats());
    expect(saveStats(st, throwing)).toBe(false);
    expect(() => clearStats(throwing)).not.toThrow();
    const rows = statsTable(st);
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      expect(r.values).toHaveLength(LAB_IDS.length);
      for (const v of r.values) expect(v).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('returns an empty state for no storage, corrupt JSON, or another version', () => {
    const m = memory();
    expect(loadStats(null)).toEqual(emptyStats());
    m.data.set(LAB_STATS_KEY, '{not json');
    expect(loadStats(m)).toEqual(emptyStats());
    m.data.set(LAB_STATS_KEY, JSON.stringify({ v: 2, schemes: {} }));
    expect(loadStats(m)).toEqual(emptyStats());
  });

  it('revives only known, finite, non-negative fields', () => {
    const st = revive({ v: 1, schemes: { draw: { ms: -5, attempts: 'x', counts: { taps: 3, bogus: 9 }, aborts: { slow: 2, '__proto__': 1, 'no spaces': 4 },
      frames: [1, null, 3], beauty: 7, control: 4, firstSuccessMs: 1200 } } });
    const d = st.schemes.draw;
    expect(d.ms).toBe(0); expect(d.attempts).toBe(0); expect(d.counts.taps).toBe(3);
    expect('bogus' in d.counts).toBe(false);
    expect(d.aborts).toEqual({ slow: 2 });
    expect(d.frames.slice(0, 3)).toEqual([1, 0, 3]); expect(d.frames).toHaveLength(FRAME_BINS);
    expect(d.beauty).toBe(0); expect(d.control).toBe(4); expect(d.firstSuccessMs).toBe(1200);
  });
});

describe('labStats metrics', () => {
  it('accumulate per scheme and round-trip through storage', () => {
    const st = emptyStats(), m = memory();
    recordFrame(st, 'draw', 16, 13); recordFrame(st, 'draw', 16, 20); recordFrame(st, 'draw', 5000, 99);
    recordStroke(st, 'draw', 'swipe', true, 4); recordStroke(st, 'draw', 'nudge', false, 2);
    recordStroke(st, 'brush', 'circle', true, 6);
    count(st, 'draw', 'bottomRejects'); count(st, 'draw', 'edgeRejects', 2); count(st, 'conduct', 'pointerCancels');
    recordAbort(st, 'draw', 'slow'); recordAbort(st, 'draw', 'slow'); recordAbort(st, 'draw', 'bad reason!');
    rate(st, 'draw', 5, 0); rate(st, 'draw', 0, 3); rate(st, 'draw', 9, 9);
    const d = st.schemes.draw;
    expect(d.ms).toBe(32);
    expect(d.speedSum / d.ms).toBeCloseTo(16.5); expect(d.speedMax).toBe(20);
    expect(d.attempts).toBe(2); expect(d.recognised.swipe).toBe(1); expect(d.rejected.nudge).toBe(1);
    expect(d.latencySum / d.latencyN).toBe(3); expect(d.firstSuccessMs).toBe(32);
    expect(d.counts.bottomRejects).toBe(1); expect(d.counts.edgeRejects).toBe(2); expect(d.aborts).toEqual({ slow: 2 });
    expect(d.beauty).toBe(5); expect(d.control).toBe(3);
    expect(st.schemes.brush.recognised.circle).toBe(1); expect(st.schemes.brush.counts.bottomRejects).toBe(0);
    expect(st.schemes.conduct.counts.pointerCancels).toBe(1); expect(st.schemes.standard).toEqual(emptyStats().schemes.standard);
    expect(saveStats(st, m)).toBe(true);
    expect(loadStats(m)).toEqual(st);
    const table = statsTable(st), col = LAB_IDS.indexOf('draw');
    expect(table.find(r => r.label === 'Recognised')!.values[col]).toBe('50%');
    expect(table.find(r => r.label === 'Bottom-band rejects')!.values[col]).toBe('1');
    expect(table.find(r => r.label === 'Draw aborts')!.values[col]).toBe('slow 2');
    expect(table.find(r => r.label === 'How beautiful?')!.values[col]).toBe('5/5');
  });

  it('reads frame percentiles from the histogram', () => {
    const st = emptyStats();
    for (let i = 0; i < 90; i++) recordFrame(st, 'conduct', 16.6, 0);
    for (let i = 0; i < 10; i++) recordFrame(st, 'conduct', 40, 0);
    expect(percentile(st.schemes.conduct.frames, 0.5)).toBe(17);
    expect(percentile(st.schemes.conduct.frames, 0.95)).toBe(41);
    expect(percentile(emptyStats().schemes.draw.frames, 0.5)).toBe(-1);
  });

  it('counts probe edges: taps, hits, kills, overheats, burst truncations, clearance, landings', () => {
    const st = emptyStats(), prev = createProbe(), now = createProbe();
    prev.flying = true;
    Object.assign(now, prev, { gestureFire: true, presses: 1, flying: true });
    sampleProbe(st, 'brush', prev, now);
    Object.assign(now, { hits: 2, kills: 1, locked: true, clearance: true, gestureFire: false });
    sampleProbe(st, 'brush', prev, now);
    sampleProbe(st, 'brush', prev, now); // no new edges
    Object.assign(now, { locked: false, clearance: false, flying: false });
    sampleProbe(st, 'brush', prev, now);
    expect(st.schemes.brush.counts).toMatchObject({ taps: 1, hits: 2, kills: 1, overheats: 1, truncations: 1, clearance: 1, landings: 1 });
  });
});

describe('strokeLog', () => {
  it('caps the ring at 50 and exports valid JSON', () => {
    const log = createStrokeLog();
    expect(log.cap).toBe(STROKE_LOG_CAP);
    for (let i = 0; i < 60; i++) log.push('draw', stroke(4 + (i % 3), i), cls('swipe'));
    expect(log.size).toBe(50);
    expect(log.at(0)!.xyt[0]).toBe(10); // strokes 0-9 were dropped
    expect(log.at(49)!.xyt[0]).toBe(59);
    const out = JSON.parse(log.exportJson());
    expect(out.v).toBe(1);
    expect(out.strokes).toHaveLength(50);
    expect(out.strokes[0]).toMatchObject({ scheme: 'draw', pointer: 'touch', kind: 'swipe', dir: 'right' });
    expect(out.strokes[0].points[1]).toEqual([15, 101, 16]);
  });

  it('reuses slot arrays once the ring is full', () => {
    const log = createStrokeLog(2);
    log.push('brush', stroke(8), null); log.push('brush', stroke(8), null);
    const first = log.at(0)!.xyt;
    log.push('brush', stroke(8), null); log.push('brush', stroke(8), null);
    expect(log.at(0)!.xyt).toBe(first);
    expect(log.at(0)!.kind).toBe('none');
  });

  it('instrumentScheme logs and counts strokes, skips taps, and passes every call through', () => {
    const calls: string[] = [], seen: [string, boolean, number][] = [];
    const inner: Scheme = { id: 'brush', down: () => calls.push('down'), move: () => calls.push('move'), up: (_, c) => calls.push(`up:${c.kind}`),
      cancel: () => calls.push('cancel'), step: () => calls.push('step'), reset: () => calls.push('reset'), fallback: a => calls.push(a) };
    const log = createStrokeLog();
    const w = instrumentScheme(inner, 'brush', { log, now: () => 1100, stroke: (k, ok, l) => seen.push([k, ok, l]) });
    const s = stroke(5);
    w.down(s); w.move(s); w.up(s, cls('swipe')); w.up(s, cls('tap')); w.up(s, cls('nudge')); w.cancel(); w.reset(); w.fallback('soar');
    w.step(1 / 60, { x: 0, y: 0, z: 0 }, { canLand: () => true, pathClear: () => true, groundBelow: () => Infinity, clock: 0, land() {}, say() {} });
    expect(calls).toEqual(['down', 'move', 'up:swipe', 'up:tap', 'up:nudge', 'cancel', 'reset', 'soar', 'step']);
    expect(seen).toEqual([['swipe', true, 36], ['nudge', false, 36]]);
    expect(log.size).toBe(3);
    expect(w.hover).toBeUndefined();
  });

  it('instrumentScheme keeps scheme extras reachable (bound methods, live fields)', () => {
    let handled = 0;
    const inner = { id: 'draw' as const, down() {}, move() {}, up() {}, cancel() {}, step() {}, reset() {}, fallback() {},
      view: { committed: false }, flyToMode: false, handle(o: { type: string }) { handled++; return o.type === 'brake'; } };
    const w = instrumentScheme(inner, 'draw', { log: createStrokeLog(), now: () => 0, stroke() {} }) as unknown as typeof inner;
    inner.view.committed = true;
    expect(w.view.committed).toBe(true);
    w.flyToMode = true;
    expect(inner.flyToMode).toBe(true);
    expect(w.handle({ type: 'brake' })).toBe(true);
    expect(w.handle).toBe(w.handle); // bound once, no per-call allocation
    expect(handled).toBe(1);
  });
});

describe('no network', () => {
  it('labStats and strokeLog never call a network API', () => {
    for (const f of ['src/ui/gesture/labStats.ts', 'src/ui/gesture/strokeLog.ts']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource|navigator\./);
    }
  });
});
