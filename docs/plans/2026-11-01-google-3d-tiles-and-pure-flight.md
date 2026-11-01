# Plan: Pure 3D Flight Restoration + Google Maps 3D World & Sky-Gate System

- **Plan Revision:** `rev-2` (2026-11-01, updated after independent EGM review `0240be63-7d60-46a2-b6da-ca35d969c832`)
- **Baseline Commit:** `93a5b75` on `codex/hades-boss-showdown`
- **Minimum Reading List for Reviewer:**
  - `AGENTS.md`
  - `docs/DECISIONS.md`
  - `docs/plans/2026-11-01-concept-reset-and-recommendation.md`
  - `src/world/Scene.tsx`
  - `src/world/Suit.tsx`
  - `src/world/HermonCity.tsx`
  - `src/world/LegacySanctuaryFlora.tsx`
  - `src/game/CameraRig.tsx`
  - `src/game/Player.tsx`
  - `src/ui/Experience.tsx`
  - `src/ui/LegacyFlightOverlay.tsx`
  - `tests/flight.spec.ts`
  - `tests/accessibility.spec.ts`
  - `tests/layout-tokens.test.ts`

---

## 1. Goal & Scope

1. **Restore Pure 3D Flight as the Default Experience:**
   - Decouple the rejected Sanctuary Boss Duel (`GowArena`, `GowHud`, `GowWarrior`, isometric camera lock, and `stepIsoShooterVelocity`) from `state.shooter` so that standard play (`/` and `/?shooter=0`) always uses:
     - The 21-bone 3D winged flyer (`Suit.tsx` + `archangelWings.ts`).
     - The single-authority 3D chase / first-person camera (`CameraRig.tsx`).
     - Full 60 Hz 3D Rapier flight physics, soft wall/hill limit-escape (`limitSteer.ts`), and all 10 flight/gesture controls (`Player.tsx`).
     - Preserved free-flight HUD controls (`LegacyFlightOverlay.tsx`) and world props (`LegacySanctuaryFlora.tsx`).
   - Preserve all `gow*` modules on disk (and keep `GowArena` / `GowHud` accessible via explicit `?duel=1` session flag or direct unit test calls) so zero legacy code is deleted and `tests/gow-combat.test.ts` stays 100% green.

2. **Add the Hybrid Google Maps 3D Environment & Sky-Gate Flow System (`src/game/geoWorld.ts`, `src/world/GeoWorldLayer.tsx`, `src/ui/GeoFlightHud.tsx`):**
   - **Real-Time WGS84 Coordinate Frame (`wgs84ToEcef`, `ecefToEnuMatrix`, `meterOffsetToLatLng`):**
     - Anchors Three.js `[0, 0, 0]` to a real-world `(lat, lng, alt)` origin in East-North-Up (ENU) meters (`1 unit = 1 meter`). As the player flies through Three.js space, their live GPS `(lat, lng, altMSL)` updates in real time.
   - **4 Curated Real-World 3D Drop Zones (100% Offline Ready):**
     - `yosemite` — **Yosemite Valley · Half Dome (`37.7459° N, 119.5332° W, 1480m`)**: Towering granite cliff monoliths, valley river mirror, and 6 canyon Sky-Gates.
     - `manhattan` — **Manhattan · Lower Skyline (`40.7074° N, 74.0113° W, 42m`)**: High-rise skyscraper avenue canyons, harbor bay, and 6 skyline Sky-Gates.
     - `alps` — **Swiss Alps · Matterhorn Ridge (`45.9766° N, 7.6585° E, 3260m`)**: Knife-edge glacial horn peaks and high-altitude thermal rings.
     - `hermon` — **Mount Hermon · Dawn Massif (`33.4162° N, 35.8570° E, 2814m`)**: Sunlit alpine summit massif, cedar groves, and ridge Sky-Gates.
   - **Sky-Gate Awakening & Proximity Skim Loop (`stepGeoWorld`):**
     - Flying through any of the 6 glowing 3D **Sky-Gates** ignites the ring (`passed = true`), plays a procedural harmonic wind chord, adds an upward/forward **Thermal Surge** (`+6.5 m/s` vertical lift + surge), and updates the gate counter (`Gates n/6`).
     - Skimming within `10m` of terrain/structures while flying at `>= 10 m/s` accumulates **Proximity Skim Meters** (`skimMeters`) and activates a golden wing-skim aura.
   - **Optional Live Google Photorealistic 3D Tiles Streamer (`fetchGoogle3dTiles`):**
     - Reads `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or a runtime session key (`sessionStorage.getItem('halaverga-gmaps-key')`, never committed to Git).
     - When enabled (`tilesMode === 'google3d'`), queries `https://tile.googleapis.com/v1/3dtiles/root.json?key=...`, selects `.glb` tiles intersecting the active ENU region, transforms them from ECEF into local ENU meters, and mounts them in Three.js with full GPU resource disposal on region change or unmount.

