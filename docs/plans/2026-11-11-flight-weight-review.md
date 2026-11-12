# Review record: the angel has weight

Beside the plan `2026-11-11-flight-weight.md`. Two independent reviews, each one reviewer in a fresh conversation with no planning history, read-only.

## 1. Plan review (before any code)

- **Reviewed**: plan revision 1 against source baseline `f069b8d`.
- **Reading list given**: `AGENTS.md`, the plan, `src/game/{momentumFlight,pilotFlight,motion,strike,swordBlow,swordString,turnSweep,combatCamera}.ts`, `src/game/{Player,CameraRig}.tsx`, `src/world/suitRoll.ts`, `tests/{momentum-flight,strike,sword-string,pilot-flight}.test.ts`, `docs/plans/2026-10-20-hover-aim.md`. It read further files to check claims and listed them.
- **Completion**: it reported every item done, and what it could not verify (anything needing a running browser). It ran nothing in the repository; its numbers came from its own re-implementation.
- **Verdict**: not ready as written. The D1 and D2 numbers were confirmed correct. Four blockers, eight improvements. All were checked against the source by the author.

| # | Finding | Disposition |
|---|---|---|
| B1 | Breaking a watch with a movement key would turn the pilot toward the falling demon: the camera planner's hold (0.16 s) keeps it tracking, and `CameraRig` writes the pilot's heading while tracking and not watching. | Accepted. When a watch is dropped the planner's hold is zeroed, so it stops tracking on that frame. Tested on the planner; the rig line is pinned. |
| B2 | The turn limit and cost applied to pitch too, which gutted dive-then-climb: a pull-out from 81 m/s would lose 48 to 108 m of height (19 to 43 before), and the energy test would fail. | Accepted. The limit (36 m/s2) and the cost now apply to the heading only. Pitch keeps the baseline limit (100 m/s2) and is free; gravity already does that accounting. The energy tests pass unchanged. |
| B3 | The list of tests to rewrite was incomplete (four unit tests and five browser specs depend on the instant stop or on the strike's old phases), and the browser gate was not named. | Accepted. All are listed in plan revision 2 with their new contract; the gate's spec files are named. |
| B4 | Capping a strike's exit speed inside `pilotVelocity` contradicts the step order, misses paths that do not call it, lets a new dive launch from the old dash, and trusts a stale entry speed for step-ins. | Accepted. The cap moved to a `strikeStep` wrapper in `strike.ts` that every strike step passes: it is read while a strike runs, and applied on the first step after it ended or was replaced (before the new one launches). A step-in's cap is the floor. |
| I1 | A warden's finishing blow still carried the angel on when movement was held; and the cap is itself a one-step change. | Accepted in part. The finishing blow now always stops at the demon, and the carry (the warden's armour throwing the angel back) can no longer exceed its own speed. A dash ending in one step is kept: a dash is the one deliberate exception to "nothing snaps", the same as its hit-stop. |
| I2 | D1 makes time-to-hover about five times longer at cruise than the 2026-10-20 mechanism, which existed so the player can aim from a hover. | Accepted. The plan says it supersedes that mechanism, names Brake as the quick stop, and the trade-off is put to Garo. |
| I3 | D1 ambiguities: cost while levelling, "just stops", "ending level", whether Brake levels; and levelling is not needed by the complaint. | Accepted, except cutting levelling: it is kept (a few lines) because without it a released dive runs on into the ground. Levelling is a pitch change, so it is free; the table holds for level travel; slow steep releases stop before they level; Brake levels too. |
| I4 | "Flown" was undefined; the rig's `steering` includes Aim and omits Rise and Descend; a tapped key would bounce the view away and back. | Accepted. Player publishes the one signal it already computes as `runtime.flown`; the watch is dropped for the rest of that cast. |
| I5 | Acceptance checks needed inputs stated, an observable view heading and a tolerance. | Accepted in revision 2. |
| I6 | The worktree held uncommitted preparation (draft test, a test helper, a temporary hook) that the plan did not mention. | Noted. The hook and the capture specs were removed before commit; the draft test was rewritten to the revised design. |
| I7 | Resuming after the last cut started with a small upward drift, so held thrust hopped up before aligning. | Accepted. The last cut releases at exactly zero velocity. |
| I8 | The limit tests fly the older model; the limiter's own turn can outrun the travel at surge. | Checked once in a browser (below). Not covered by a test: a known limit. |

