// Edge turns in the physics step (turn-360 spec 1.4). Sources: the desktop free cursor while cruising (runtime.trackpad; +edgeTurn
// turns right) and the twin-stick look thumb's edge rest (runtime.stick.edgeTurn; + turns left). Each source's level slews linearly
// (0 to full in EDGE.easeS) toward its target, so an edge turn eases in and out. Yaw runs at 3.5 rad/s (2.5 under reduced motion),
// scaled by the ADS gain with the blaster on; pitch at 1 rad/s. The cursor's exits (runtime.trackpad.outside): a side exit holds
// the turn for up to sideHoldS, a top or bottom exit drops the targets after graceS.
// The classic one-thumb pad is NOT a source here: it keeps main 7945430's direct rate control (thumbTurn below).
import { runtime } from './runtime';
import { aimGain } from './combat';
import { edgeFreshness } from './trackpadFlight';
export const EDGE = { yaw: 3.5, yawRM: 2.5, pitch: 1.0, easeS: .15, graceS: 1.0, sideHoldS: 6.0 } as const;
/** Classic one thumb (main 7945430): yaw 1.5 rad/s at the edge (about 4.2 s per 360), pitch 1 rad/s, no slew, no ADS scaling. */
export const THUMB = { yaw: 1.5, pitch: 1.0 } as const;
type EdgePrefs = { sustainedEdges: boolean; reduced: boolean; shooter: boolean };
/** Module state: which pointer source the levels belong to (0 none, 2 cursor), and the three slewed levels. */
const lv = { source: 0, turn: 0, pitch: 0, stick: 0 };
const slew = (level: number, target: number, dt: number) => {
  const step = dt / EDGE.easeS;
  return level + Math.max(-step, Math.min(step, target - level));
};
export function applyEdgeTurns(dt: number, g: EdgePrefs, rt = runtime): void {
  const tp = rt.trackpad, source = tp.active ? 2 : 0;
  if (source !== lv.source) { lv.source = source; lv.turn = 0; lv.pitch = 0; }
  let turn = 0, pitch = 0;
  if (source === 2) {
    tp.edgeAge += dt;
    const fresh = !g.sustainedEdges ? edgeFreshness(tp.edgeAge) : 1;
    turn = tp.edgeTurn * fresh; pitch = tp.edgePitch * fresh;
    if (tp.outside !== 0) {
      tp.outsideAge += dt;
      if (tp.outsideAge > (tp.outside === 1 ? EDGE.sideHoldS : EDGE.graceS)) turn = pitch = 0;
    }
  }
  lv.turn = slew(lv.turn, turn, dt); lv.pitch = slew(lv.pitch, pitch, dt);
  lv.stick = slew(lv.stick, rt.stick.edgeTurn || 0, dt);
  if (lv.turn === 0 && lv.pitch === 0 && lv.stick === 0) return;
  const rate = (g.reduced ? EDGE.yawRM : EDGE.yaw) * (g.shooter ? aimGain(rt.shooter.aim.blend) : 1);
  rt.yaw += (lv.stick - lv.turn) * rate * dt;
  rt.pitch = Math.max(-1.3, Math.min(1.25, rt.pitch + lv.pitch * EDGE.pitch * dt));
}
/**
 * The classic one-thumb edge hold, main 7945430's lines bit for bit (Garo 2026-09-26: rate control, no slew, gain 1, the same
 * under reduced motion and with the blaster on). Player calls it every step while runtime.thumb.active.
 */
export function thumbTurn(dt: number, rt = runtime): void {
  if (!rt.thumb.active) return;
  rt.yaw -= rt.thumb.edgeTurn * dt * THUMB.yaw;
  rt.pitch = Math.max(-1.3, Math.min(1.25, rt.pitch + rt.thumb.edgePitch * dt * THUMB.pitch));
}
/** Tests and a new flight: drop the slewed levels. */
export function resetEdgeTurns(): void { lv.source = 0; lv.turn = 0; lv.pitch = 0; lv.stick = 0; }