---

## 2. Contracts, Data Flow & Affected Files

All modified and new files in `src/` must remain strictly **under 200 lines**:

| File | Action | Responsibility & Line Budget |
| :--- | :--- | :--- |
| `src/game/geoWorld.ts` | **NEW (`< 175` lines)** | Pure TS module: `GEO_REGIONS`, `geoRuntime` state singleton, `wgs84ToEcef`, `ecefToEnuMatrix`, `meterOffsetToLatLng`, `selectGeoRegion`, `stepGeoWorld`, procedural wind-gate chime synthesis (gated on `!useGame.getState().muted`), and bounded `fetchGoogle3dTileUrls` (with `AbortController` timeout and clean fallback to `'offline-curated'`). |
| `src/world/GeoWorldLayer.tsx` | **NEW (`< 175` lines)** | Lazy-loaded R3F component: calls `stepGeoWorld(runtime.position, runtime.velocity, state.flying, dt)` in `useFrame`, renders region-specific 3D monolith/skyscraper instanced landmarks (visual-only `InstancedMesh` outside the `z ∈ [40, 72]` spawn corridor), the 6 animated 3D Sky-Gate rings + thermal updraft pillars, and the optional streamed Google Photorealistic 3D Tiles `.glb` group. |
| `src/ui/GeoFlightHud.tsx` | **NEW (`< 165` lines)** | Lazy-loaded React HUD bar (`data-testid="geo-flight-hud"`): displays live GPS `(lat, lng, alt)`, 4 region switcher buttons (`Yosemite`, `Manhattan`, `Swiss Alps`, `Mt. Hermon`), `Gates n/6 · Skim m` counter, and `Google 3D Tiles` session toggle. Hidden when `state.tapControls || state.touchScheme === 'twin' || state.controlsOpen || state.voteOpen`. |
| `src/ui/GeoFlightHud.module.css` | **NEW (`< 85` lines)** | Scoped styles using `z-index: var(--z-play); pointer-events: none;` on `.hud` (with `pointer-events: auto;` on interactive controls), positioned at `bottom: max(54px, calc(env(safe-area-inset-bottom) + 46px)); left: var(--gx);` above `.legend`, with `>= 7:1` WCAG AA contrast. |
| `src/game/gowTypes.ts` | **EDIT (`< 160` lines)** | Ensure `duelEngaged: boolean` defaults to `false` on `gowRuntime`. |
| `src/game/CameraRig.tsx` | **EDIT (`< 100` lines)** | Change `const iso = state.shooter && state.camera === 'third'` to `const iso = gowRuntime.duelEngaged && state.camera === 'third'` so standard 3D chase/first-person camera is always active unless `?duel=1` is explicitly engaged. |
| `src/game/Player.tsx` | **EDIT (`< 195` lines)** | Define `const duel = gowRuntime.duelEngaged;` and replace all Sanctuary Duel `state.shooter` checks (lines 59, 83, 92, 94, 95, 103, 106, 111, 118, 129, 181) with `duel`, restoring full 3D flight (`advanceVelocity`, `applyEdgeTurns`, `thumbTurn`, `driveLimits`, `carve`, `limitStep`, and unbounded district movement) as the default. |
| `src/world/Suit.tsx` | **EDIT (`< 75` lines)** | Keep the 21-bone 3D winged flyer visible whenever `state.camera === 'third' && !gowRuntime.duelEngaged`. Only mount `<GowWarrior />` when `gowRuntime.duelEngaged` is true. |
| `src/world/Scene.tsx` | **EDIT (`< 85` lines)** | Lazy-load `<GeoWorldLayer />` inside `<Physics>` (wrapped in `<Boundary>` + `<Suspense>`). Only mount `<GowArena />` when `gowRuntime.duelEngaged` is true. |
| `src/world/LegacySanctuaryFlora.tsx` | **EDIT (`< 25` lines)** | Keep flora visible whenever `!gowRuntime.duelEngaged && geoRuntime.regionId === 'hermon'`. |
| `src/ui/LegacyFlightOverlay.tsx` | **EDIT (`< 70` lines)** | Keep `Lift/Land`, `FlowHud`, `SimpleTrackpadHud`, and desktop flight legend visible whenever `!gowRuntime.duelEngaged`. |
| `src/ui/Experience.tsx` | **EDIT (`< 175` lines)** | Set `gowRuntime.duelEngaged = query.get('duel') === '1'` synchronously before `setHydrated(true)`, and lazy-load `GeoFlightHud` by default (only mounting `GowHud` when `gowRuntime.duelEngaged` is true). |

