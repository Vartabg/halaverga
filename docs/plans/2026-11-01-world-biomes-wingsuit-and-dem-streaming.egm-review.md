# EGM Design Review Record: Regional 3D Biomes, Wingsuit Energy Flow, and Real-World DEM / 3D Tiles Streaming

- **Plan Path**: `docs/plans/2026-11-01-world-biomes-wingsuit-and-dem-streaming.md`
- **Plan Revision**: `rev-1` $\rightarrow$ `rev-2`
- **Reviewer Subagent**: `a1d1562d-13c9-4434-afe5-f505a0f417bc` (`research` fresh-context reviewer)
- **Verdict**: Conditional Pass $\rightarrow$ Resolved in `rev-2`

## Material Blockers Resolved in `rev-2`

1. **B1 — `LegacySanctuaryFlora.tsx` First-Load Budget & Reactivity**:
   - *Finding*: Importing `geoRuntime` into `LegacySanctuaryFlora.tsx` risks exceeding the `628.6 KB / 629.0 KB` first-load JS budget and fails to re-render when `geoRuntime.regionId` mutates outside Zustand state.
   - *Resolution*: Left `LegacySanctuaryFlora.tsx` 100% untouched. `GeoWorldLayer.tsx` toggles the existing `scene.getObjectByName('legacy-sanctuary-flora')` alongside `hermon-massif-visuals` and `distant-ranges` in `useFrame`.
2. **B2 — `'custom'` Region Contract (`Fly Any GPS`)**:
   - *Finding*: `GeoRegionId` and `GEO_REGIONS` needed a complete `'custom'` entry and `selectCustomGps(lat, lng, name?)` helper to prevent `undefined` lookups in `stepGeoWorld` and `GeoWorldLayer`.
   - *Resolution*: Added `'custom'` to `GeoRegionId`, populated `GEO_REGIONS.custom`, and exported `selectCustomGps(lat, lng, name?)`.
3. **B3 — Dive-to-Speed `0/0` `NaN` & Braking Guard**:
   - *Finding*: Applying horizontal dive thrust when `Math.hypot(vel.x, vel.z)` is near zero risks `NaN` velocity and could interfere with braking assertions in `tests/flight.spec.ts` and `tests/accessibility.spec.ts`.
   - *Resolution*: Guarded dive-to-speed horizontal acceleration behind `hSpd > 3.5 && vel.y < -1.8`, and updated `windState.boostTimer` inside `GeoWorldLayer.tsx` rather than `geoWorld.ts`.
4. **B4 — Synchronous Procedural DEM & Async Epoch Guard**:
   - *Finding*: `selectGeoRegion` must populate `demHeights` synchronously via `fillProceduralDem` before launching async `streamRealWorldDem`, and guard async completion with an epoch counter (`demReqEpoch`).
   - *Resolution*: `selectGeoRegion` runs `fillProceduralDem` synchronously and increments `demVersion`, while `streamRealWorldDem` discards stale responses via `reqId !== demReqEpoch`.
