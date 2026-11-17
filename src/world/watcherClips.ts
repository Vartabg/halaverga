// Which motion-capture clip a Watcher plays, by the blow that struck it and by a warden's attack phase
// (docs/plans/2026-11-16-real-fight.md B7). Plain data and arithmetic: demonActors.ts blends the result.
import { WA } from '@/game/banishState';
import { CLEAVE } from '@/game/wardenTactics';
import { cutClip } from './cutClips';

/**
 * The reaction to a blow. n is the cut of the string that landed (swordString CUTS; -1 for a rebuke, a shot or a shove): the
 * cross cut a body hit, the rising cut a head hit, the casting blow the knock back that throws it down. The plan named `hitHead`
 * for "cut 2" and `knock` for the casting blow, but the string's cut 2 is the casting blow, so the rising cut takes `hitHead`.
 */
export const hitClipName = (n: number) => n === 1 ? 'hitHead' : n === 2 ? 'knock' : 'hit';

/** The stroke each ranged move throws, its impact landing on the bolt release (the start of the phase). */
const STROKE: Record<number, number> = { [WA.fan]: 1, [WA.volley]: 0 };
/** Seconds over which a warden's guard comes in at the tell, and each phase's clip comes in over the last pose. */
export const WARDEN_BLEND = { guard: .25, phase: .08, reduced: .55 } as const;
/** name: a clip in watcher.glb; time: seconds into it; weight: its blend weight. Every phase plays on the upper body (the legs
 * keep the flight pose): played whole, the dash and the cuts pitch the body so far that the head leaves the weak point's sphere
 * (the rush carried the eyes .81 m from it; on the upper body every live phase stays within .24 m, tests/demon-actors.test.ts). */
export type PhaseClip = { name: string; time: number; weight: number };
type Durations = Readonly<Record<string, { duration: number }>>;

/**
 * The clip for warden phase `phase` at `time` seconds into it. `move` is the turn's chosen attack, `tell` its tell length and
 * `rush` the rush's length (reach / rush speed, wardenRush.ts). The tell holds the sword guard; for a fan or a volley its last
 * `impact` seconds already play the stroke's windup, so the stroke's impact meets the first bolt at the start of the phase (the
 * code timers that fire the bolts stay). The rush and the sweep are scaled to their known lengths; the recovery plays the block
 * once and holds its end. Reduced motion holds one frame per phase at a lower weight. Returns false when no stroke plays.
 */
export function wardenClip(out: PhaseClip, clips: Durations, phase: number, time: number, move: number, tell: number, rush: number, reduced: boolean) {
  out.weight = reduced ? WARDEN_BLEND.reduced : 1;
  if (phase === WA.tell) {
    const stroke = STROKE[move];
    if (stroke === undefined) return false;
    const c = cutClip(stroke), start = Math.max(0, tell - c.impact);
    if (reduced || time < start) return false;
    out.name = c.clip; out.time = time - start; out.weight = Math.min(1, out.time / WARDEN_BLEND.phase); return true;
  }
  const at = (name: string, t: number) => {
    out.name = name; const d = clips[name]?.duration ?? 0; out.time = Math.min(Math.max(0, t), d);
    if (!reduced) out.weight = Math.min(1, time / WARDEN_BLEND.phase);
    return true;
  };
  if (phase === WA.rush) { const d = clips.rush?.duration ?? 0; return at('rush', reduced ? d / 2 : time / Math.max(.05, rush) * d); }
  if (phase === WA.sweep) { const c = cutClip(2), d = clips[c.clip]?.duration ?? 0; return at(c.clip, reduced ? c.impact : time / CLEAVE.duration * d); }
  if (phase === WA.fan || phase === WA.volley) {
    const c = cutClip(STROKE[phase]);
    out.name = c.clip; out.time = Math.min(c.impact + (reduced ? 0 : time), clips[c.clip]?.duration ?? 0); out.weight = reduced ? WARDEN_BLEND.reduced : 1;
    return true;
  }
  if (phase === WA.recover) { const d = clips.block?.duration ?? 0; return at('block', reduced ? d / 2 : time); }
  return false;
}
