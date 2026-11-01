# Pure Exploratory Flight & Visual Overhaul Plan (Mount Hermon at Dawn)

**Date:** 2026-10-28  
**Branch / Worktree:** `codex/hades-boss-showdown` (`/Users/vartny/.codex/worktrees/hades-boss-showdown/halaverga`)  
**Status:** Proposed for EGM Design Review

---

## 1. Context, User Direction & Concept Brief

### Who It Is For & Core Experience
- **Audience & Purpose:** A browser-first 3D aerial exploration playtest set on **Mount Hermon at dawn in the days of Jared — the Watchers' descent (*1 Enoch 6*)**: first light on snow, stars still fading overhead, dawn mist over the plain below, clear summit air.
- **What the Player Does, Feels & Discovers:** The player steps to the edge of the Threshold of Hermon promontory, lifts off on feathered wings, dives into the mist-filled cloven gorge, threads the natural stone arch, rides luminous dawn wind currents and thermal updraft rings, and ascends to the High Sanctuary of the Throne on the snow-mantled eastern peak.
- **Concrete Action-to-Result Loop (*Sky: Children of the Light* / *Journey* style):**
  - **Takeoff & Carve:** Pressing Space / Lift or steering off the promontory unfolds the feathered wings; banking into a turn rolls the body and streams silky, tapering golden-white condensation ribbons from both wingtips.
  - **Dive & Soar:** Pitching down into the gorge builds speed, widens peripheral FOV smoothly, and intensifies wingtip trails; pulling up converts that speed into a sweeping climb.
  - **Wind-Riding & Thermal Rings:** Flowing golden wind streams trace the canyon route through the Cloven Arch and up the eastern peak. Flying through a Dawn Thermal Ring pulses the ring with warm light, triggers a smooth upward/forward thermal boost, widens camera FOV with a gentle breath, and supercharges the wingtip ribbons.

### Accepted vs. Rejected Decisions
- **Accepted (User Confirmed 2026-10-28):**
  - Stay web-first (React Three Fiber / Three.js / Rapier).
  - **Pure exploratory flight first (*Sky: Children of the Light* / *Journey* style):** strip out the half-baked hack-and-slash combat completely and make soaring, diving, and wind-riding over Mount Hermon feel incredible and visually breathtaking first.
  - Approved setting (`AGENTS.md`): Mount Hermon at dawn (*1 Enoch 6*), first light on snow, stars fading overhead, dawn mist over the plain below, clear summit air.
- **Rejected (Must Be Removed / Replaced):**
  - Half-baked hack-and-slash boss/spear combat (`BossEncounter`, `SemjazaGLB`, `SpearGLB`, `BossHud`, `DialogueBox`, floating detached spears, blocking dialogue modals, giant boss health bars).
  - Legacy sci-fi drones and arm-cannon blaster clutter during normal play.
  - Programmer-art low-poly visuals: flat-shaded purple/brown triangle facets (`crag = normal.y < .68` in `massifGeometry.ts`), jagged black `fwidth(nW)` triangle wireframe lines and `fract(vInkW.y)` zebra stripes (`paintInk.ts`, `Skyline.tsx`), black wireframe torus rings behind the angel's head (`angelRegalia.ts`), and flat-shaded 9-sided cylinder trees outlined in black (`Cedars.tsx`).

---

## 2. Root-Cause Diagnosis of Previous Visual & Gameplay Failures

1. **`fwidth()` & `fract()` Ink Shaders on Coarse Geometry (`src/world/paintInk.ts`, `src/world/Skyline.tsx`, `src/world/angelRegalia.ts`, `src/world/featherMaterial.ts`, `src/world/Cedars.tsx`):**
   - `paintInk.ts` computed `length(fwidth(nW))` and `fract(vInkW.y / 8.5)` over 5m terrain triangles, drawing jagged black wireframe lines along triangle edges and horizontal zebra stripes across cliffs, while tinting shadows deep purple (`vec3(0.32, 0.24, 0.48)`).
   - `angelRegalia.ts` attached two thin 6-sided `TorusGeometry` rings (`radius = 0.256, 0.276`) to the head bone and ran `length(fwidth(vNormal))` across all character materials, turning the halo into a jagged black double-wireframe circle clipping through the hair and adding dark pixel noise to cloth and feathers.
2. **Flat-Faceted Terrain Normals (`src/world/massifGeometry.ts`):**
   - Line 72 set `const crag = isArch || normal.y < .68`, forcing every mountain slope steeper than $47^\circ$ to use unsmoothed per-triangle `faceNormals` instead of shared `vNormals`. Every 5m grid triangle read as a hard polygon facet.
3. **Combat Clutter & Input Collision (`src/world/BossEncounter.tsx`, `src/ui/BossHud.tsx`, `src/ui/DialogueBox.tsx`):**
   - Spawning into a blocking dialogue modal and giant boss health bar while a detached spear floated in midair next to the player broke immersion and collided with trackpad/mouse flight inputs.

---

## 3. Architecture & Module Design (< 200 Lines per File)

