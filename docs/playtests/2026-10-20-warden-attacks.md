# Warden attack playtest evidence

Task branch codex/warden-attacks from integration508207a; own camera/arena prerequisites replayed as768b009,1801cd1,3af8e19. Assignment34759c3b owns the exact source/test scope; Claude is the integration reviewer. No main/integration/production mutation.

Product3D/Research Vault animation audit passes; reviewed CURRENT_GUIDANCE.md is the baseline. Installed Three0.183/R3F9.7/Next16.3.8 retained. No new asset or dependency.

Initial deterministic attack/guard/counter suite:29 cases across6 files pass, after correcting delayed whiff recovery, last-frame punish reservation and held cleanup after leaving range. Production build/typecheck pass. The first build exceeded the unchanged landing budget by27 bytes because an extra shared chunk reference reached the lazy loader; co-locating only the world-query callback in existing combatFlow removed that extra shared dependency. Current first-load and vote build checks pass at629.0/629 KB.

First real-input phone pilot:4/4 failed because wardens were visible but did not engage. Retained /tmp/halaverga-warden-browser-pilot.log and traces; gating telemetry was added to reproduce the live-scene discrepancy. This is a failed pilot, not validation.

Antigravity Gemini3.8 Flash High was given supplied-text read-only review in an empty temporary workspace, then one narrower correction. The first attempt returned an empty SUCCESS payload with a timeout warning; no review conclusion was obtained. Model identity confirmed by init; no tool events observed. Outcome of the correction and final checks follow below.

Physical iPhone Safari, touch comfort, VoiceOver and sustained device performance remain untested. Chrome phone emulation and Mac frame samples are separate evidence.

Live trace correction: the wardens were already attacking while the pilot flew its navigation route, and the pilot then faced their old patrol positions. Current pilot follows the actual projected enemy. Added a visible low-speed engagement dwell (or first-hit retaliation) to avoid route-changing ambushes during fast traversal. Rush overshoot reduced to3m for a reachable portrait punish. New real Rapier regression catches the existing aiming-query0.5m endpoint omission on short darts; enemy attack segments compensate to query the entire traveled path.

Both Gemini attempts returned empty response with a2m timeout warning; no independent verdict was obtained. The terminal correction receipt reports38,408 total tokens (19,661 input /18,747 thinking, no visible response); cost and backend continuation are unknown. No tool events or workspace changes observed. No further retries or account/model changes. Cross-review by Claude is still required.

Final-design pilot with contextual touch defense controls: portrait lancer evade/counter and cantor timed-shield/counter pass with real CDP touch presses and actual projected body taps, plus finisher hover/framing checks. Cantor landscape also passes. One landscape lancer attempt selected a nearer peripheral cantor in the inspection HUD; HUD fallback now ranks aim alignment before distance, retains only active strike/finisher targets, and final verification reruns that case. The old fixed-three-hit arena scenario is replaced by HUD/control separation checks; its actual finisher hover/framing assertions now run in all four new attack encounters.

Gameplay controls preserve ordinary sword commands. A visible earned counter receives target-selection priority over nearby lesser enemies, while LOS, geometry and range remain required. New core count:26 checks across5 attack/armor files, including automatic reticle rebuke during guard, thin-wall segments,30/60/120Hz rush contacts, held-shield versus timed parry, actual-contact reservation/cancellation, and held/duel cleanup.

A focused source review found Space on the new defense buttons could reach the global movement-key set. The button now stops propagation for handled Space/Enter and clears that physical key on release. A final focused phone rerun additionally checks that keyboard shield activation does not start flight, while the actual evade/parry actions remain touch presses. No other input or camera writer is changed.

Broad production-browser run:24/25 pass, including AA, chains, momentum, flight, recovery, both HUD layouts, cantor both orientations and landscape lancer. Portrait lancer earned its opening, but a previously airborne ordinary dart took a ward during the exchange. The elite now drains existing ordinary darts before its first tell, postponing new casts without silently deleting darts. A deterministic regression covers that handshake; final phone cases rerun after this correction.

Full final unit run:213 files,2,502/2,503 pass. The unchanged blaster-skin warm construction budget failed by2.44ms (73.62ms versus scaled71.18ms). An isolated unchanged-budget rerun passes all8 skin cases plus27 final attack/armor cases (35/35 across6 files). All2,503 unit cases have passing evidence across these runs; this is not one clean full invocation. The visible counter-selection edge case with an enemy past the hero but still ahead of the chase camera is covered in the final focused rerun. Production rebuild/typecheck/load/vote pass; final phone touch + keyboard + finisher cases run against that rebuild.

Final input pass confirmed keyboard shield does not start flight, and real touch evade/counter passes in both orientations. Cantor finishing exposed a second-elite/HUD takeover: another warden could begin while the cantor was being cast. Enemy turns now wait through any elite bind/cast, cancel an overlapping own attack, and the HUD gives the finisher priority. An additional contract covers this handoff. Elite phases/bolts also freeze when the authoritative Battle clock stops after landing, instead of continuing against a grounded player. These final activity/finisher fixes have focused regressions and a fresh production rebuild; four attack encounters rerun below.

**Final frozen-source attack playtest:4/4 pass**, both Rift lancer and Cinder cantor in393×852 and852×393 touch emulation. Actual touch holds on contextual Evade/Shield, normal projected-body counter taps, unchanged ward through the defended attack, one counter credited on contact, bind/cast/kill completion, hover speed below2m/s, cast origin framed inside NDC0.95, and no page errors. Cantor cases also focus the shield and hold Space, checking that it does not start movement, then perform the timed parry with touch. Source log `/tmp/halaverga-warden-encounters-final.log`; captures `/tmp/halaverga-warden-proof-final`.

Final focused contracts:29/29 across5 files after activity-clock and finisher-handoff fixes. Together with prior full2,502-pass run and unchanged isolated skin timing pass, all2,505 current unit cases have passing evidence across runs. Broad browser failures and exploratory pilot findings above are retained; the previously failing encounter paths now pass in the final4-case run. The21 other broad behavior/AA/HUD/recovery cases passed before those focused fixes.

Final frame sample uses the existing16-second Space/W/alternating-turn/strike workload, not a worst-case elite-fight benchmark. Mac14,6 / Apple M2 Max / macOS27.0.1, Chrome155.0.8059.85 launched with configured ANGLE Metal. Other desktop activity, GPU timing, power and thermal state were not controlled or measured. No physical iPhone result or percentage-improvement claim.

| Sample | Frames / seconds | p50 / p95 | Intervals over50ms | End resources |
| --- | --- | --- | --- | --- |
| Desktop1440×900 |1,017 /17s |16.7 /17.1ms |0 |38 calls,178,852 triangles,67 geometries,41 textures |
| Touch852×393, requested DPR3,4× CPU throttle |1,139 /20s |16.7 /24.1ms |4 |40 calls,211,814 triangles,60 geometries,39 textures |

Both performance cases pass. Log `/tmp/halaverga-warden-perf-final.log`. Counts vary with the visible/active scene and are snapshots, not maxima. Own unit/build/browser workloads were separated for this sample. Final source passes typecheck, production rebuild, first-load629.0/629KB, vote-build contract, and diff checks. Physical iPhone Safari and VoiceOver remain unvalidated.

Coordination: current runf7e07887 follows two safely released stopped-editor expiries; each failed renewal fenced its dependent patch. Source stayed isolated. Consent for the separate accepted integration merge is messageb4a7fa0d; it grants no precedence/main/production override. Generic counter integration still needs review of shared target/guard rules and coexistence with these enemy-specific attacks.
