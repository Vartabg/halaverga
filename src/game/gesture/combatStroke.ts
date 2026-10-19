// War in Heaven strokes (Garo 2026-10-19: "Strokes"). A finger that lands on a demon draws a command instead of flying:
// tap = rebuke, swipe through = flaming sword, circle around = bind with a chain, flick down = cast into the abyss.
// Pure and allocation-free after load: a fixed point buffer, decimated in place when it fills.
export type StrokeKind = 'tap' | 'swipe' | 'circle' | 'flick';
export const STROKE = { tapSlop: 16, minSwipe: 40, flickSpeed: .5, flickDown: .7, closeRatio: .4, minLoop: 90, loopTurn: 4.2, step: 4 } as const;
const N = 64;

export function createStroke() {
  return { id: -1, drone: -1, n: 0, x: new Float32Array(N), y: new Float32Array(N), t: new Float64Array(N) };
}
export type Stroke = ReturnType<typeof createStroke>;

export function beginStroke(s: Stroke, id: number, drone: number, x: number, y: number, t: number) {
  s.id = id; s.drone = drone; s.n = 1; s.x[0] = x; s.y[0] = y; s.t[0] = t;
}
/** Records a point once it moved STROKE.step px; a full buffer keeps every other point, so long strokes keep their shape. */
export function addStroke(s: Stroke, x: number, y: number, t: number) {
  if (s.id < 0) return;
  const k = s.n - 1;
  if (Math.hypot(x - s.x[k], y - s.y[k]) < STROKE.step) { s.t[k] = Math.max(s.t[k], t); return; }
  if (s.n === N) {
    for (let i = 1; i < N / 2; i++) { s.x[i] = s.x[i * 2]; s.y[i] = s.y[i * 2]; s.t[i] = s.t[i * 2]; }
    s.n = N / 2;
  }
  s.x[s.n] = x; s.y[s.n] = y; s.t[s.n] = t; s.n++;
}
export const cancelStroke = (s: Stroke) => { s.id = -1; s.drone = -1; s.n = 0; };

/** What the recorded stroke was. A short wobble is a tap; a closed, turning loop is a circle; a fast drop is a flick. */
export function classifyStroke(s: Stroke): StrokeKind {
  const n = s.n;
  let len = 0, turn = 0, px = 0, py = 0, has = false;
  for (let i = 1; i < n; i++) {
    const dx = s.x[i] - s.x[i - 1], dy = s.y[i] - s.y[i - 1], l = Math.hypot(dx, dy);
    len += l;
    if (l < 2) continue;
    if (has) { let a = Math.atan2(dy, dx) - Math.atan2(py, px); a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI; turn += a; }
    px = dx; py = dy; has = true;
  }
  if (len <= STROKE.tapSlop) return 'tap';
  const cx = s.x[n - 1] - s.x[0], cy = s.y[n - 1] - s.y[0], chord = Math.hypot(cx, cy), dur = Math.max(1, s.t[n - 1] - s.t[0]);
  if (len >= STROKE.minLoop && Math.abs(turn) >= STROKE.loopTurn && chord <= STROKE.closeRatio * len) return 'circle';
  if (chord >= STROKE.minSwipe && cy >= STROKE.flickDown * chord && chord / dur >= STROKE.flickSpeed) return 'flick';
  return len >= STROKE.minSwipe ? 'swipe' : 'tap';
}