### 3.1 Scene & UI Cleanup
- **`src/world/Scene.tsx` (< 90 lines):**
  - Remove `BossEncounter` import and mount.
  - Restore `LabLayer` (`GestureTrack`, `DrawProbe`, `GestureRibbon`, `HeroTrail`) so Gesture Lab schemes (`draw`, `conduct`, `brush`) remain functional.
  - Mount `<WingTrails />` and `<WindCurrents />` inside `<Suspense>` so exploratory flight has continuous visual feedback and thermal currents.
- **`src/ui/Experience.tsx` (< 195 lines):**
  - Remove `BossHud` and `DialogueBox` dynamic imports, warmups, and JSX mounts.
  - Default session `shooter` to `false` via `overrideShooter(false)` unless `?shooter=1` is explicitly passed in the URL query string. This keeps `store.ts` defaults intact for unit tests (`tests/persistence.test.ts`) while ensuring normal play has zero shooter HUD/reticle clutter.
- **`src/world/Suit.tsx` (< 75 lines):**
  - Remove unused `SEMJAZA_URL` and `SPEAR_URL` exports/clears. Keep `f.on = state.shooter` so hands remain natural and open in exploratory flight (`shooter = false`).
- **`src/ui/FieldGuide.tsx` (< 55 lines):**
  - Restore the Mount Hermon dawn exploratory flight description (first light on the snow, fading stars overhead, dawn mist below, soaring from the Threshold of Hermon through the Cloven Arch to the Sanctuary of the Throne).

### 3.2 Terrain, Snow, Sky & Cedar Visual Overhaul
- **`src/world/massifGeometry.ts` (< 125 lines):**
  - **Smooth Vertex Normals:** For terrain chunks (`!isArch`), use 100% shared area-weighted vertex normals (`vNormals`) so both lighting and slope-based snow colors are $C^0$ continuous across every triangle edge. Preserve exact `faceNormals` on `cloven-arch` (`isArch`) so `tests/massif.test.ts` normal winding checks pass identically.
  - **Mount Hermon Dawn Pigments (`pigment`):**
    - Deep slate-blue shadow stone (`#2b334b`), warm Levantine limestone (`#bba38c` to `#dcc6ae`), rose-apricot dawn sunlight (`#f7c894`), and crisp alpine snow (`#f7f3eb`) on high elevations (`smooth(26, 66, y)`) and snow-holding slopes (`smooth(0.32, 0.82, normal.y)`).
- **`src/world/paintInk.ts` (< 65 lines), `src/world/atmospherePalette.ts` & `src/world/kit.ts`:**
  - **Contract Preservation:** Keep `INK`, `INK_GROUP = 6`, `INK_SKY = 0.28`, `indirectDiffuse *= ${INK_SKY}`, `inkFade`, `map: null`, `normalMap: null`, `gradientMap` (`DataTexture`), and `toneMapped: false` so `tests/paint-ink.test.ts` passes without modification.
  - **Palette Restoration:** Restore `SKYLINE.foam = '#ece7db'` and `DRIFT.color = '#f6efdd'` in `atmospherePalette.ts`, snow-alabaster `INK.cap = '#f7f3eb'` and alpine limestone/slate in `paintInk.ts`, and `snowCap * 0.85` on sanctuary pillars in `kit.ts`.
  - **Shader Overhaul (*Journey* / *Sky* Alpine Dawn Shading):**
    - Replace the harsh 4-step nearest ramp and `fwidth`/`fract` black outlines with a smooth 32-step gradient ramp and analytical multi-octave micro-detail normal perturbation (`sin`/`cos` lattice on `vInkW`, attenuated by `inkFade`).
    - Shade surfaces with soft twilight-blue sky fill in shadow, warm golden-apricot direct dawn light, high-altitude snow mantle with warm grazing alpenglow rim light, and lower-gorge mist cohesion.
- **`src/world/Skyline.tsx` (< 55 lines):**
  - Remove the `ridgeInk` black triangle-edge line (`fwidth(vSkyUv.x)`) and replace flat screen-space `cross(dFdx(vSky), dFdy(vSky))` with smooth vertex normal `vSkyN`. Enhance smooth snow-capped alpine ridges (`SNOW`), warm dawn grazing light, and seamless exponential mist blending into `FOOT_SEA` and `FOOT_HAZE` (preserving all `tests/skyline.test.ts` invariants).
- **`src/world/angelRegalia.ts` (< 65 lines) & `src/world/featherMaterial.ts` (< 40 lines):**
  - Remove the two `TorusGeometry` rings from `angelRegalia.ts` (eliminating the black wireframe circles behind the head).
  - Replace `HADES_FRAG` with `DAWN_FRAG`: soft golden dawn rim illumination (`fresnel`) and warm sunlit cloth/skin response without `fwidth(vNormal)` black edge ink or harsh posterization.
  - In `featherMaterial.ts`, remove `fwidth(vNormal)` black ink while retaining subsurface-like backlit feather translucency (`vThin * behind`) and warm dawn gold rim sheen.
