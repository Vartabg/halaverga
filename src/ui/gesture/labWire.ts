// Gesture Lab wiring for LabControls (split out to keep both files under 200 lines): builds each scheme with its host, and
// counts the surface outputs the lab stats track. GestureSurface itself fires the aimed shots, drives the hold guide, looks,
// and hands Conduct's outputs to its handle().
import { lockBurst } from '@/game/gesture/aimedShot';
import { createBrushScheme, type BrushHost } from '@/game/gesture/brushScheme';
import { createConductScheme } from '@/game/gesture/conductScheme';
import { createDrawScheme } from '@/game/gesture/drawScheme';
import { createLasso, lassoBegin, lassoClose, lassoSample } from '@/game/gesture/lasso';
import { labAimFrame, project } from '@/game/gesture/screenRay';
import type { ArbiterOut, Scheme } from '@/game/gesture/types';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import type { LabScheme } from './LabFallback';
import { reportGuide } from './guideSteps';
import { count, labStats } from './labStats';
import { REJECT_BOTTOM } from './pointerArbiter';

/** A swipe down that ends within this many px of the land target's screen point lands there. */
const LAND_AT_PX = 64;
const screen = { x: 0, y: 0 };
const frame = () => (labAimFrame.t > 0 ? labAimFrame : null);
const flying = () => useGame.getState().flying;
/** Moves the lab hit marker (see markTap) to a screen point. */
function markAt(x: number, y: number) {
  const st = document.documentElement.style;
  st.setProperty('--lab-tap-x', `${Math.round(x)}px`); st.setProperty('--lab-tap-y', `${Math.round(y)}px`);
}

/** Brush's host over the runtime, the lasso and the aimed-shot chain. One lasso and one scratch slot, reused. */
function brushHost(): BrushHost {
  const s = runtime.shooter, lasso = createLasso(), one = new Int8Array(1);
  return {
    flying, yaw: () => runtime.yaw, pitch: () => runtime.pitch, clearance: () => runtime.clearance.active,
    clearanceNormal: () => runtime.clearance.normal, landTarget: () => runtime.landTarget, guide: ev => { reportGuide(ev); },
    landAt(x, y) {
      const t = runtime.landTarget, f = frame();
      return !!t && !!f && project(f, t, screen) && Math.hypot(screen.x - x, screen.y - y) <= LAND_AT_PX;
    },
    lassoBegin: (x, y, t) => { lassoBegin(lasso); lassoSample(lasso, x, y, t, s.targets, s.drones.count); },
    lassoAdd: (x, y, t) => lassoSample(lasso, x, y, t, s.targets, s.drones.count),
    // Brush passes its own closure verdict (a circle or lasso class, or a chord within the closure gap).
    lassoEnd: closed => lassoClose(lasso, closed),
    // The hit marker goes to the first locked drone (a tap's marker sits at the tap; a lasso has no tap point).
    lockBurst() {
      const f = frame(), d = lasso.count > 0 ? lasso.locks[0] : -1;
      if (lockBurst(s, lasso.locks, lasso.count) > 0 && f && d >= 0 && d < s.targets.length && project(f, s.targets[d].c, screen)) markAt(screen.x, screen.y);
    },
    lockNearest() {
      const p = runtime.position, n = Math.min(s.drones.count, s.targets.length);
      let best = -1, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const g = s.targets[i];
        if (!g.alive || !g.los) continue;
        const d = (g.c.x - p.x) ** 2 + (g.c.y - p.y) ** 2 + (g.c.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return false;
      one[0] = best;
      return lockBurst(s, one, 1) > 0;
    },
  };
}
export function buildScheme(id: LabScheme): Scheme {
  const guide = (ev: Parameters<typeof reportGuide>[0]) => { reportGuide(ev); };
  if (id === 'conduct') return createConductScheme({ frame, view: runtime, guide, reduced: () => useGame.getState().reduced });
  if (id === 'brush') return createBrushScheme(brushHost());
  return createDrawScheme({ view: runtime, clearance: () => runtime.clearance.active, guide, flying });
}

/** GestureSurface's onAction: start-filter rejects (edge and header strips vs the bottom band) and dropped strokes. */
export function countLabOut(id: LabScheme, o: Readonly<ArbiterOut>) {
  if (o.type === 'reject') count(labStats(), id, o.drone === REJECT_BOTTOM ? 'bottomRejects' : 'edgeRejects');
  else if (o.type === 'cancel') count(labStats(), id, 'pointerCancels');
}

/** Tap to Blast has no crosshair: the shooter HUD (hit marker, heat ring) moves to the latest shot's tap point (CSS variables that
 * html[data-controls] reads). */
export function markTap(o: Readonly<ArbiterOut>) {
  if (o.type === 'burst' || o.type === 'blastNow' || o.type === 'miss' || o.type === 'sustain') markAt(o.x, o.y);
}
