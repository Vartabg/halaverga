# Plan: Regional 3D Biomes, Wingsuit Energy Flow, and Real-World DEM / 3D Tiles Streaming

- **Date**: 2026-11-01
- **Revision**: `rev-2` (Updated after independent EGM review `a1d1562d-13c9-4434-afe5-f505a0f417bc`)
- **Status**: Approved for Implementation

## 1. Context & Purpose

Following the merge of the Google Earth 3D Drop Zones & Sky-Gate foundation (`991c290` on `main`), the user selected four coordinated upgrades:
1. **Merge & Clean Up Worktrees** (Completed: reaped 31 merged worktrees and fast-forwarded `main` to `991c290`).
2. **Transform the 3D Environments per Region**: Replace the static Mount Hermon snow background when flying in Yosemite, Manhattan, Swiss Alps, or Custom GPS coordinates with a dedicated 64x64 displaced regional terrain & water mesh, 48 instanced 3D structures (Manhattan skyscraper blocks, Yosemite Ponderosa pines & granite buttresses, Matterhorn alpine spires), and per-biome atmosphere fog tinting.
3. **High-Speed Wingsuit Flow Mechanics**: Add dive-to-speed energy conversion (pitching down while flying forward builds airspeed up to `35 m/s` and activates wingtip condensation trails; pitching up converts excess speed into climb lift), a `1.0x -> 5.0x` proximity skim multiplier, and a per-region 6-gate course timer with `localStorage` personal bests.
4. **Real-World Elevation DEM Streaming & Hierarchical 3D Tiles**: Stream real-world AWS Terrarium elevation tiles (`s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{x}/{y}.png`, free, public, CORS-enabled, zero API key required) for any `(lat, lng)` on Earth—including a `Fly Any GPS` coordinate input in the HUD—with synchronous deterministic procedural fallback (`fillProceduralDem`) and recursive child tileset traversal in `fetchGoogle3dTileUrls`.

## 2. Supplied Reading List for Independent Review

- `AGENTS.md`
- `src/game/geoWorld.ts`
- `src/world/GeoWorldLayer.tsx`
- `src/world/MassifTerrain.tsx`
- `src/world/LegacySanctuaryFlora.tsx`
- `src/world/WingTrails.tsx`
- `src/ui/GeoFlightHud.tsx`
- `src/ui/GeoFlightHud.module.css`
- `tests/geo-world.test.ts`
- `tests/flight.spec.ts`
- `tests/accessibility.spec.ts`

## 3. Architecture & Module Responsibilities (`< 200` Lines Per File)

### 3.1 `src/game/geoWorld.ts` (`< 195` lines)
- **Extended Region Contract (`B2`)**:
  - `export type GeoRegionId = 'yosemite' | 'manhattan' | 'alps' | 'hermon' | 'custom';`
  - Includes a full `GEO_REGIONS.custom` entry and exports `selectCustomGps(lat: number, lng: number, name?: string)` which clamps `lat` (`-85..85`) and `lng` (`-180..180`), updates `GEO_REGIONS.custom`, and calls `selectGeoRegion('custom', true)`.
- **Web Mercator & Terrarium DEM Math (`B4`)**:
  - `latLngToTileXY(lat, lng, zoom)`: Converts WGS84 `(lat, lng)` to slippy-map tile `(x, y)` and fractional UV `(u, v)`.
  - `decodeTerrariumRgb(r, g, b)`: Decodes AWS Terrarium elevation in meters via `(r * 256 + g + b / 256) - 32768`.
  - `fillProceduralDem(regionId, lat, lng, out)`: Synchronously populates deterministic 64x64 local relief in `out` (`Float32Array(4096)`), called immediately inside `selectGeoRegion` (and module init) before incrementing `geoRuntime.demVersion`.
  - `streamRealWorldDem(lat, lng)`: Guards async execution with `const reqId = ++demReqEpoch;`, fetches `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{x}/{y}.png` (2.5s timeout), samples a 64x64 grid around `(u, v)` via `<canvas>`, discards stale responses (`reqId !== demReqEpoch`), blends into `geoRuntime.demHeights`, sets `geoRuntime.demStatus = 'live-dem'`, and increments `geoRuntime.demVersion`.
