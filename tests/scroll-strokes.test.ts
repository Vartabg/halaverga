import { expect, test } from 'vitest';
import { ScrollStroke, edgeFreshness } from '../src/game/trackpadFlight';
const sample = (deltaY: number, momentum?: boolean) => ({ deltaX: 0, deltaY, deltaMode: 0, momentum });
test('momentum never changes throttle, including immediately after stop/restart', () => {
  const stroke = new ScrollStroke();
  expect(stroke.apply(.3, sample(-100, true), 10, 1000)).toBe(.3);
  stroke.stop(20);
  expect(stroke.apply(.3, sample(-100, true), 21, 1000)).toBe(.3);
  expect(stroke.apply(.3, sample(-40, false), 22, 1000)).toBeGreaterThan(.3);
});
test('stroke caps are independent of event partitioning and direction reversal responds', () => {
  const one = new ScrollStroke(), many = new ScrollStroke();
  const result = one.apply(.3, sample(-400, false), 10, 1000);
  let divided = .3;
  for (let i = 0; i < 20; i++) divided = many.apply(divided, sample(-20, false), 10 + i * 5, 1000);
  expect(divided).toBeCloseTo(result, 8);
  expect(result).toBeLessThanOrEqual(.5);
  expect(many.apply(result, sample(40, false), 120, 1000)).toBeLessThan(result);
});
test('unknown momentum tails need a quiet gap, and horizontal/invalid input stays neutral', () => {
  const stroke = new ScrollStroke(); stroke.stop(0);
  expect(stroke.apply(.3, sample(-100), 100, 1000)).toBe(.3);
  expect(stroke.apply(.3, sample(-100), 200, 1000)).toBe(.3);
  expect(stroke.apply(.3, sample(-40), 500, 1000)).toBeGreaterThan(.3);
  expect(stroke.apply(.3, { ...sample(-20), deltaX: 200 }, 800, 1000)).toBe(.3);
  expect(stroke.apply(.3, sample(NaN), 1000, 1000)).toBe(.3);
});
test('normalized units and reverse preference preserve useful input', () => {
  const line = new ScrollStroke(), pixel = new ScrollStroke(), reversed = new ScrollStroke();
  expect(line.apply(.3, { ...sample(-2), deltaMode: 1 }, 0, 1000)).toBe(pixel.apply(.3, sample(-32), 0, 1000));
  expect(reversed.apply(.3, sample(-32), 0, 1000, true)).toBeLessThan(.3);
});
test('recent edge steering fades without assuming a physical finger release', () => {
  expect(edgeFreshness(0)).toBe(1); expect(edgeFreshness(.18)).toBeGreaterThan(0);
  expect(edgeFreshness(.5)).toBe(0); expect(edgeFreshness(10)).toBe(0);
});
