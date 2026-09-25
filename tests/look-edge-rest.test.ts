import { describe, expect, it } from 'vitest';
import { EdgeRest, REST } from '../src/game/lookEdgeRest';
const W = 852, ZR = 380, FRAME = 1000 / 60;
/** Right-handed landscape: outer edge at W turns right (-1), the stick boundary at ZR turns left (+1). */
const make = (inner: number | null = ZR, flip = false) => {
  const r = new EdgeRest();
  if (flip) r.configure(0, 1, inner === null ? null : W - inner, -1); else r.configure(W, -1, inner, 1);
  return r;
};
/** Moves at a constant speed (px/ms) from x0 to x1 in 60 Hz samples; returns every value and the final time. */
function drag(r: EdgeRest, x0: number, x1: number, speed: number, t0 = 0) {
  const out: number[] = [], n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / (speed * FRAME)));
  r.down(x0, t0);
  let t = t0;
  for (let k = 1; k <= n; k++) { t = t0 + k * FRAME; out.push(r.move(x0 + (x1 - x0) * k / n, t)); }
  return { out, t };
}
describe('EdgeRest', () => {
  it('a slow aim that ends 30 px from the outer edge never arms', () => {
    const r = make(), { out, t } = drag(r, W - 200, W - 30, .1);
    for (let k = 1; k < 60; k++) out.push(r.tick(t + k * FRAME));
    expect(out.every(v => v === 0)).toBe(true);
    expect(r.armed).toBe(false);
  });
  it('a fast outward swipe into the outer band arms after 80 ms and holds while the thumb is still', () => {
    const r = make(), { out, t } = drag(r, W - 320, W - 20, 1.5);
    expect(out.every(v => v === 0)).toBe(true);
    const held: [number, number][] = [];
    for (let k = 1; k <= 60; k++) held.push([k * FRAME, r.tick(t + k * FRAME)]);
    for (const [dt, v] of held) {
      if (dt < REST.dwellMs - FRAME) expect(v).toBe(0);
      if (dt >= REST.dwellMs + FRAME) expect(v).toBeLessThanOrEqual(-.9);
    }
    expect(held[held.length - 1][1]).toBe(held[held.length - 2][1]);
  });
  it('a fast swipe toward the stick side into the inner band turns left (positive)', () => {
    const r = make(), { t } = drag(r, ZR + 300, ZR + 20, 1.5);
    const v = r.tick(t + 120);
    expect(v).toBeGreaterThanOrEqual(.9);
    expect(r.tick(t + 500)).toBe(v);
  });
  it('past the stick boundary counts fully', () => {
    const r = make(), { t } = drag(r, ZR + 300, ZR - 30, 1.5);
    expect(r.tick(t + 120)).toBe(1);
  });
  it('moving back out by more than 8 px disarms; within the hysteresis it stays armed', () => {
    const r = make(), { t } = drag(r, W - 320, W - 20, 1.5);
    expect(r.tick(t + 120)).toBeLessThan(0);
    expect(r.move(W - REST.band - 4, t + 140)).toBe(0); // the factor is 0 at the band's start, but the arming holds
    expect(r.armed).toBe(true);
    expect(r.move(W - 20, t + 400)).toBeLessThanOrEqual(-.9);
    expect(r.move(W - REST.band - REST.hyst - 2, t + 700)).toBe(0);
    expect(r.armed).toBe(false);
    // Coming back slowly never re-arms.
    expect(r.move(W - 20, t + 1400)).toBe(0); expect(r.tick(t + 1600)).toBe(0);
  });
  it('innerX null never arms the inner band', () => {
    const r = make(null), { t } = drag(r, 400, 10, 1.5);
    expect(r.tick(t + 200)).toBe(0);
    expect(r.armed).toBe(false);
  });
  it('flipped mirrors the signs', () => {
    const a = make(ZR, true), { t } = drag(a, 320, 20, 1.5);
    expect(a.tick(t + 120)).toBeGreaterThanOrEqual(.9); // outer edge on the left turns left
    const b = make(ZR, true), m = drag(b, W - ZR - 300, W - ZR - 20, 1.5);
    expect(b.tick(m.t + 120)).toBeLessThanOrEqual(-.9); // stick boundary on the right turns right
  });
  it('down and reset drop the arming', () => {
    const r = make(), { t } = drag(r, W - 320, W - 20, 1.5);
    expect(r.tick(t + 120)).toBeLessThan(0);
    r.reset(); expect(r.tick(t + 200)).toBe(0);
    r.down(W - 20, t + 300); expect(r.tick(t + 500)).toBe(0);
  });
  it('allocates nothing per move or tick', () => {
    for (const fn of ['move', 'tick', 'value', 'step'] as const) {
      const src = (EdgeRest.prototype as unknown as Record<string, () => void>)[fn].toString();
      expect([fn, /\bnew\b|\[|\(\{|=\s*\{/.test(src)]).toEqual([fn, false]);
    }
  });
});
