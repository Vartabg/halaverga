# Meridian storm atmosphere

This records the sky-only pass `d2501a4`. The subsequent [shooting integration](SHOOTING-INTEGRATION.md) combines it with the current game; the timings and art comparison below preserve the earlier atmosphere study.

The user requested a focused sky and atmosphere revision because the sunny setting contradicted the mood of the ruined district. This pass depicts severe weather at the 2113 arrival. It does not imply smoke or ash has remained from the 2033 catastrophe or add a new cause to the story.

- Continuous slate overcast, overlapping dark cloud banks, finer underside detail and distant rain curtains painted into the sky shader. No visible sun disk or blue-sky opening.
- Cooler, weaker direct light, broad cool environment reflection and softer shadows. Existing warm architectural accents remain part of the level.
- Fog begins at 70 m and reaches full density at 340 m. Sky and both water tiers use the same horizon color, preserving nearby silhouettes and canal contrast.
- The sky ignores camera translation while retaining its orientation. It stays at the far depth in both the normal view and the water reflection, without a second camera writer.
- Weather is static: no flashing lightning, animated cloud travel, particle storm, new render pass or new texture download. Existing water animation still honors pause and reduced motion.

The changes are limited to `productionSky.ts`, `Atmosphere.tsx`, `EnvironmentLight.tsx`, `CanalReflection.tsx`, `Scene.tsx` and a shared `weather.ts` color. The Blender geometry and its colliders, movement rules and camera controls are unchanged.

The [comparison viewer](../../../../public/docs/art/storm-front/index.html) uses actual game captures. Its previous-daylight image is the first Blender pass, so the comparison isolates this atmospheric revision. The approach capture has small timing differences; it is not a pixel-aligned benchmark.

## Verification

Verified locally on October 9, 2026, in the linked task worktree following `7b6dc91`. Next.js 16.3.5, Three.js 0.183.2 and Chrome 154.0.8037.98. The build stamp records its parent revision without distinguishing uncommitted changes; `source-hashes.json` identifies the exact runtime source used for this pass.

- TypeScript and production build passed.
- All 232 unit tests in 30 files passed, including movement, navigation and actual district asset decoding.
- Landing first-load isolation passed: 8 scripts, 618.8 KB.
- Eleven browser scenarios passed on the final production build: flight/braking, camera switching, pause, resize, checkpoint safety, district bounds, landing cancellation, touch release, context loss, failed model retry and repeated graphics-tier cleanup.
- Automated Axe WCAG 2/2.1/2.2 AA checks passed for entry, field guide, settings and tap controls with reduced motion enabled.
- Desktop arrival/approach screenshots and 393 × 852 → 852 × 393 touch emulation produced no console or page errors. Rotation drift was 0.00417 m. Both graphics tiers were captured; see `capture.json`, `browsers.json`, `landscape.png` and `lighter.png`.

Physical iPhone Safari, thermal/battery behavior and VoiceOver have not been tested. Desktop touch emulation does not establish a physical-device pass. The matching Playwright WebKit binary was unavailable during the earlier attempt in this task; no Safari or WebKit pass is claimed.

The reviewed [Research Vault guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md) informed the shared lighting, bounded effects and resource ownership. The trust audit passed earlier in this task. Independent render review remains unavailable after the recorded Gemini timeouts in [the Blender pass](../blender-district/README.md); no independent approval is claimed.

## Five-minute desktop measurement

Measured against the final production build at `http://127.0.0.1:3486`. The deployment URL embedded in the raw report is the application's configured public URL; the measured session was local.

- Apple M2 Max, macOS/Darwin 25.6.0, headless system Chrome 154 with ANGLE Metal.
- 1440 × 1000, DPR 1, full detail, third-person camera, shadows and 512-square canal reflection enabled.
- Repeated lift, canal flight, turns and descent at 13 m/s cruise, resetting to the terrace each cycle; 300 active seconds and 17,983 samples.
- p50 **16.7 ms**, p95 **17.4 ms**, **0 frames over 50 ms**, **0 console/page errors**.
- Peak **192 draw calls**, **2,239,510 triangles** across scene/reflection/shadow passes, **64 geometries**, **18 textures**. Render-pass triangles are not unique asset counts.
- Other development applications remained active and power state was not recorded. This is a bounded desktop observation, not an isolated speed comparison or an iPhone performance result.

Raw data: [profile/measurements.json](profile/measurements.json). Route capture: [profile/route.png](profile/route.png).

Reproduce from the worktree with the production preview running:

```sh
PLAYTEST_URL=http://127.0.0.1:3486 REVIEW_OUTPUT=/tmp/storm-review node scripts/review-environment.mjs
PLAYTEST_URL=http://127.0.0.1:3486 REVIEW_OUTPUT=/tmp/storm-review node scripts/review-district-browser.mjs
PLAYTEST_URL=http://127.0.0.1:3486 PROFILE_SECONDS=300 PROFILE_OUTPUT=/tmp/storm-profile node scripts/profile.mjs
```
