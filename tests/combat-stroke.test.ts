import { describe, expect, it } from 'vitest';
import { addStroke, beginStroke, classifyStroke, createStroke } from '../src/game/gesture/combatStroke';

function draw(points: [number, number][], ms = 16) {
  const s = createStroke(); beginStroke(s, 1, 0, points[0][0], points[0][1], 0);
  points.slice(1).forEach(([x, y], i) => addStroke(s, x, y, (i + 1) * ms));
  return classifyStroke(s);
}
const circle = (r: number, n = 40, turns = 1.05) => Array.from({ length: n + 1 }, (_, i) => {
  const a = i / n * turns * Math.PI * 2; return [200 + r * Math.cos(a), 200 + r * Math.sin(a)] as [number, number];
});
describe('combat strokes', () => {
  it('reads a tap, a swipe, a circle and a flick down', () => {
    expect(draw([[100, 100], [104, 102], [103, 101]])).toBe('tap');
    expect(draw([[100, 100], [140, 110], [180, 120], [230, 130]])).toBe('swipe');
    expect(draw(circle(50))).toBe('circle');
    expect(draw([[200, 100], [202, 140], [203, 190], [204, 240]], 20)).toBe('flick');
  });
  it('a slow drag down is a sword stroke, not a flick', () => {
    expect(draw([[200, 100], [202, 140], [203, 190], [204, 240]], 400)).toBe('swipe');
  });
  it('keeps a long stroke in its fixed buffer', () => {
    expect(draw(circle(60, 300, 2))).toBe('circle');
  });
});