- **`src/world/Cedars.tsx` (< 85 lines):**
  - Compute smooth vertex normals on the indexed `CylinderGeometry` **before** calling `toNonIndexed()`, increase radial segments to `14`, and switch material from `flatShading: true` + `fwidth` black outlines to smooth-shaded (`flatShading: false`) multi-lobed cedar tiers crowned with dawn-lit snow (`#f5efe4`) and warm rim light.

### 3.3 Exploratory Flight Feel: Wingtip Trails & Dawn Wind Currents
- **`src/world/WingTrails.tsx` (< 120 lines):**
  - Uses two preallocated `TrailBuffer` instances (`createTrail`, `pushTrail`, `writeTrail` from `HeroTrail.tsx`) for left and right wingtips—zero per-frame heap allocations, 2 draw calls total.
  - Runs at `useFrame` priority `-8` (after `Suit` at `-20` and `CameraRig` at `-10`), resetting both buffers on `pose.epoch` changes, grounded state, or first-person camera mode to prevent teleport streaks.
  - Overwrites `b.col` after `writeTrail` with warm pearlescent dawn gold (`[1.0, 0.906, 0.71]`) and speed/bank-scaled alpha.
- **`src/world/windData.ts` (< 95 lines) & `src/world/WindCurrents.tsx` (< 130 lines):**
  - **Pure Data (`windData.ts`):**
    - Defines 7 verified open-air **Dawn Thermal Rings** along a scenic route from the arrival canyon through the Cloven Arch and up to the High Sanctuary of the Throne:
      1. `[-10, 14, 38]` (South Tarn Approach)
      2. `[-6, 9, 16]` (Tarn Surface Skim)
      3. `[-3, 4.5, -1]` (Under the Cloven Arch — `4.15m` below arch soffit `8.65m`)
      4. `[6, 14, -24]` (North Basin Exit)
      5. `[6, 36, -32]` (Sanctuary Ascent Lower)
      6. `[12, 58, -36]` (Sanctuary Ascent Upper)
      7. `[20, 72, -38]` (Crown of the High Sanctuary — `13.9m` clear of the `[30, 62.4, -38]` landing target)
    - Every ring is off the straight `x = 0, y = 20..25` test line used by `tests/flight.spec.ts` and `tests/safety.spec.ts`, and includes per-ring cooldown (`1.8s`) and landing-state skip.
  - **Visual & Interactive Component (`WindCurrents.tsx`):**
    - Renders flowing, translucent golden-white wind-stream ribbons and luminous double-ring thermal beacons that slowly rotate and pulse in the dawn air (halting when `paused || reduced`).
    - Calls `advanceCamFx(runtime.shooter.camFx, dt, state.reduced, three.clock.elapsedTime)` when `!state.paused` so `punchFov` spring breaths integrate smoothly while `Shooter` is unmounted.

---

## 4. Failure Modes, Performance & Budgets

- **WebGL Context Loss & Disposal:** Every new geometry and material in `WingTrails.tsx` and `WindCurrents.tsx` is disposed in `useEffect` cleanup; `Scene.tsx` `GraphicsRecovery` handles `webglcontextlost`.
- **Reduced Motion & Pause:** When `paused` or `reduced` is true, `WingTrails` clears/hides its ribbons and `WindCurrents` freezes ring rotation, stream drift, and FOV pulses.
- **First-Load JS Budget ($\le 629.0\text{ KB}$):** Removing `BossHud` and `DialogueBox` from `Experience.tsx` reduces landing/UI chunk overhead; `WingTrails` and `WindCurrents` live strictly inside lazy `src/world/` modules loaded by `Scene.tsx`.
- **Module Size Limit:** Every modified or created file in `src/` will remain strictly $< 200$ lines.

---

## 5. Verification & Acceptance Plan

1. **Static & Unit Verification:**
   - `pnpm typecheck` passes with zero errors.
   - `pnpm test` passes all unit suites (`massif.test.ts`, `paint-ink.test.ts`, `skyline.test.ts`, `atmosphere.test.ts`, `cedars.test.ts`, `suit.test.ts`, `motion.test.ts`, `persistence.test.ts`, plus new `wind-currents.test.ts`).
2. **Production Build & Bundle Budgets:**
   - `pnpm build` succeeds.
   - `node scripts/check-first-load.mjs` passes ($\le 629.0\text{ KB}$).
   - `node scripts/check-vote-build.mjs` passes.
3. **Visual & Browser Verification (`http://localhost:3000`):**
   - Start production server on port 3000.
   - Capture and inspect screenshots across desktop (`1440x900`), iPhone portrait (`390x844`), and iPhone landscape (`844x390`) in:
     1. Landing / Title view
     2. Arrival Promontory (standing on the oath court overlooking the snow-capped massif and dawn gorge)
     3. Soaring & banking through the Cloven Gorge with dual wingtip ribbons and golden wind currents
     4. High Sanctuary of the Throne vista at the summit
   - Verify zero console/page errors, zero black wireframe triangle artifacts, zero detached weapons or boss health bars, and accessible controls.
