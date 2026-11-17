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

## Stage A code review

Reviewer: a fresh-context opus agent, read-only, given `git diff 10d41ae..HEAD` (dada884, 8d7968f, 7b00409), the plan, this review
and AGENTS.md. Completed 2026-11-16; it confirmed findings with scratch simulations outside the worktree.

| # | Finding | Disposition |
|---|---|---|
| 1 | High: the shove compounded on a head-on hit (it measured the angel's own velocity with last step's shove), so momentum flight kept it: 22 m/s cruise, 14 m/s hit from the front gave -12 m/s and about 29 m of progress lost over 1.5 s. The "never compounds" test ran without the flight model. | Fixed (6cd2b41): `shoveBase` takes last step's shove out of the flight input in full, trims only what flight safety or a collision removed; the shove is added after the model. Tests drive the real `momentumVelocity`: about 3 m cost head-on, from behind and side. |
| 2 | Medium: the flinch tipped the chest and head back at hover, which the pinned facing rule forbids. | Fixed inside the rule: the back arch scales with how prone the body lies; upright it hunches forward. The flinch is now sampled in the rule test. |
| 3 | Low: a re-hit during a running reaction popped the upper body back to the flight pose. | Fixed: crossfade over .12 s from the running reaction; yaw carries over; test. |
| 4 | Low: prone keyed off horizontal speed (a steep dive stayed upright; the shove tipped the body). | Fixed: `proneSpeed` = travel along the facing plus descent, shove removed; the top-up compares against the whole root pitch. |
| 5 | Low: a side shove read as a steering turn. | Fixed: the turn reads the velocity before the shove. |
| 6 | Cleanups: flinch survived Retry; `clearShove` unused; per-frame closure; 2D gap in one test. | All done. |

The six reported deviations (prone top-up, chest pivot, one capsule for both kinds, darts shove, stance legs over prone legs, wings
counter lean + pitch) were judged sound.

## Stage B plan review

Reviewer: a fresh-context sonnet agent, read-only, given the Stage B section (B5-B9 first draft), AGENTS.md, the prototype handoff
and the named source and tests at 4842e80. Completed 2026-11-16 with file:line evidence; claims checked against the source by the
lead (clip names via the GLBs, `angelMotion.ts`, `Drones.tsx`, `demonActors.ts`, `droneMesh.ts`, `membraneRig.ts`).

| # | Finding | Disposition |
|---|---|---|
| 1 | Blocker: the prototype GLBs carry library clip names only; the game needs `idle`, `swordIdle`, `slash`, `rebuke`, `cast` and `idle`, `flight`, `charge`, `hit`, `down` (a missing `charge` throws and turns the shooter off). Watcher flight cannot use the player's flight, which is code poses. | Accepted: B5 renames clips in the build to game names from the same sources as today's builds, plus the new ones; Watcher flight stays `NinjaJump_Idle_Loop`. |
| 2 | Blocker: per-cut impact and `_Rec` do not plug in: no impact times in asset.json; `SLASH.raised` used in five places; the cut can change after begin; no slot for `_Rec`; `CUTS[].rate` tuned for a 1.53 s clip. | Accepted: B6 adds `cutClips.ts` (`raised`, `impact` measured and test-pinned), clip switch at `raised`, rec as the act's tail, rates and lead retuned, chest roll removed. |
| 3 | Blocker: `BLADE.reach` was measured at the old impact pose and arm. | Accepted: B8 re-measures it per cut from `archangel.glb`, minimum of three, in its test. |
| 4 | Blocker: feather wings are CPU-posed SkinnedMeshes (106 bones a side, 20-30k triangles); 16 of them break any draw-call or phone budget. | Accepted: B7 builds one reduced feather pair at load, driven by the existing instanced membrane rig (2 draws). |
| 5 | Blocker: eye, plate and imp wings are extracted from `abyssal.glb`; the eye is the telegraph. | Accepted: B7 keeps the eye marker with built-in geometry, makes the cuirass the breakable `plate`, removes `demonGeometry.ts` and the unused instanced body. |
| 6 | Blocker: `angelRegalia.ts` patches materials by old names; the cel shader on realistic skin is undecided. | Accepted: match the new names; no HADES fragment on the realistic bodies. |
| 7 | Blocker: renaming the files touches loaders, specs, review scripts and a text-pinned mount. | Accepted: keep the constant names, change only paths (B9). |
| 8 | Wardens differ from lessers; ranged fan and volley run on code timers; rush has variable length. | Accepted: B7 maps clips for wardens only, scales known-length phases, aligns impact to bolt release. |
| 9 | Hit clip by cut needs a per-actor clip reference. | Accepted (B7). |
| 10 | Blade per Watcher is feasible via instanced `swordGeometry()` from `hand_r`; `SWORD_GRIP`, arm cannon and blaster skin need re-tuning. | Accepted (B6, B7). |
| 11 | GPU memory overstated: textures are shared across clones. | Agreed; no change needed. |
| 12 | Failure path is sound; add a spec for a failed `watcher.glb`. | Accepted (B9). |
| 13 | Material merge to 3 is unbuilt and conflicts with the per-actor flash; B4 and B8 byte rules conflict. | Accepted: at most 6 materials, a measured draw-call cap (+40 at 8 Watchers); one byte rule (B8). The flash on every material is today's behaviour. |
| 14 | No in-game credits list for the CC-BY sandals. | Resolved by not shipping them: the build makes its own sandals (B9). |
| 15 | No phone frame-time budget. | Not resolvable here: no iPhone in reach; desktop frame time measured before and after, and the iPhone check is recorded as not done. |

## Final checks for Stage A (6cd2b41)

- `pnpm verify`: 240 files / 2765 tests, build, first load 628.1 KB of 629, vote build.
- Browser specs (system Chrome, local production server): 35 passed, 2 failed (`simple-hints` touch 852x393, one with the
  context-lost screen); rerun on a quiet machine, all 4 touch tests passed.
- Frames: prone at cruise and in a strike dive, blade landing at the body, a struck Watcher hunched and turned, a head-on hit at
  cruise keeping forward travel (35 to 26 to 42 m/s).
- Not checked: a physical iPhone, GPU memory, the hover flinch on screen (unit tests only).
