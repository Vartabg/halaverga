# Review: calm fight camera and a stronger angel

## Plan review

Reviewer: a fresh-context sonnet agent, read-only, given only the two plan files, AGENTS.md and the source at ca905a4 (it also saw
the lead's uncommitted D1-D4 edits in the worktree). Completed 2026-11-16 with file:line evidence. One review covered this plan and
`codex/hermon-art`'s.

| # | Finding | Disposition |
|---|---|---|
| 1 | A leg/arm layer placed after the flight clips is overwritten by the slash clip (upper-body mask) and the blaster; "sword out" has no signal (`input.sword` means shooter mode, not a cut). | Accepted. The layer runs after `stepAngelMotion`/`turnBody` and before `followBody`, gated on a real fight signal (strike phase, open string or the slash act) plus a short linger, flying only, not paused, off under reduced motion; the arm guard blends against the slash clip's weight. |
| 2 | Springs take only a stiffness callback; zeta is fixed per bone, so "damp toward critical" has no hook. | Accepted. The implementer adds a zeta hook or only stiffens; the new factor composes with the existing leg/command-arm multiplier. |
| 3 | D7's push on the right forearm and hand would shift the fitted cannon frame. | Accepted. The right forearm and hand are excluded; the push runs after the skin-index remap and before `bind`, on the per-mount geometry clone (cannot apply twice). |
| 4 | D2 verified: with the follow off nothing writes the pilot's yaw or pitch during a fight; `clearCombatSight` only runs while tracking. The orphaned planner JSDoc should move back. | Moved. |
| 5 | Missed FOV and shake sources: the counter's own dive (`counter.ts`: +7° FOV, .3 trauma). Also listed: ground impacts (banish .5/.45), shots (shooterShots), angel hurt (wardenMath .45). | Counter: FOV punch removed, trauma .3 to .15. The others are single events at impact or when hurt, not the nonstop or zooming motion he ticked; left as they are. |
| 6 | D3 also changes speed FOV in ordinary cruise flight (cap +4 against about +10 before). | Intended: the same zoom swing happens in any dive, fight or not. |

Remaining limits: none blocking. Code review of the finished diff follows below.

## Code review

Reviewer: a fresh-context opus agent, read-only, given the diff, the plan and this review. Completed 2026-11-16; it checked its
findings with scratch tests outside the worktree.

| # | Finding | Disposition |
|---|---|---|
| 1 | The bulk's "done" flag sat in `geometry.userData`, which `BufferGeometry.copy` shares with the cached GLTF: the first build marked the asset, so any later rig (a remount, Fast Refresh) stayed thin, and the head/feet test compared two thin rigs. | Fixed: a module `WeakSet`. New test builds two rigs from one asset and checks both are broad. The head/feet test now really compares, and found .07 mm moves from skin weights under .01; tolerance set to .2 mm with the reason. |
| 2 | Landing mid-cut multiplied the landing stiffness by the brace (up to 3.6x); the 1/120 s spring step is unstable past about 2.7x for a thigh, so the legs whirled for a quarter second. | Fixed: brace only in flight, legs take the larger of the two factors, brace lowered to 2.2x. Test: no brace on the ground. |
| 3 | The guard replaces the slash clip's left upper arm and forearm instead of blending against its weight, as review row 1 said. | Kept by design and documented in `strikeStance.ts`: the free arm braces instead of swinging with the blade; clavicle and hand still follow the clip. |
| 4 | Optional: unused `StanceInput.sword`; no test for stance off on the ground / reduced / paused; stale "twirl or flip" comment; CameraRig still computes watch and finisher framing with the follow off. | First three done. The last is kept on purpose (D2: the planner stays for a gentler follow tried on its own). |

## Final checks (before the finish gate's own run)

- `pnpm verify` on the pre-fix tree: typecheck, 237 files / 2736 tests, build (one retry after the known Next.js 16.4.3 security notice), first load 626.6 KB of 629, vote build check.
- Browser specs in system Chrome on the pre-fix build: counter, counter-lifecycle, celestial-battle, simple-hints, suit-clips, accessibility: 32 passed.
- Frames, same three-press capture before and after at 1280x800: the view no longer swings (it held on the same rock pillar through the string; before, it turned about 90° on the first cut); the legs hold a bent, wide stance.
- Not checked: a physical iPhone; side and front views of the free arm (the wings hide it from the chase camera).