---

## 3. Failure Behavior & Security Boundaries

1. **Offline / Missing Google Maps API Key:**
   - If no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or session key is present, or if `tile.googleapis.com` returns an HTTP/network error, `GeoWorldLayer` logs no uncaught error, sets `geoRuntime.tileStatus = 'offline-curated'`, and seamlessly renders the local 3D region relief, landmarks, and Sky-Gates.
2. **No Credentials in Git:**
   - Never hardcode or commit any API key. Any user-supplied key is stored only in `sessionStorage` (`halaverga-gmaps-key`) for the active tab.
3. **WebGL Resource Disposal & Context Loss:**
   - Switching regions or unmounting `GeoWorldLayer` disposes all created Three.js geometries, materials, and streamed tile scenes. `Scene.tsx` wraps `<GeoWorldLayer />` in `<Boundary fallback={null}>`.
4. **Playwright & Accessibility Compatibility:**
   - `GeoFlightHud` is hidden when `state.tapControls` or `state.touchScheme === 'twin'` is active, ensuring zero overlap with `TapControls` (`tests/accessibility.spec.ts` Test 1 & 3/5) or Twin-Stick touch clusters (`tests/accessibility.spec.ts` Test 2/4).
   - All buttons in `GeoFlightHud` have `min-height: 36px`, clear accessible labels, and `>= 7:1` contrast so axe-core WCAG 2.2 AA scans pass with zero violations.
5. **First-Load JS Budget (`<= 629.0 KB`):**
   - `GeoWorldLayer` and `GeoFlightHud` are loaded via `React.lazy` / `next/dynamic`, keeping landing first-load JS `<= 628.5 KB`.

---

## 4. Acceptance Checks

1. `wc -l` on all modified/created `src/` files is strictly `< 200` lines.
2. `pnpm typecheck && pnpm test` passes all 199+ test files (including `tests/gow-combat.test.ts`, `tests/layout-tokens.test.ts`, `tests/persistence.test.ts`, and new unit tests in `tests/geo-world.test.ts` covering `wgs84ToEcef`, `ecefToEnuMatrix`, `meterOffsetToLatLng`, `selectGeoRegion`, and `stepGeoWorld` Sky-Gate awakening).
3. `pnpm build && node scripts/check-first-load.mjs && node scripts/check-vote-build.mjs` succeeds with landing first-load JS `<= 629.0 KB`.
4. `CI=1 npx playwright test tests/flight.spec.ts tests/accessibility.spec.ts` passes all 9/9 browser and accessibility checks.
5. Visual inspection of live screenshots across all 4 Real-World Drop Zones (`Yosemite`, `Manhattan`, `Swiss Alps`, `Mt. Hermon`) and mobile portrait/landscape viewports confirms 3D flight, Sky-Gates, and HUD clarity.
