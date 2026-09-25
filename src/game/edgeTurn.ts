// Edge turns in the physics step (turn-360 spec 1.4). Sources: the pointer (the desktop free cursor while cruising, else the classic
// one-thumb pad; +edgeTurn turns right) and the twin-stick look thumb's edge rest (runtime.stick.edgeTurn; + turns left). Each
// source's level slews linearly (0 to full in EDGE.easeS) toward its target, so an edge turn eases in and out. Yaw runs at 3.5 rad/s
// (2.5 under reduced motion), scaled by the ADS gain with the blaster on; pitch at 1 rad/s. The cursor's exits (runtime.trackpad
// .outside): a side exit holds the turn for up to sideHoldS, a top or bottom exit drops the targets after graceS.
import { runtime } from './runtime';
import { aimGain } from './combat';
import { edgeFreshness } from './trackpadFlight';
export const EDGE = { yaw: 3.5, yawRM: 2.5, pitch: 1.0, easeS: .15, graceS: 1.0, sideHoldS: 6.0 } as const;
type EdgePrefs = { sustainedEdges: boolean; reduced: boolean; shooter: boolean };
/** Module state: which pointer source the levels belong to (0 none, 1 thumb, 2 cursor), and the three slewed levels. */
const lv = { source: 0, turn: 0, pitch: 0, stick: 0 };
const slew = (level: number, target: number, dt: number) => {
  const step = dt / EDGE.easeS;
  return level + Math.max(-step, Math.min(step, target - level));
};
export function applyEdgeTurns(dt: number, g: EdgePrefs, rt = runtime): void {
  const tp = rt.trackpad, source = tp.active ? 2 : rt.thumb.active ? 1 : 0;
  if (source !== lv.source) { lv.source = source; lv.turn = 0; lv.pitch = 0; }
  let turn = 0, pitch = 0;
  if (source !== 0) {
    const pointer = source === 2 ? tp : rt.thumb;
    tp.edgeAge += dt;
    const fresh = source === 2 && !g.sustainedEdges ? edgeFreshness(tp.edgeAge) : 1;
    turn = pointer.edgeTurn * fresh; pitch = pointer.edgePitch * fresh;
    if (source === 2 && tp.outside !== 0) {
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
/** Tests and a new flight: drop the slewed levels. */
export function resetEdgeTurns(): void { lv.source = 0; lv.turn = 0; lv.pitch = 0; lv.stick = 0; }