A second plan review was not run: every blocker was resolved by the reviewer's own proposed correction, and the code review below covers the result.

## 2. What was measured in the real game (desktop Chrome, production build)

A throwaway capture flew the game through a temporary read-out hook (both removed before commit).

| | Before (`f069b8d`) | After |
|---|---|---|
| Let go at 22.9 m/s | at rest in 0.4 s and 1.7 m | 1.6 s and 16.5 m |
| Let go at 32.8 m/s | 0.4 s and 2.5 m | 2.0 s and 28.1 m |
| Brake at about 24 m/s | 0.3 s and 1.3 m | 0.8 s and 8.8 m |
| Held turn at 23.8 m/s | no speed lost | lowest 18.0 m/s |
| After the last cut, nothing held | thrown to 78 m/s, 31 m away, view up to 0.77 rad off the heading | at rest, 4.5 m from where the capture began (it began during the last step-in) |
| After the last cut, thrust held | 89 m/s, 171 m away after 2.5 s, still at 45 m/s | ordinary thrust from rest: 30 m/s at most, 48 m away |
| Watching the fall from a hover | | still happens: the view tips 0.4 rad down after the last cut and is back 1.6 s later; the pilot is not turned |
| Flown at rock at surge for 7 s, then turned away | | never stopped (slowest 10.7 m/s), flying again after the turn |

