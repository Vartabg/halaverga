# Verification

Checked in the isolated `codex/blender-world-art` worktree against base `e60a0f6`, on October 9, 2026. The art pass has not been merged or deployed.

This record covers the initial Blender pass, committed as `7b6dc91`. Its screenshots and performance measurement precede the storm atmosphere revision. See [the storm verification](../storm-front/README.md) for the current lighting and sky.

- TypeScript check: passed.
- Vitest: 232 tests passed across 30 files, including movement, route clearance, landings, suit animation, collision sweeps and actual Meshopt decoding of the shipped district asset.
- Production build: passed (Next.js 16.3.5, Three.js 0.183.2).
- Landing first-load isolation: passed; 8 scripts, 618.8 KB, without the scene markers checked by `check-first-load.mjs`.
- Browser checks: 11 relevant scenarios passed across the initial run and a focused rerun. Coverage includes keyboard flight, braking, pause/resume, camera switching, touch release, portrait/landscape resize, landing cancellation, context-loss recovery, model download recovery, checkpoint safety and graphics-tier resource cleanup.
- Automated accessibility: entry, field guide, settings and tap controls passed Axe WCAG 2/2.1/2.2 AA checks with reduced motion.
- Full-detail screenshots: desktop arrival, viaduct approach and portrait capture; no console or page errors.
- High/low/high/low/high switching: geometry/texture counts settle to the same values for each repeated tier, and the lighter tier has fewer textures. This is a bounded regression check, not a claim that every possible leak is excluded.

The first accessibility attempt exceeded the default five-second readiness wait while two browser runs were active. It passed on the sequential rerun without changing that test or its timeout. The first new graphics-switching test used a label-text locator that did not resolve the select; it was corrected to its accessible combobox role. The asset test originally made an assertion per vertex and exceeded its time limit under load; it now checks the same finite-coordinate condition in one accumulated assertion per mesh.

Physical iPhone Safari frame-time, thermal, battery and VoiceOver checks remain unperformed. Desktop viewport and touch emulation do not replace those checks. External independent reviewers were unavailable; see README.md for the recorded failures.

## Five-minute desktop measurement

Measured against the production build at `http://127.0.0.1:3486`, with the uncommitted art pass on base `e60a0f6`. The embedded deployment URL is the application's configured production URL; this measurement was local, not a live deployment check.

- Physical machine: Apple M2 Max, macOS/Darwin 25.6.0, headless Chrome 154 using ANGLE Metal.
- 1440 × 1000, DPR 1, full detail, third-person camera, 512-square reflection and shadows enabled.
- Repeated launch, canal travel, turns, descent and return to the terrace, 13 m/s cruise mode; 300 active seconds, 18,000 samples.
- p50: **16.7 ms**; p95: **17.4 ms**; frames over 50 ms: **0**; console/page errors: **0**.
- Peak frame resources: **192 draw calls**, **2,239,510 triangles** across scene/reflection/shadow rendering; **64 geometries**, **18 textures**. These are render-pass totals, not unique asset triangle counts.
- Other development processes were active on the host; power state was not recorded. This is a bounded desktop observation, not an isolated benchmark, before/after speed comparison, or an iPhone performance claim.

Raw report and workload: [profile/measurements.json](profile/measurements.json). Route capture: [profile/route.png](profile/route.png).

## Additional delivery checks

The GLB validator reported no errors or warnings. It cannot inspect the Meshopt extension itself; the actual Three.js decoder test and successful browser loads cover that delivery path. Its unused-UV informational entries are expected because the game supplies the material maps at runtime.

Chrome also exercised touch emulation at 393 × 852 and 852 × 393, including the lighter graphics tier. The attempted desktop WebKit check could not complete with the old installed binary; the matching browser binary required by Playwright 1.63.0 was unavailable. No WebKit or Safari pass is claimed.
