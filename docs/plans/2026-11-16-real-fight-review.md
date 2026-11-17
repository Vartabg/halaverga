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

## Stage B code review

Reviewer: a fresh-context opus agent, read-only, given `git diff 86482c2..HEAD` (4e10c84, 851d709, 67c6c30, 9a1dae6), the plan, this
review and AGENTS.md. Completed 2026-11-17; it confirmed findings with scratch measurements outside the worktree and ran the 10
touched unit-test files (64 tests pass).

| # | Finding | Disposition |
|---|---|---|
| 1 | High: the stroke faded to zero over its own last .25 s (cut0 landed its impact at weight .8), then the recovery popped in at full weight: one-frame hand jumps up to 112 cm on the ground. The tail test checked only the tail frame. | Fixed (752d57c): no fade at the seam; weight 1.0 from impact through the seam; jumps now 0.7-5.8 cm; tests for weight and hand continuity. |
| 2 | Medium: a new strike during the recovery reset the weight to .42 and dropped the recovery pose (up to 122 cm). | Fixed (752d57c, c13959d): crossfade from the running act, also when a cut begins inside a running crossfade; mid-recovery jumps now 2.0-8.7 cm. Two cuts begun within 2 frames still jump 15-23 cm (left: rare). |
| 3 | Medium: warden phase clips ramped from zero and the last phase's clip dropped at once (up to 115 cm). | Fixed (88b8696): the last phase's clip crossfades over the phase blend; phase-change frames now at most 0.2 cm. Reduced motion now blends warden poses over .08 s. |
| 4 | Low: per-frame arrays in `Drones.tsx` and a closure per call in `watcherClips.ts`. | Fixed (88b8696). |
| 5 | Low: a new test grepped source for the blow bookkeeping. | Fixed (88b8696): a behaviour test through `landBlow` and a later hit. |
| 6 | Low: stale docs and scripts (`cannonContract.ts` test name, `art/angel-asset/README.md`, `scripts/angel_asset/build.py` writing the retired model); `sword-string.test.ts` over 200 lines. | Fixed (7b362c6); the throw tests split out. |
| 7 | Low: the draw-call budget had no recorded figure. | Measured by the implementer on local production builds of 86482c2 and Stage B (system Chrome, ANGLE Metal, 1440x900, 8 Watchers live, two runs): `renderer.info.render.calls` 46 to 76 (+30, cap +40), session peak 58 to 87; all WebGL draws per frame 62-63 to 89-90; frame time 16.67 ms (vsync) both. Not re-measured after the fixes (bones only). |

Deviations the reviewer judged sound: hit clip by blow kind (the spec's cut 2 is the casting blow, so `hit` for the cross cut,
`hitHead` for the rising cut, `knock` for the casting blow); warden phase clips on the upper body only (a full-body rush moved the
eyes .81 m off the weak point); the weak point moved about .11 m to the hovering Watcher's eyes (EYE_UP .664, EYE_FORWARD .32,
re-measured in a test); fan and volley start the stroke in the tell; `BODY` radius .35, half .67, offset y -.1 and `BLADE.reach`
1.37 (the rising cut, the shortest), so contact moves from 1.91 to 1.72 m (a feel change for Garo to judge); prone thighs .1;
relaxed thresholds each tied to a measured model change (hover head .08 for 5.6 cm; shot-sync 21 deg for 20.3 deg, margin .7 deg;
triangle floor 15k for 19.5k; batches tightened to 6).

## Final checks for Stage B (c13959d and the spec fix)

- `pnpm verify` (implementer, c13959d): 246 files / 2793 tests, build, first load 628.1 KB of 629, vote build. `tsc` clean after
  the spec change.
- Browser specs (system Chrome, local production server): the first full set had 52 of 53 passing; after the review fixes,
  suit-clips, angel-strike-integration, celestial-battle (4) and banish passed.
- `warden-attacks` pursuit failed intermittently: 3 of 4 cases on this branch, 2 of 4 at Stage A, 0 of 8 at 547a7cc (local
  production build, and 6 of 6 against halaverga.com). Traces showed no rule change: the lancer chases past 17 m and the cantor
  retreats inside 22 m, but the test's 1.5 s escape window crossed those distances only in its last few samples even at
  547a7cc, and this branch's heavier frames under machine load (speeds about 1 m/s lower at the same wall time) pushed it past.
  The window now runs up to 3 s and stops when the expected mode shows; 12 of 12 passed (two full runs).
- Draw calls and frame time as in the code review (finding 7).
- Not checked: a physical iPhone (the heavier frames make this the main open risk), GPU memory, the review scripts
  `review-celestial-characters.mjs` and `review-wing-motion.mjs` (updated, not run).
- For Garo to judge: contact moves from 1.91 to 1.72 m; a struck Watcher glows orange all over (as before, now on a human body);
  the leg shows through the chiton in some poses.
