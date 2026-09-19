# Flow verification

2026-09-19. Worktree `trackpad-flow`, based on the approved athletic explorer and reclaimed boulevard at `fbccf228fc387dbefeba04da8fb90451b9310dd1`. The Flow delta contains no art or environment asset changes.

## Review in two stages

1. **Control loop:** `flowFlight.ts`, runtime and motion intent, the Player brake serial, `useFlowTrackpad.ts`, capture/input hooks, and the Flow unit/browser tests. Capture is independent of propulsion; pressing preserves looking, while interruptions clear engagement and speed. Review this behavior before judging presentation.
2. **Presentation and learning:** Flow HUD, sensitivity and scroll calibration, guided practice, settings/help/comparison links, persistence and wind envelopes. Existing body animation receives the same actual speed, steering, climb and braking signals; no second animation controller or camera writer was added.

## Checks actually performed

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed, including the final browser test additions. |
| Unit, movement, animation, persistence | All **230 tests in 29 files** passed with `pnpm verify`. Includes low-speed intent and braking from 34 m/s to below 0.1 m/s within 60 physics steps; deceleration starts on the first step. |
| Production build | `next build` passed. First-load budget passed: **8 scripts, 614.9 KB**. |
| Full browser regression | 52/53 passed. The remaining test expected the HUD during the correctly paused state after resize; its fixture was corrected to resume before asserting neutral input. No product change was needed for that failure. |
| Final Flow and accessibility run | **21/21 passed** after final source changes, including the corrected resize fixture and two added capture-retry/graphics-loss cases. Command: `PLAYTEST_URL=http://127.0.0.1:3477 pnpm exec playwright test tests/flow.spec.ts tests/flow-recovery.spec.ts tests/accessibility.spec.ts`. |
| Classic controls and mobile regression | All 34 cases outside that focused set passed in the full regression run: free/captured trackpad, keyboard, animation/reduced motion, recovery, adaptive/one-thumb controls, zoom and orientation. Mobile checks used Chrome device emulation. |
| Accessibility | Axe checks passed for entry, guide, settings and the Flow introduction. Keyboard controls, skippable onboarding, native zoom and semantic dialogs retained. This is automated coverage, not a VoiceOver certification. |
| Independent movement review | Read-only Muse review completed; findings and fixes are recorded in [flow-review.md](flow-review.md). |
| Visual inspection | Inspected the Flow HUD and introduction against the approved scene. Native Chrome preview left at the introduction. The embedded Codex browser rejected pointer capture during inspection and correctly offered retry/free-cursor fallback. |

The current 55 browser cases have passing results across the full regression run and the final focused run; a single final 55-case run was not repeated. Browser automation used installed Chrome 153.0.8010.52 on macOS 26.6.2, Playwright 1.63.0, Metal ANGLE and one worker. Existing Three/Rapier deprecation warnings were observed.

## Acceptance coverage and limits

The final browser checks cover 360-degree hover looking in both camera views (less than 5 cm drift after settling), hands-free sub-3 m/s cruise, scroll-to-hover and fresh-stroke restart, held/repeated clicks, metadata and heuristic momentum rejection, secondary-click menu access, climb/dive and view-facing, landing cancellation, Escape, blur, zoom, gesturestart, resize, lock loss, pending capture cancellation, rejected capture and retry, graphics recovery, and onboarding persistence.

Wheel metadata and missing-metadata sequences are injected test inputs. They verify controller behavior; they do not establish physical momentum behavior in Safari or comfort under a human hand. The maximum-speed stopping result is a deterministic unobstructed physics test. No new hardware latency, audio perception, force sensitivity, custom haptics, real iPhone performance, VoiceOver, or physical Safari acceptance is claimed.

Flow stays opt-in. The Mac Chrome/Safari comparison, twenty stop/look/resume cycles, accidental-action count and effort/confidence/calmness ratings remain **pending physical playtesting**, using [the acceptance protocol](../flow-trackpad.md#physical-acceptance--pending).
