# Breach encounter verification

Branch: `codex/breach-slice`, starting at integration508207a, with own frozen camera/arena/warden/hover prerequisites replayed through14787ab. All new work is isolated from primary and integration. Assignment31ba378b; original self-owned run stopped on lease expiry before further edits, then continued under10fda2b9 with a fresh claim. No precedence override, integration/main merge or production deployment.

## New behavior

Useful lower collision cover, upper cantilever/perch and clear central dueling lane; caster elevation changes; final warden armor requires a defended opening; heavier actual elite contact and recovery pose; local sealed-ground aftermath and progressive breach color; bounded introductory guidance. Standard release-to-hover and look-only phone drags retained.

## Evidence

- Typecheck and an initial production build pass. Landing first load9scripts629.0KB/629KB; vote route build checks pass. Final checks recorded below.
- New pure geometry checks pass: body-radius2.1m routes, projectile cover, exposed nave, high-to-warden line and geometry budget35252triangles before removal of one decorative upper ring.
- New combat checks pass: protected last armor layer, actual-contact beat, reduced-motion bypass and high-speed release to hover. Existing wardens and lesser-chain contracts pass in focused checks.
- Initial actual-input route playthroughs2/2 in393×852 and852×393 pass. Both low and high routes reached with held keyboard controls in touch emulation; no teleportation. Scene-touch look from high hover stays under0.35m drift and0.5m/s. Low-route ward remains3; both active route views pass automated WCAG A/AA checks.
- Four actual-input warden scenarios4/4 pass: lancer and cantor, both phone orientations. Each covers two attacks, defense, two physical counter contacts, repositioning and bind/cast finish, with no page errors. This preceded final decorative/HUD/reduced-motion reveal refinements; final game-rule changes were already present.
- Further browser checks28/28 pass: automated AA entry/guide/settings/control sheets, three lesser-demon chain scenarios, Flow interruption/graphics recovery, native held-Fly cancellation/rotation/keyboard activation, second-finger target taps and look-only hover in both orientations.
- After the final readability refinement, route playthroughs and portrait/landscape warden control layouts4/4 pass again. Final route images are saved outside Git in the chat's `breach-encounter/` evidence directory.

## Failures and review boundaries

The first new unit helpers incorrectly assumed a strike could not land in the command frame and inherited a warden tell during a synthetic contact. Helpers were corrected to assert landed contact and isolate armor accounting. Actual defense is tested separately with real attacks and in browser.

One broad run initially passed2536/2537 with that helper failure; the corrected focused run passed11/11. A later broad run competed with multiple browser jobs and hit a warm-build timing threshold, two30s timeouts and worker RPC timeouts. The unchanged skin suite passed8/8 alone. A quiet full run with two workers is the final suite, recorded below; competing runs are not presented as successful runs or device performance measurements.

Gemini3.8Flash through existing Antigravity returned two timed-out empty responses. Its terminal SUCCESS label did not contain a usable review and was not accepted as review evidence. A separate read-only Codex source reviewer found no concrete new correctness bug. It did not run checks and flagged queued/expired counter paths, diagonal cover navigation and seal/reset/reduced-motion lifecycle as edges not independently exercised. Formal Claude cross-review remains separate and is required before integration.

Browser evidence uses macOS system Chrome with phone viewports/touch emulation, not an actual iPhone. Physical Safari/Chrome, VoiceOver, sustained thermal behavior and player enjoyment are untested. No new physical-phone FPS claim.

## Final receipt

Pending final quiet verification, frozen commit, normal task-lifecycle result and isolated Vercel preview/QR. These are recorded in the external evidence receipt so the published commit can remain immutable.