- **Wingsuit Flow & Course Stopwatch (`stepGeoWorld`, `B3`)**:
  - Explicit `geoRuntime` contract: `demHeights: Float32Array`, `demVersion: number`, `demStatus: 'procedural' | 'streaming' | 'live-dem'`, `skimMultiplier: number`, `diving: boolean`, `courseRunning: boolean`, `courseTimeSec: number`, `bestTimeSec: number | null`, `airspeedKmh: number`.
  - **Dive-to-Speed Energy Conversion**: Requires horizontal speed `const hSpd = Math.hypot(vel.x, vel.z);` to satisfy `hSpd > 3.5` and `vel.y < -1.8` before applying horizontal dive acceleration along `(vel.x / hSpd, vel.z / hSpd)` (capped at `35 m/s`), preventing `0/0` `NaN` or horizontal thrust during braking/hovering. Sets `geoRuntime.diving = flying && hSpd > 3.5 && vel.y < -1.8`. When climbing (`vel.y > 1.2`) with `hSpd > 15`, converts excess horizontal speed into vertical lift.
  - **Skim Multiplier (`1.0x` to `5.0x`) & Course Timer**: Proximity skimming ramps `skimMultiplier` up to `5.0x`. Clearing Gate 1 starts `courseRunning = true`; clearing Gate 6 stops the timer and persists `bestTimeSec` in `localStorage` (`halaverga:geo-pb:<regionId>`).
- **Hierarchical 3D Tiles Traversal (`fetchGoogle3dTileUrls`)**:
  - Parses `root.json` and recursively traverses child `.json` tilesets (up to 2 hops) to collect `.glb` URIs with session parameters.

### 3.2 `src/world/geoBiomeBuilder.ts` (`< 180` lines, lazy chunk)
- Imported only by `src/world/GeoWorldLayer.tsx` (0 KB impact on landing first-load JS).
- `createBiomeGround()` & `updateBiomeGround(ground, regionId, heights)`:
  - Builds and updates a `64x64` displaced terrain mesh (`340m x 340m`) with a smooth launch terrace blend around `(0, 19.6, 48..68)` and biome-specific vertex colors (`yosemite`: granite walls + pine floor + turquoise Merced River; `manhattan`: slate street grid + avenue strips + river channels; `alps`: glacier gorge + Matterhorn snow ridges; `custom`: hypsometric elevation ramp), plus a translucent water plane (`y = 6.2m`).
- `createBiomeInstances()` & `updateBiomeInstances(instMesh, regionId, heights)`:
  - Updates a 48-instance `InstancedMesh` per region (`manhattan`: 48 glass/steel skyscrapers in city blocks; `yosemite`: 48 Ponderosa pines & granite buttresses; `alps`/`custom`: 48 alpine rock spires).

### 3.3 `src/world/MassifTerrain.tsx` (`B1`)
- Wraps the visual `<mesh>` array in `<group name="hermon-massif-visuals">` while keeping `<TrimeshCollider>` outside the group.
- `src/world/LegacySanctuaryFlora.tsx` remains **100% untouched** (`0` new imports); its existing `<group name="legacy-sanctuary-flora">` is toggled directly by `GeoWorldLayer.tsx`.

### 3.4 `src/world/GeoWorldLayer.tsx` (`< 175` lines)
- Mounts the 6 Sky-Gates, hero landmarks, proximity skim ring, and `geoBiomeBuilder` ground + 48-instance `InstancedMesh`, disposing all geometries/materials on unmount.
- Toggles `hermon-massif-visuals`, `legacy-sanctuary-flora`, and `distant-ranges` visibility (`!gowRuntime.duelEngaged ? geoRuntime.regionId === 'hermon' : ...`), tints `scene.fog.color`, and sets `windState.boostTimer = Math.max(windState.boostTimer, 0.2)` when `geoRuntime.diving || geoRuntime.thermalTimer > 0`.

### 3.5 `src/ui/GeoFlightHud.tsx` (`< 185` lines) & `src/ui/GeoFlightHud.module.css` (`< 120` lines)
- Displays live GPS (`Lat · Lng · Alt MSL`), airspeed (`km/h`), DEM badge, `Gates n/6 · Skim m (1.0x–5.0x ⚡)`, and Course Timer (`00.0s` / `PB`).
- Includes the 4 curated drop-zone pills, **`Fly Any GPS`** toggle (`aria-pressed={snap.regionId === 'custom'}` with preset chips and freeform `Lat, Lng` input meeting WCAG 2.2 AA `min-height: 30px` and `>= 4.5:1` contrast), and **`Google 3D Tiles`** toggle.

## 4. Verification & Acceptance Gates

1. `wc -l` confirming `src/game/geoWorld.ts`, `src/world/geoBiomeBuilder.ts`, `src/world/GeoWorldLayer.tsx`, `src/ui/GeoFlightHud.tsx`, and `src/ui/GeoFlightHud.module.css` are all `< 200` lines.
2. `pnpm typecheck && pnpm test` passing all 200 test files (including expanded `tests/geo-world.test.ts` covering `latLngToTileXY`, `decodeTerrariumRgb`, `fillProceduralDem`, `streamRealWorldDem`, `selectCustomGps`, wingsuit dive/climb/skim/timer, and recursive `fetchGoogle3dTileUrls`).
3. `pnpm build && node scripts/check-first-load.mjs && node scripts/check-vote-build.mjs` confirming landing first-load JS `<= 629.0 KB`.
4. `CI=1 npx playwright test tests/flight.spec.ts tests/accessibility.spec.ts` passing (`9/9`).
