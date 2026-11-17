# Warden arena movement · 2026-10-20

Isolated branch `codex/warden-pursuit`, from integration508207a plus own frozen camera, arena and multiattack prerequisites replayed as8b8586c/381fba7/ba7e1b7/1ba7306/7f89d2d. The final SHA belongs in deployment metadata and the Merge Monitor handoff. Prior review branches remain frozen.

## Playable change

- The engaged lancer pursues a bounded prediction of the angel, withdraws if too close and cuts across the approach line at striking range. The cantor retreats under pressure, orbits to change firing angle and closes when the player escapes its useful range.
- Movement accelerates smoothly, replans every0.7s, checks complete body corridors and every swept step against world cover, tries alternate lateral/vertical routes and avoids flying through the angel. A100m home leash bounds the duel;95m separation or5s occlusion releases it without a patrol snap. Low rush endpoints return gradually rather than teleporting into the preferred flight band.
- One motor owns the engaged enemy through the existing held flag. Navigation follows the authoritative Battle clock and stops during pause/landing, tells, attack/recovery, stun, requested/queued/reserved strikes and banishments. First-engagement reservation holds still until the first attack. Complete earned openings remain stationary;1.6s vulnerable relocation follows recovery or contact. Repositioning adds no contact damage.
- A single duel suppresses another elite ambush. An enemy may pursue outside view, but cannot start a hidden attack. The HUD preserves the duel target, names closing/retreat/reposition and gives left/right tracking cues. Actual speed weights the flight animation. Both attack repertoires, two earned armor counters and fast lesser chains remain.
- No Player, camera, generic counter, Shooter, Scene, Suit, wing or integration checkout changes. Tactics remain original game fiction.

## Evidence

- Full unit run before the final guard/first-invite refinements:2528/2528,217files (`/tmp/halaverga-pursuit-unit.log`). After those refinements:60/60 focused navigation/attack/counter/elite/pilot contracts,10files (`/tmp/halaverga-pursuit-contracts2.log`). Current suite contains2532 tests; these figures describe separate runs, not one final full invocation.
-13 navigation contracts cover30/60/120Hz and bounded acceleration/speed, cover/detours/player clearance, lease/clock/held ownership, target synchronization, vulnerable movement, protected strike/recovery windows, leash/low-altitude return, reset/disengagement, offscreen/single-duel gates and gradual patrol handback.
- All four actual-input two-attack/two-counter/banishment encounters pass,393×852 and852×393, with more than4m relocation after the first counter, reacquisition, distinct second moves, earned contact, unchanged ward and finisher camera framing. `/tmp/halaverga-pursuit-final-fights.log` and `/tmp/halaverga-pursuit-final-fight-proof`. This6-case run was5/6; its separate cantor pressure/retreat case passed, its lancer escape case failed because reverse flight did not outrun the circling lancer.
- Final lancer chase repeat turns away and uses actual forward flight, no teleport or combat-state injection:1/1 pass23.2s (`/tmp/halaverga-pursuit-lancer-chase3.log`, proof `/tmp/halaverga-pursuit-lancer-chase-proof3`). Both pursuit cases require the expected chase/retreat mode, more than7m player travel, more than7m enemy travel and a finite synchronized target. Early exploratory repeats and a scene startup timeout are retained, not counted as passes. Earlier landscape acquisition exposed premature pre-tell movement; holding the first reservation and height-scaled aiming corrected that issue.
-21/21 further browser checks pass: automated AA, desktop/phone sword chains, flight, dive/climb/coast/brake, touch momentum, portrait/landscape HUD/control separation, landing cancellation, graphics recovery and asset reload. `/tmp/halaverga-pursuit-browser.log`, proof `/tmp/halaverga-pursuit-browser-proof`. No retries.
- Final source typecheck, production build, landing9scripts629.0/629KB and vote contract pass (`/tmp/halaverga-pursuit-type2.log`, `/tmp/halaverga-pursuit-build4.log`). Modules remain below200 lines; protected source diff is empty.

## Limits

Physical iPhone Safari, device VoiceOver, sustained thermals and subjective fun remain unverified. Chrome touch and CPU throttling are desktop proxies. Formal Claude cross-review is pending. Accepted Arkham-counter e908082 remains separate for later authorized integration. No main/production/precedence override or unrelated checkout cleanup.

## Short frame samples

Mac14,6 / Apple M2 Max / macOS27.0.1, system Chrome155.0.8059.85, configured ANGLE/Metal. Power, thermals and GPU timestamps unknown. Existing16s forward-flight/alternating-turn/C-strike workload; not an elite worst-case test or physical-device certification. Desktop uses configured1440×1000 despite the older test title saying900. Phone proxy852×393, requestedDPR3,4×CPU; renderer quality controls actualDPR. `/tmp/halaverga-pursuit-perf.log` (2/2 pass).

- desktop: 17s/1017frames; p5016.7ms, p9517.5ms, 0 frames over50ms. End resources {'drawCalls': 39, 'triangles': 189370, 'geometries': 65, 'textures': 41}.

- phone-throttled: 20s/1132frames; p5016.7ms, p9524.3ms, 4 frames over50ms. End resources {'drawCalls': 39, 'triangles': 179094, 'geometries': 68, 'textures': 41}.

The throttled proxy has slow frames; these samples do not establish sustained60fps or iPhone performance.
