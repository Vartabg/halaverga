# Review: a more realistic fight

## Plan review

Reviewer: a fresh-context sonnet agent, read-only, given only the plan, AGENTS.md and the named source and tests at main 547a7cc.
Completed 2026-11-16 with file:line evidence. Verdict: Stage A not buildable from the first draft; five material items.

| # | Finding | Disposition |
|---|---|---|
| 1 | The sword bone and the clip time live in the render layer (`FlamingSword.tsx`, `angelMotion.ts` `m.actT`), but the cut lands in the game step (`banish.ts:120` via `Shooter.tsx`); reading bones back would be stale and reverse the dependency; no rule for an unmounted avatar or reduced motion. | Accepted: contact is decided in the game step from plain values (`bladeReach.ts`); nothing is read back from the render layer. The visible blade lines up because the slash clip already eases its impact frame onto the landing beat. |
| 2 | A per-step blade test tunnels at dive speeds (55-130 m/s, dt cap .05 s = 6.5 m per step); "whiff" and "short recovery" undefined. | Accepted: swept segment-to-capsule test, unit-tested at 130 m/s. No new miss state: the dive homes as today and an unreached cut ends through the existing `cancelStrike`. |
| 3 | No capsule for any body; `STRIKE.contact` has three consumers; pinned tests not listed. | Accepted: `BODY` capsules for lesser demons and wardens from the GLB rest bounds, `BLADE.reach`, `contactAt(i)` replaces all three uses; the four test files named. Lock and `swordReach` stay. |
| 4 | Prone flight conflicts with the pinned "no torso pitch where an overhead camera can meet it" rule (`flightClips.ts:75`, `flight-clips.test.ts:69`) and has no mechanism. | Accepted: a root pitch by speed beside `turnBody`, 0 at hover and climb (the pinned rule and its test stay), composed before the cut's lean; off under reduced motion; affected silhouette tests updated with reasons. |
| 5 | The angel's knockback adds a second velocity writer with no owner. | Accepted: `hurtShove.ts` owns it, set by `wardenDamage`, added on the `strikeStep` line in Player.tsx so flight safety sees it like a dash, dropped during a strike, kept under reduced motion; the flinch pose is off under reduced motion. |
| 6 | Optional: one hit clip only (root yaw for the side); `state.hit` decays, so a hit clock is needed; A2's upper-body slash is today's behaviour; name new unit tests; asset manifests pin bytes and sha256; hard ceiling for total bytes. | All accepted and written into the plan. |

Stage B's sources (MakeHuman via MPFB2, free motion capture) are researched separately; every download is asked of Garo first with
its name, source and size.
