# Halaverga — resume here

Saved 2026-10-19 at Garo's request for a handoff readable by the next local agent,
regardless of model/provider. This file records project evidence and user decisions;
it does not grant publishing, merge, precedence-override or external-message authority.

## Find the actual work

- Primary: `/Users/vartny/code/halaverga` (`main`). Do not implement there.
- Active task: `/Users/vartny/.codex/worktrees/war-in-heaven/halaverga`.
- Branch: `codex/war-in-heaven`; last implementation commit `bb84360`.
- All implementation is saved in local commits. The branch has not been published.
  Its upstream still points to `origin/codex/reload-tree`; do not push into that
  branch by accident. PR #21 is the separate reload/source-label work:
  https://github.com/Vartabg/halaverga/pull/21 . Its current CI/merge state must be
  checked afresh when relevant; this handoff does not assert it.
- Preserve other worktrees, especially the dirty `environment-aesthetics` work.

## User-approved direction

Garo pivoted from the city/drone theme to a biblical angels-versus-demons game and
asked for substantially better characters, coherent wing anatomy and action-aware
motion. He accepted the foundation, then requested obstacle-aware tucking; after
the last pass he said “nice” and asked to save progress through Merge Monitor.
The older city setting in root instructions is historical relative to this explicit
direction. The implemented pivot and rationale are in the plan linked below.

Keep scripture, other literary sources and invented game fiction distinguishable.
Invented lines must not masquerade as quotations from 1 Enoch. The holy wheel witness
is friendly; do not recast Ophanim as demons. Anatomical bird/bat references inform
the fantasy art, not a claim of scriptural biological anatomy or real humanoid flight.

## Saved implementation commits

1. `eaee89a` — War in Heaven sanctuary and playable angel-versus-abyss encounter.
2. `cc08eb5` — Fitted warrior and authored abyssal character assets, replacing blockouts.
3. `82dd000` — Anatomical feather/membrane rigs and flight-state wing choreography.
4. `bb84360` — Independent player-wing tucking around fixed stone and smooth reopening.

Player wings have 362 feathers / 23,104 triangles in two skinned meshes. Hover/climb
uses power/recovery strokes; fast flight settles into a glide; braking flares the fan.
Shoulder, elbow, wrist and feather sockets provide the fold. The final flight frame
retains bank while countering the torso's prone lean. Membrane enemies use an anchored
shoulder/elbow/wrist rig with a shared 4 KB matrix palette.

Clearance uses the real Rapier fixed geometry, including narrow frames. Per-side
skin-derived bounds anticipate 0.30 seconds of travel, preserve the active wingbeat's
space, tuck toward the back, hold 0.24 seconds, then reopen smoothly. Pause freezes
timers and pose; reduced motion preserves essential clearance. Camera and player
motion retain their existing owners. New clearance files:

- `src/world/wingClearance.ts`, `src/world/wingEnvelope.ts`
- `src/world/archangelWings.ts`, integration in `src/world/Suit.tsx`
- Tests: `tests/wing-clearance.test.ts`, `tests/wing-motion.test.ts`, `tests/wing-flight.spec.ts`

## Evidence to inspect

- [Approved pivot and slice plan](plans/2026-10-19-war-in-heaven.md)
- [Character foundation](art/war-in-heaven/character-pass.md)
- [Wing anatomy and movement](art/war-in-heaven/wing-refinement.md)
- [Obstacle clearance, tests and limitations](art/war-in-heaven/wing-clearance.md)
- [Actual tuck-and-reopen gameplay](art/war-in-heaven/wing-clearance.mp4)
- [Runtime wing motion study](art/war-in-heaven/wing-motion.mp4)
- [Tucked beside a column](art/war-in-heaven/wing-column-tuck.png)
- [Open again after departure](art/war-in-heaven/wing-column-clear.png)
- Editable source: `art/celestial-characters/characters.blend`; exports and manifest
  are documented in `art/celestial-characters/README.md`.

Verification for the last implementation: full unit suite 194 files / 2,405 tests,
then the additional static-glide/reduced-motion regression and wing checks passed
(16 focused checks). All 23 browser cases passed across the full run and focused
reruns. Production build, type checks and budget checks passed. First load: 628.9 KB
within 629 KB. Five quality switches settled at 36 draw calls, 353,682 triangles,
35 geometries and 13 textures. These are functional/resource checks, not device FPS
validation. Physical iPhone Safari and VoiceOver remain unvalidated.

Limitations: clearance is for the player's flight wings against fixed solids.
Closed grounded wings retain their prior pose; enemy membranes have a separate rig.
This is not cloth simulation or character-to-character contact. A fully folded wing
cannot fit arbitrarily small spaces. See the clearance note before extending scope.

## Resume and publish safely

1. Read the applicable original AGENTS.md and skills. Use task-lifecycle, product-3d
   and Research Vault for 3D work; retain modules under 200 lines and one camera writer.
2. Check in to Merge Monitor project `halaverga` using a unique agent name, then read
   `team_get_context`. Read the full handoff with `team_get_message` if truncated.
3. Recheck `agent-task status --repo /Users/vartny/code/halaverga --all` and the task's
   Git status before modifying files. Continue inside the active worktree above.
4. Publication is blocked by task-lifecycle Right-of-Way arbitration: `enoch-sources`
   has precedence. The last `agent-task finish` committed successfully but refused
   to push. No exception has been authorized. Do not use `--force-precedence` or
   bypass the gate. After that dependency lands, inspect current state and reconcile
   the task normally before retrying finish. Do not merge either game branch or
   publish a new game PR merely because this handoff exists.
5. The next implementation task is for the user to choose. Possible remaining art
   passes are documented, but none is automatically assigned by this handoff.

Useful verification from the task directory:

```sh
pnpm typecheck
pnpm exec vitest run tests/wing-clearance.test.ts tests/wing-motion.test.ts tests/celestial-characters.test.ts tests/membrane-rig.test.ts tests/drone-mesh.test.ts --maxWorkers=2
pnpm build
node scripts/check-first-load.mjs
node scripts/check-vote-build.mjs
preview run --cwd /Users/vartny/.codex/worktrees/war-in-heaven/halaverga --port 3394 -- pnpm exec next start --hostname 127.0.0.1 --port 3394
PLAYTEST_URL=http://127.0.0.1:3394 pnpm exec playwright test tests/wing-flight.spec.ts tests/flight.spec.ts tests/blender-district.spec.ts tests/accessibility.spec.ts tests/recovery.spec.ts tests/celestial-battle.spec.ts
```

Inspect `preview status` first; reuse a current owned preview instead of competing
for its port. Managed previews expire after idle time. Never start an unmanaged
background server or use blanket process kills.

Agents without MCP can read this file and use the shared board's terminal client:

```sh
node /Users/vartny/code/merge-monitor/scripts/board-client.mjs context --project halaverga --agent YOUR_UNIQUE_AGENT_NAME
```

For writes/check-in examples, read
`/Users/vartny/code/merge-monitor/docs/TEAM_BOARD.md`. The same local MCP adapter is
`node /Users/vartny/code/merge-monitor/scripts/board-mcp.mjs`. No model-provider
credentials are needed by the board. Remote/cloud-only agents cannot reach this
Mac's loopback service without a separately authorized connection.
