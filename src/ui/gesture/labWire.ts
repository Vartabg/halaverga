// Gesture Lab wiring for LabControls (split out to keep both files under 200 lines): builds each scheme with its host, and
// counts the surface outputs the lab stats track. GestureSurface itself fires the aimed shots, drives the hold guide, looks,
// and hands Conduct's outputs to its handle().
import { lockBurst } from '@/game/gesture/aimedShot';
import { createBrushScheme, type BrushHost } from '@/game/gesture/brushScheme';
import { createConductScheme } from '@/game/gesture/conductScheme';
import { createDrawScheme } from '@/game/gesture/drawScheme';
import { createLasso, lassoBegin, lassoClose, lassoSample } from '@/game/gesture/lasso';
import { labAimFrame } from '@/game/gesture/screenRay';
import type { ArbiterOut, Scheme } from '@/game/gesture/types';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import type { LabScheme } from './LabFallback';
import { count, labStats } from './labStats';
import { REJECT_BOTTOM } from './pointerArbiter';

/** Brush's host over the runtime, the lasso and the aimed-shot chain. One lasso and one scratch slot, reused. */
function brushHost(): BrushHost {
  const s = runtime.shooter, lasso = createLasso(), one = new Int8Array(1);
  return {
    flying: () => useGame.getState().flying, yaw: () => runtime.yaw, clearance: () => runtime.clearance.active,
    landTarget: () => runtime.landTarget,
    lassoBegin: (x, y, t) => { lassoBegin(lasso); lassoSample(lasso, x, y, t, s.targets, s.drones.count); },
    lassoAdd: (x, y, t) => lassoSample(lasso, x, y, t, s.targets, s.drones.count),
    // Brush asks only after its circle test passed, and that test includes the closure check.
    lassoEnd: () => lassoClose(lasso, true),
    lockBurst: () => { lockBurst(s, lasso.locks, lasso.count); },
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
  if (id === 'conduct') return createConductScheme({ frame: () => labAimFrame.t > 0 ? labAimFrame : null,
    reduced: () => useGame.getState().reduced });
  if (id === 'brush') return createBrushScheme(brushHost());
  return createDrawScheme({ view: runtime, clearance: () => runtime.clearance.active });
}

/** GestureSurface's onAction: start-filter rejects (edge and header strips vs the bottom band) and dropped strokes. */
export function countLabOut(id: LabScheme, o: Readonly<ArbiterOut>) {
  if (o.type === 'reject') count(labStats(), id, o.drone === REJECT_BOTTOM ? 'bottomRejects' : 'edgeRejects');
  else if (o.type === 'cancel') count(labStats(), id, 'pointerCancels');
}
