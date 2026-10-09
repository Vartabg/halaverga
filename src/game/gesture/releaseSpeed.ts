// The release speed a flick is judged on (spec 2.5), px/ms. Two measurement artefacts used to hide real flicks: the pointer-up
// sample usually repeats the last point a few ms later (a zero-motion segment that halved the 60 ms speed), and a thumb flick
// eases out, so its last 60 ms are slower than its peak. So: trailing still samples within LIFT_TAIL_MS of the lift are skipped,
// and the speed is the fastest RELEASE_WIN_MS window ending inside the last SPEED_WIN_SHORT_MS of motion (never less than the
// plain 60 ms speed there). A finger that stops and then lifts is still slow: its still tail is longer than LIFT_TAIL_MS. Pure.
import { SPEED_WIN_SHORT_MS } from './tuning';
import type { StrokeView } from './types';

export const STILL_PX = 0.5, LIFT_TAIL_MS = 34, RELEASE_WIN_MS = 40;

/** Path speed over the window of `ms` ending at sample `end`, px/ms. */
function windowSpeed(s: StrokeView, end: number, ms: number): number {
  const from = s.t(end) - ms;
  let i = end - 1, arc = 0;
  while (i > 0 && s.t(i - 1) >= from) i--;
  if (i < 0) return 0;
  for (let k = i + 1; k <= end; k++) arc += Math.hypot(s.x(k) - s.x(k - 1), s.y(k) - s.y(k - 1));
  const span = s.t(end) - s.t(i);
  return span > 1e-6 ? arc / span : 0;
}

export function releaseSpeed(s: StrokeView): number {
  const up = s.count - 1;
  let last = up;
  while (last > 0 && s.t(up) - s.t(last - 1) <= LIFT_TAIL_MS
    && Math.hypot(s.x(last) - s.x(last - 1), s.y(last) - s.y(last - 1)) < STILL_PX) last--;
  if (last < 1) return 0;
  let best = windowSpeed(s, last, SPEED_WIN_SHORT_MS);
  for (let j = last; j > 0 && s.t(last) - s.t(j) <= SPEED_WIN_SHORT_MS; j--) best = Math.max(best, windowSpeed(s, j, RELEASE_WIN_MS));
  return best;
}
