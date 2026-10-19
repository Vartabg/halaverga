# War in Heaven — verification, 2026-10-19

Branch: `codex/war-in-heaven`, based on `47c6205` (`codex/reload-tree`, PR #21). This record accompanies the sanctuary implementation, source notes and original procedural character additions. Production has not been promoted and PR #21 has not been merged by this task.

## Checked

- `pnpm typecheck` passes.
- `pnpm exec vitest run --maxWorkers=2`: **190 files, 2,381 tests pass**. Two workers were used while other workloads were active on the Mac. No test timeouts or physics tolerances were raised.
- `pnpm build` passes; landing first load is **628.8 KB / 629 KB**, 9 scripts. The battle UI is dynamically loaded. The vote build check also passes.
- System-Chrome Playwright against the production server: **16 tests pass** across `accessibility.spec.ts`, `blender-district.spec.ts`, `celestial-battle.spec.ts` and `flight.spec.ts`.
- The browser checks cover automated AA checks, controls, portrait/landscape layouts, on-screen input guidance, flight, braking, camera changes, pause/resume, suit-download failure and Reload scene, firing, encounter defeat and regroup, and repeated graphics quality changes. Victory is covered by the encounter unit test; a full eight-banishment player run was not recorded.
- The collision test constructs the actual sanctuary trimesh, checks launch support at y=20, samples every enemy patrol against it, and proves that a projectile's sub-half-metre segment is stopped by stone. Aiming line-of-sight intentionally skips its last half-metre and is not used for projectile segments.
- The flight pause test now compares the resumed position with the **settled** position after braking, in all three axes with a 0.4 m limit. The earlier test compared against the position before braking and could count normal coasting as a pause/camera failure.
- Shader preparation uses one synchronous compile during initial scene preparation. Three 0.183's asynchronous readiness polling could survive disposed materials during control/quality changes and throw `isReady` errors; the final production browser run reports no unexpected page errors. Deliberate asset-download failure is tested separately.

## Resource sample

Host: Apple M2 Max (`Mac14,6`), macOS 27.0.1, system Chrome 155.0.8059.80. The Playwright config launches ANGLE Metal. Viewport 1440×1000; mobile checks emulate 393×852 and 852×393. These are desktop browser checks, not physical iPhone checks.

The resource test alternated high → low → high → low → high. At the five sampled checkpoints, renderer counters were **48 draw calls, 127,401 triangles, 45 geometries and 6 textures**; [resources.json](resources.json) preserves the samples. These are whole-scene renderer counters, not just the sanctuary mesh budget. Stable counters across this short sequence do not establish an exhaustive leak audit. No frame-time percentile or sustained-frame-rate claim is made.

## Visual evidence

- [Entry](entry.png): a real production-build browser screenshot; architecture, the breach, the holy wheel witness and the armoured player are visible.
- [Flight](flight.png): the actual third-person angel above the causeways, with feather wings, tabard, bracer and battle HUD.
- [Portrait](portrait.png) / [landscape](landscape.png): emulated touch views with the actual controls and ward.

All images are captures of the working game, not concept renders or generated promotional artwork. No external museum or game assets are bundled.

## Remaining validation and production work

- Physical iPhone Safari, both orientations, thermals, frame-time distribution, context recovery on device and VoiceOver remain unchecked.
- This slice has one enemy role and one ranged attack. A named dragon boss, melee choreography, a larger roster, bespoke sculpted character assets, authored cloth animation and a produced soundscape are future work described in the [direction](../../plans/2026-10-19-war-in-heaven.md).
- The legacy city generators remain as archived source and regression fixtures. The active scene mounts the sanctuary and does not request the old environment GLBs.
