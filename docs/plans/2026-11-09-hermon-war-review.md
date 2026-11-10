# Review report: the sword fight on Mount Hermon

- **Plan reviewed**: `2026-11-09-hermon-war.md` rev-1, source baseline `34997c0` (Hermon side) and `9826287` (breach-slice side).
- **Reviewer**: one independent Claude subagent in a fresh conversation, read-only, given the plan, the reading list in the dispatch and no planning history. Completion evidence: its final report, received 2026-11-09 (46 tool calls). It ran no code; terrain heights were reasoned from `massifData.heightAt`.
- **Author's checks**: every finding below was checked against source before a disposition was recorded.

## Blockers

| # | Finding | Disposition |
|---|---|---|
| B1 | The orphan check could not pass as written: no tool was named, the Hermon baseline keeps unmounted modules on purpose, and D4 leaves `ArmCannon.tsx` unmounted. | Accepted. Check 4 is now "no new orphans versus `34997c0`", run with an import-graph script against the result and both parents: one new orphan, `ArmCannon.tsx`, kept deliberately (D4). The four other files the reviewer named are already absent from the merge result. |
| B2 | Nothing enforced the 200-line rule on hand-merged files. | Accepted. `tests/hermon-war-mounts.test.ts` gates every `src/**/*.ts(x)`. Largest file after the merge is under the limit. |
| B3 | The word ban contradicted Hermon's own copy, its pattern missed breach-slice strings, and no replacement strings were given. | Accepted. D6 now bans breach-slice's setting copy only, lists the exempt Hermon names and gives the replacement strings. |
| B4 | The victory ring would sit under the gorge water and cut into slopes; "nothing else changes" was inaccurate; the HUD still said "The gate is secured". | Accepted. `restingHeight` (highest of centre and eight rim samples, never below `WATER_LEVEL`), unit-tested; D5 rewritten; victory line replaced. |
| B5 | "The nave is the gorge" fails on the east side: the summit terrace blocks sight to warden 7's start, and the guarding test was being deleted. | Accepted, and confirmed by running it: the first Hermon version of the arena test failed on exactly this. Warden 7 starts over the west bank; `tests/gorge-arena.test.ts` replaces the sanctuary test on production collision triangles. |

## Improvements

| # | Finding | Disposition |
|---|---|---|
| I1 | Section 4 misstated what breach-slice does when the demon model fails to load. | Accepted; section 4 corrected. The merged scene keeps breach-slice's behaviour. |
| I2 | D2 was true for wardens, bolts, sight and camera, not for patrols, the cast-down finisher or the steering clamp; the elevation floor needed a stated precedence and ceiling. | Accepted; D2 rewritten, `clearOfGround` capped at the steering clamp's ceiling margin and tested. The finisher sinking through terrain is accepted as "cast into the earth". |
| I3 | Reuse the existing patrol test. | Accepted; done. |
| I4 | Name the mixed tests; the fight had no automated browser check in the plan. | Accepted; check 9 now names the carried fight specs. |
| I5 | Mount guard should include `RuinField` and `Water` and match the `City` import. | Accepted; done. |
| I6 | `abyssal.glb` missing from the ownership table; wall dimensions misdescribed. | Accepted; D1 and D4 corrected. The remark that `check-first-load.mjs` has no battle-HUD marker is noted, not acted on: the script measures the landing graph as a whole and passes at 626.6 of 629 KB. |

## Targeted re-review of rev-2

Same reviewer, resumed, read-only, 12 tool calls. B1 to B5: all RESOLVED in the plan and in the working tree, each with file and line evidence.

| # | Finding | Disposition |
|---|---|---|
| N1 (new blocker) | `tests/warden-attacks.spec.ts` still flew to warden 7's old place, a point inside the summit terrace. | Accepted. Both waypoint pairs now steer to open air by the new loop (`[-34, 44, -66]`) and face it (`[-34, 45, -98]`). |
| note | Check 5's grep is not empty: five hits, all in the Hermon baseline and none player-facing (`Suit.tsx` `abyssal.glb`, two `dudaelField*` comments, `skylineDamage.ts`, `steleData.ts`). | Accepted as expected hits. |
| note | Field guide: "drawn from other passages" then cited 1 Enoch 10, which is inside the 1 Enoch 6–21 just named. | Accepted; now "drawn from these passages". No wrong claim and no new quotation was found. |
| note | The reviewer counts fifteen baseline orphans where D4 said fourteen. | Accepted: fifteen on `34997c0`; `demonGeometry.ts` leaves the list (the demons use it) and `ArmCannon.tsx` joins it, so the result is again fifteen. |