Not measured: a turn at surge in the browser (the capture's turn ran at cruise, where the travel keeps up with the view); anything on a phone.

## 3. Code review (after the build)

- **Reviewed**: the uncommitted change against `f069b8d` (source diff as it stood after the take-off fix), with the plan as background. One reviewer, fresh conversation, read-only; it ran no tests and computed its numbers from its own port of the flight code.
- **Completion**: it reported all seven areas done and listed the files it read.
- **Sound, by its account**: the heading and climb arithmetic and its signs, no aliasing of the shared scratch values, no bad number at zero speed or zero time, the flare never speeding up and always reaching zero, identical results at 30, 60 and 120 Hz; every way a strike ends applying the cap exactly once, a stale cap not reachable; the sword blow's throw; every camera trace it followed; `runtime.flown` never stuck; the rewritten unit tests not loosened.

| # | Finding | Disposition |
|---|---|---|
| 1 | Bug: Rise during a straight fall looped the angel out sideways at up to 46 m/s, along world north or south whatever the view. An older class of fault, but the fall after a release now lasts seconds, and Rise is the natural answer to it. | Fixed. A reversal close to straight up or down stops on its line, then goes the other way; the view's heading replaces the world axis as the last resort. Tested for six view headings, with and without sideways drift, and for Descend against a climb. |
| 2 | Risk: a released straight descent fell on for 24 to 69 m; and levelling switched on abruptly at 1 m/s of horizontal speed (a 72 m drop either side became a 31 m drop and a 37 m/s pull-out). | Fixed. A steep release stops harder, up to Brake straight up or down (12 to 42 m); levelling fades in smoothly. Tested: no cliff across five pairs of nearly equal drifts. |
| 3 | Risk: browser specs outside the gate still assumed a 1.5 s stop. | `classic-blast`, `recovery` and `play-guard` waits raised to 5 s. `adaptive-thumbs` left (it already failed on the parent branch). The whole browser suite (over an hour) was not run. |
| 4 | Risk: the camera rules were pinned as text, and the planner test cleared the hold itself. | Fixed. The watch decision is a pure function with trace tests; the planner takes `release` as an input. The two Player lines stay text-pinned. A browser check that the string ends at rest was added to the gate. |
| 5 | Risk: the limit tests never fly this model; the limiter can override the cap near a face. | A harness switch and `tests/limit-momentum.test.ts` added. It showed an inherited fault (see the plan's failure behaviour): a slow slide along two rock faces, the same with yesterday's model. Not fixed here. |
| 6 | Risk: with thrust held, take-off was 0.9 m lower after the take-off fix. | Fixed: the shorter lift applies only with nothing held. Left: take-off with Brake still set from before landing rises 2.2 m, not 2.9. |
| 7 | Nit: looking away during a watch still swung back after 0.65 s. | Fixed: a look drops that cast's watch for good, as movement does. |
| 8 | Nit: stale guide wording and test names. | Fixed. |
| 9 | Nit: the dash state has no reset; three statements share one line in `Player.tsx` to stay under 200 lines. | Left. The dash state clears itself on the next flying step. |

## 4. After the code review

- On the final tree: `pnpm verify` passed (type check, 2,667 unit tests in 231 files, production build, first load 626.6 of 629 KB, vote build check), and the browser gate passed 35 of 35 in desktop Chrome (the twelve specs named in the plan, plus `thumb-flight`). The gate's first run, before the code review fixes, was 34 of 35: `wing-flight` failed because take-off eased a metre higher; that is the take-off fix above.
- Not run: the whole browser suite, and the three specs outside the gate whose waits were raised (`classic-blast`, `recovery`, `play-guard`).
- Not re-captured in the game after the review fixes: the release, turn and string numbers of section 2 (the level-flight flare, the turn and the strike code did not change after them; the take-off, the steep release, Rise against a fall and the watch-drop on a look did, and are covered by unit tests only).

## 5. The slow climb after a rock face (2026-11-11, after Garo's "Yes, fix it")

Section 3's finding 5 called it a slide along two rock faces at 8 to 12 m/s. A trace of the three affected cases showed that was wrong: the angel leaves the rock within a second and is never touching it again. What happens is that the face nudge tips the view up to clear the slope (to 1.0 to 1.14 rad in these cases, on slopes far gentler than that) and leaves it there. The older flight shot up to the sky limit at full speed, where the ceiling peel turned it down and its settle levelled it. A flight with weight climbs at 62 degrees at about 8 m/s for as long as thrust is held.

The fix is in the limits, not in the flight: the face nudge hands its pitch back through the peel's existing settle. Two things were needed for that to work in every flight: the settle also fires after 1.5 s clear of everything (gaining the 20 m it waited for takes 2.5 to 5 s in a slow climb, and the older tests allow 2.5 s), and a hand-back still owed is kept through a pause in the flying instead of being dropped with the thrust.

| At the west hill, thrust held at surge | Before | After |
|---|---|---|
| Harness, this flight | view 1.14 rad up for good, 7.8 m/s | level 2.3 s after it tips, 32 m/s by 7 s |
| Harness, older flight | carried to the sky limit (148 m) | level at about 60 m |
| The game (desktop Chrome, production build) | view 1.08 rad up for good, 8.0 m/s, 113 m up after 8 s | tips to 1.12 rad, level 2.1 s later at 61 m, 32.5 m/s |

- All 37 limit tests pass, the older flight's included (one of them, the 90 s hands-off run at 8 m/s, set the 1.5 s figure). `pnpm verify`: 2,668 unit tests. Browser gate: 35 of 35.
- Left as it is, and not tried: how far the nudge tips the view (it points along the face's normal, far steeper than the slope needs). Tipping it less might keep more speed over a hill; the older flight's escape tests measure how soon the angel is 20 m clear of the rock, so that needs its own look.
- The speed still dips to about 11 m/s for about a second and a half while it climbs over. That is the climb costing speed, as it should.
