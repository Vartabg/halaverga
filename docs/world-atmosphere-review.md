# Meridian environment · September 22, 2026

The flooded 2113 district now uses a violet-grey storm ceiling, a muted amber sun and dark teal floodwater. The water samples the same procedural sky as the dome, with quieter irregular ripples, silt along the retaining walls and a restrained skimming wake. Fog, building reflections and directional lighting share the atmosphere palette. Reduced motion stills the sky and water; pausing stops their clocks.

Broken quay rails, leaning street lamps, rust streaks, drowned steps, driftwood, service cabinets, road barriers and an abandoned transit shelter give the waterfront more signs of its former use. A surrounding ridge and weathered hillside blocks extend the distant silhouette. The central skyline has floor bands, exposed roof frames and broken setbacks. New detail is combined into the existing city geometry and five material groups. New traversable-size obstacles have collision shapes; the authored route remains clear. The playable district boundaries are unchanged.

## Actual browser captures

- [Arrival terrace](images/world-atmosphere/arrival.jpg)
- [Flooded boulevard at water level](images/world-atmosphere/water-level.jpg)
- [Aerial view](images/world-atmosphere/aerial.jpg)
- [Portrait viewport, lighter graphics](images/world-atmosphere/portrait.jpg)
- [Landscape viewport, lighter graphics](images/world-atmosphere/landscape.jpg)

These are game captures from headless system Chrome on Mac. The phone shapes are viewport emulation. The [visual report](world-atmosphere-visual-checks.json) records capture positions, browser version, errors and exact world-source hashes. Both full and lighter graphics, first/third person, and reduced motion were exercised; no browser errors were recorded.

## Desktop timing sample

The [60-second report](performance/world-atmosphere-mac-chrome.json) records the Apple M2 Max on battery, Chrome 153/ANGLE Metal, 1440×1000 at DPR 1, full detail and third-person cruise. Median frame time was 16.7 ms and p95 was 17.5 ms, with zero sampled frames above 50 ms. Peaks were 15 draw calls, 588,290 reported triangles, 11 geometries and 14 textures. No browser errors were recorded. This short desktop run establishes neither a speedup over the previous environment nor iPhone performance.

## Verification

- TypeScript, all 230 Vitest tests, production build and lazy first-load check passed. The landing page loads 614.9 KB of scripts without the scene code.
- 13 Playwright checks passed: movement/braking, perspective changes, portrait/landscape resize, automated WCAG AA scans, landing cancellation, graphics-context and asset recovery, invalid checkpoints, district boundaries and one-thumb controls.
- Flight routes and seeded high-speed sweeps use the updated city colliders.
- Task collision scan: no file contention or merge conflicts after limiting the patch to the environment.

Reproduce visual checks with a managed production preview, then:

```sh
PLAYTEST_URL=http://127.0.0.1:3368 node scripts/review-world-atmosphere.mjs
```

The implementation follows the **reviewed** [Research Vault rendering guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md): retained single camera ownership, GPU/ref updates outside React state, existing DPR caps, shared material batches, bounded procedural effects and explicit resource disposal. No new asset downloads or dependencies were introduced.

Physical iPhone Safari performance in both orientations, VoiceOver and the five-minute target-device playtest remain unverified. The desktop sample is diagnostic evidence only. This branch is a local/branch playtest update; production deployment is separate.
