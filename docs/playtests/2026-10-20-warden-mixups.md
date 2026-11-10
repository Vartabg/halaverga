# Warden repertoires · 2026-10-20

Implementation branch `codex/warden-mixups`, isolated from integration508207a. Own camera/arena/warden prerequisites replayed as edd5bc1/de07b90/b151a6b/805d823. Final commit is recorded in the deployment metadata and exact Merge Monitor handoff receipt. Previous review branches remain frozen.

## Playable changes

- Rift lancer: straight committed unblockable rush plus a fixed-facing close cleave. Evade the rush; guard, timed-parry or retreat from the cleave. Separate lane and blade-sector geometry, body poses and action text communicate the difference.
- Cinder cantor: three fixed-aim darts plus six split rays that leave a safe central corridor. Splitfire visibly recoils at close range, locks aim early and never adds a hidden center shot. Dodge/parry the volley; hover in the splitfire gap. World cover stops the recoil and both attacks.
- First two eligible moves differ. Later seeded choices respond to range and the previous successful defense, allow occasional repeats, and prohibit three repeats while both moves are viable. A distant lancer uses its reaching rush until the cleave is in range. Choice history resets with the encounter.
- After damage or two turns, tells shorten by150ms (minimum1.1s) and aimed volleys tighten their shot gap by40ms. Each physically landed earned counter breaks one of two armor layers; the second binds and casts. An ordinary armor strike/rebuke remains a fallback; lesser enemies retain quick chains.
- An adjacent finishing counter can land before Player observes its dive phase. The contact now clears stale parked-hover intent so the existing camera can frame the banishment. No Player, camera, generic counter, wing, Suit, Shooter, Scene or integration checkout edits.

## Verification

- Full unit run:216 files,2519/2519 pass (`/tmp/halaverga-mixups-unit.log`). After the adjacent-contact fix:47/47 focused attack, counter, elite and pilot-flight contracts pass (`/tmp/halaverga-mixups-contact.log`).
- Contracts cover seeded varied choice, no three eligible repeats, range/defense adaptation, escalation/reset, locked cleave geometry, swept crossings,30/60Hz and long-frame paths, cover, early/timed/away-facing shields, fan center versus bank hits, six rays, close recoil, two real counter contacts, canceled reservations and parked-hover contact.
- Final actual-input touch encounters:4/4 pass, both wardens at393×852 and852×393, through first defense/counter, different second attack, second counter, bind/cast/kill and camera framing. Ward remains unchanged through the successful defenses. No runtime combat injection or teleport. Proof: `/tmp/halaverga-mixups-encounter-proof`; log `/tmp/halaverga-mixups-encounters-proof.log`.
-21/21 further browser checks pass: accessibility, desktop/phone chains, flight, dive/climb/coast/brake, touch momentum, HUD/control separation, landing cancellation, graphics loss/reload, orientation/input release and asset-failure recovery. Proof: `/tmp/halaverga-mixups-browser-proof`; log `/tmp/halaverga-mixups-browser-final.log`.
- Typecheck and production build pass. Landing stays9 scripts,629.0/629KB, with scene and combat code outside the initial page. Vote route/build contract passes. `git diff --check` passes; edited/new TypeScript modules remain below200 lines.
- Initial integration tests exposed parked-hover cancellation of the close lancer finisher; fixed with a real-contact regression. A later overlapping test runner removed another run's trace files during context close (ENOENT after gameplay assertions). The final4-case repeat used its own output directory and passed sequentially. Exploratory logs are retained; failures are not counted as passing runs.

## Limits and delivery

Physical iPhone Safari, VoiceOver on device, sustained thermal behavior and subjective enjoyment are not verified by Chrome touch emulation. The new attack names, choices and powers are original game fiction, not claims about scripture. Formal Claude cross-review is pending; accepted Arkham-counter e908082 is on a separate branch and requires reconciliation during later authorized integration. No main/production/precedence override or unrelated-worktree cleanup.

## Frame samples

Mac14,6 / Apple M2 Max / macOS27.0.1, installed system Chrome155 with configured ANGLE/Metal. Power state, thermals and GPU timestamps unknown. Existing16-second flight/alternating-turn/C-strike workload; these are short samples, not an elite worst-case benchmark or a device certification. Phone-sized Chrome uses852×393, requestedDPR3 and4× CPU throttling; renderer quality still controls actual DPR. Log `/tmp/halaverga-mixups-perf.log`.

- desktop: 17s, 1009frames; p50 16.7ms, p95 18.2ms, 0 frames over50ms. End resources {'drawCalls': 38, 'triangles': 187770, 'geometries': 65, 'textures': 41}.

- phone-throttled: 18s, 1070frames; p50 16.6ms, p95 18.8ms, 3 frames over50ms. End resources {'drawCalls': 40, 'triangles': 211814, 'geometries': 66, 'textures': 41}.
