# Portrait arena playtest

Branch `codex/portrait-arena` starts at integration508207a, carrying the prior camera work as bdcd76c and30b14b8. Final assignment7e5dd623 owns the stage/patrol band, elite exchange, presentation, interruptible finisher framing and related checks; earlier scopes were released only after the owned editor stopped. Compaction caused one final lease expiry; the stopped run was cancelled and the same exact assignment reclaimed before documentation or publication continued; Claude cross-review precedes integration. Wing and counter/slow-time work is separate.

Reviewed Research Vault baseline: `/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md` (trust audit passed). Accepted camera ownership claim CLM-3D-001 and viewport/occlusion guidance inform the pass. Installed Next16.3.8 / Three0.183 / R3F9.7 retained; no dependency upgrades.

Core checks: actual sanctuary render/collision triangles, existing spawn support and all patrol clearance pass. The new sampled 90×165 m low/mid fighting volume and approach sightline tests pass; sanctuary geometry is32,484 triangles. Elite tests cover two armor responses, retaliation, repeated-command rejection, chain-away availability, out-of-range behavior, rebuke interruption, regroup, below-surface cast, and completion after strike cancellation. Initial full suite:209 files /2,480 tests pass. Later verification and browser findings follow below.

No physical iPhone Safari or VoiceOver checks have been performed. Phone-sized Chrome touch emulation does not establish device frame rate, comfort or enjoyment. Art direction and combat tuning remain proposals for the user's next playtest.

The first phone repetition exposed a high tower patrol carrying a chain away from the fight. Its loop now joins the low/mid band, with route clearance still at least5 m, solid clearance at least5.7 m, readable patrol speed and actual sanctuary collision tests retained. Patrol tests now query the actual sanctuary triangles rather than obsolete city/field boxes. The chain browser pilot reacquires the arena through real steering if no eligible target remains, and still requires at least three completed banishments. Dedicated warden tests fly toward the encounter, aim and tap its actual projected silhouette, rather than injecting runtime positions or damage.

Final production-browser pass: **23/23 pass** across three chain playtests, both portrait/landscape warden fights, accessibility, desktop control restoration, flight, momentum, touch release, landing and graphics/asset recovery. The warden test taps actual projected silhouettes, rejects armor spam, observes two armor exchanges and a longer finisher, and checks hover speed below2 m/s plus the cast origin inside the camera view. Portrait captures show the finisher around39 m altitude rather than coasting toward the ceiling. Manual look, steering, Brake and new-attack exit latching are covered by planner tests. No second camera writer was added.

A concurrent full-suite run passed2,481 tests and failed the untouched blaster-skin construction timing budget (367 ms against its250 ms base allowance). This is retained as a failed measurement, not a reason to relax the test; a repeat without our browser/build workload is recorded below. Focused patrol, geometry, elite and camera suite:56/56 pass. Production build, typecheck, vote-build contract and first-load budget pass (9 scripts,629.0/629 KB).

The first attempted limited-worker repeat accidentally forwarded the worker flag after a literal argument separator, leaving the full parallel pool active. It finished with five timing/time-out failures and three worker RPC timeouts under host contention (plus two skipped cases after an expired setup hook). The corrected direct invocation is `pnpm exec vitest run --maxWorkers=2`; test budgets and source are unchanged.

The corrected two-worker full run passed207/209 files (2,479 tests), including the character timing budget; the remaining limit-invariants setup and limit-escape case timed out during a large wall-clock interruption (the escape case reported502 seconds). Two cases were consequently skipped and one worker RPC timeout was reported. These timeout cases are repeated separately with one worker, without changing budgets. The connected claim was safely released/reclaimed after the clock interruption before editing resumed.

The isolated unchanged timeout suites pass: **2 files /11 tests**, limit-invariants112 seconds and escape recorded pins12.5 seconds. Together with the full two-worker run, all2,482 unit cases now have passing results. This is combined evidence across runs, not a claim of one clean full-suite invocation. Logs: `/tmp/halaverga-arena-unit-limited.log`, `/tmp/halaverga-arena-timeout-repeat.log`; browser `/tmp/halaverga-arena-browser-final.log`. Final phone screenshots are preserved in `/tmp/halaverga-arena-final-proof` (393×852 and852×393 armor/bound/cast/after).

Performance samples use the existing16-second W/alternating-turn/strike workload on a Mac14,6 / Apple M2 Max / macOS27.0.1, Chrome155.0.8059.85. Our unit/build workloads were stopped; other desktop activity was not controlled. Browser/GPU timing, thermal and power state were not measured. This is frame-interval telemetry, not an iPhone result or an improvement percentage.

| Sample | Frames / seconds | p50 / p95 | Intervals over50 ms | End-of-sample resources |
| --- | --- | --- | --- | --- |
| Desktop1440×900 |1,067 /18 s |16.7 /17.0 ms |0 |44 calls,162,351 triangles,62 geometries,41 textures |
| Touch852×393, requested DPR3,4× CPU throttle |1,232 /23 s |17.1 /26.2 ms |5 |41 calls,211,086 triangles,64 geometries,41 textures |

Source log: `/tmp/halaverga-arena-perf.log`. Resource counts depend on view/animation; these are snapshots, not maximums. The phone proxy does not reproduce Safari, iPhone GPU, temperature or touch comfort.