## Found during verification, not by review

- **The Hermon branch had deleted the fight's frame-state line.** `codex/celestial-confrontation` removed `ctx.dt = delta; ctx.paused = ...; ctx.reduced = ...; ctx.flying = ...` from `src/game/Shooter.tsx`; breach-slice never touched that line, so the merge kept the deletion without a conflict. With it gone, the shooter step saw no elapsed time, so sight timers never advanced and no demon after the first ever became a valid strike target. It showed up as all three `combat-flow.spec.ts` variants timing out with one kill; a step log of the scripted player showed "no target offered" with four demons inside sword reach. The line is restored and guarded by `tests/hermon-war-mounts.test.ts`; the three variants then pass in about a minute. After this, every `src/game` file was compared with breach-slice: the only differences left are the intended ones (Hermon limits, patrols, navigation names, comments).
- **Breach-only hunks merge silently.** Where the Hermon branch had left a line as the merge base wrote it, breach-slice's rewrite of that line arrives with no conflict. This brought back the "Heaven at war" title and brand. The mount-guard test caught it; every changed file was then diffed against the Hermon baseline.
- **`tests/flow.spec.ts` expected "APPROACH"** while the Hermon telemetry says "ALIGHTING": a stale expectation already present on the Hermon branch; updated.

## Browser verification record (2026-11-09 and 10)

All runs used system Chrome through the repository's Playwright config, one worker, against `next start` production builds on this Mac. Emulated phone viewports only: **no physical iPhone was used.**

| Run | Build | Result |
|---|---|---|
| Full suite, 540 tests | `fe65b8d` (frozen `git archive` copy) | 438 passed, 92 failed, 10 skipped (1.1 h) |
| The same 27 failing files, 328 tests | `codex/breach-slice` `9826287`, its own build | 216 passed, 109 failed, 3 skipped |
| Gate set, 31 tests: accessibility, flight, wing-flight and the fight specs (banish, angel-strike-integration, combat-flow, celestial-battle, gorge-encounter, warden-panel, hover-aim, momentum-flight, momentum-touch) | `c0433aa` (source of `9d059ac`) | 31 passed |
| Fight and warden specs, 15 tests | `9d059ac` | 14 passed, 1 failed (warden 5 arena pursuit, which also fails on breach-slice) |

How the 92 failures sort:

- **78 also fail on breach-slice's own build**, test for test: older thumb-flight, tap-to-blast, arm-cannon, cruise-speed and layout tests that the Oct 20 branch changed the behaviour under and never updated. Inherited, not fixed here. By file: layout-fit 11, simple-controls-touch 9, classic-blast 8, adaptive-thumbs 7, twin-stick 7, screen-touch-sheet 6, shooter-desktop 5, and ones and twos elsewhere. (31 tests that fail on breach-slice pass on this branch.)
- **14 failed only on this branch:**
  - 9 "record line" hint tests and 1 layout test at 200 percent text: the hint-slot one, the 393x852 one and the 200 percent one were run on `codex/celestial-confrontation`'s own build (`bab3c32`) and fail identically there. Inherited from the Hermon side; the other viewport variants of the same assertion were not each re-run there. Not fixed here.
  - 1 expected a button the Hermon branch had renamed ("Return to summit altar"): test updated, passes.
  - 1 wing-tuck test stood beside a megalith shaft, which has no collider on this world: moved to a real landing beside collidable stone, passes.
  - 2 (one flow-recovery case, one lab-brush timing bound of 400 ms that read 406) pass on a quiet re-run.
- Also brought in line: three vote specs expected the retired teal accent, and one settings line had been reworded.

Limits of this record: the full suite was not repeated after the second sword pass and the review fixes (`b3dee8e`, `9d059ac`); those commits were covered by the gate set and the fight specs only. The inherited failures remain failing.

## Rejected

None.

## Remaining limitations

- The reviewer did not execute anything; the numerical claims were confirmed afterwards by the author's tests, not by the reviewer.
- No visual or feel judgement is part of this review. Whether the fight is fun on the mountain is Garo's call on a phone.
- A physical iPhone has not been used.
