# Reconciled versions · October 9, 2026

The approved Blender district and cold storm atmosphere now share one build with the current shooting and flight systems. This is the version intended for main, so changing preview branches no longer drops gameplay or restores an earlier sunny scene.

## Branch reconciliation

| Version | Resolution |
| --- | --- |
| `codex/blender-world-art` at `ebf9633` | Authoritative district, water reflection, storm lighting and combat integration. |
| `codex/shooter-feel` at `c29a108` | Included through the art integration: cannon, drones, damage, impact/explosion effects and sound. |
| Controls picker, shooter, shooter-trackpad, screen cleanup, landing-pause, pause-dismiss, open-world, Envoy outfit, vote-and-deploy, sky-background, athletic-character and trackpad branches | Their committed tips are ancestors of the combined build; their current controls and gameplay remain active. |
| `codex/dep-audit` at `8556a4b` | Merged sharp/source-map-js patches; Next remains 16.3.8. |
| `codex/vercel-analytics` at `d9f9cb2` | Merged its history. The later page-scoped analytics boot remains authoritative: it respects privacy signals and leaves privacy/results pages script-free. The older root-layout component and its unused dependency are superseded. |
| `codex/parker-anatomy` at `b964283` | Preserved the editable anatomy proof, scripts and review images. The playable Envoy suit remains active. |
| `codex/environment-aesthetics` at `0d521fc` | Preserved committed evidence. Its older afternoon lighting and procedural district edits are superseded by the approved scene, including the verified collider layout. |
| `codex/world-atmosphere` at `261a101` | Preserved its review records and source studies. Its older sky, water and scenery mounting are superseded by the approved storm, reflection and Blender skyline. |

The unfinished terrain/celestial-body draft in the environment-aesthetics worktree remains there, untouched. It is not a verified version. The Next dependency proposals are covered by the 16.3.8 version in this build; the Vitest 4 proposal remains a separate toolchain change.

An ancestry check confirms every committed local `codex/*` branch tip is included in this reconciliation. Earlier task branches and their worktrees remain available; no drafts or worktrees were deleted.

## Verification

- `pnpm verify` passed: TypeScript, **2,368 tests in 188 files**, production build, first-load budget and server/static route checks.
- Landing scripts remain **628.8 KB** within the 629 KB gate; active scene, gameplay and interface code match the approved storm-and-shooting integration. Added terrain/waterfront source studies remain unmounted.
- `pnpm audit:prod` reports **no known vulnerabilities**.
- The full pinned-flight and movement suites pass with the approved collider layout. An older scenery removal caused two escape regressions during reconciliation; retaining the verified layout resolved both without weakening their budgets.
- All **71 production browser scenarios** passed in 5.8 minutes: desktop and touch shooting, classic blasting, desktop controls, the Controls picker, accessibility, flight, recovery, boundaries, pause dismissal and district resource recovery. Touch checks cover both orientations using Chrome emulation.

Earlier visual and timing records remain historical evidence for their stated commits; they do not measure this combined build. Physical iPhone Safari checks remain unverified.
