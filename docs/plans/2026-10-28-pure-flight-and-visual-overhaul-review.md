# Independent EGM Design Review: Pure Flight & Visual Overhaul Plan

**Reviewed Plan:** `docs/plans/2026-10-28-pure-flight-and-visual-overhaul.md`  
**Reviewer:** Independent EGM Design Reviewer (`461a3642-2f38-44bf-96d4-72b45890cd04`)  
**Status:** All 5 Material Blockers + 3 Optional Improvements Resolved in Plan & Implementation

---

## Summary of Findings & Resolutions

1. **Blocker 1 (Thermal Ring Coordinates vs. `heightAt` / `makeHermonArch` / Landing Pad):**
   - *Finding:* Rings 3, 5, 6, and 7 in the initial draft intersected the arch trimesh, underground terrain, or the High Sanctuary landing pad `[30, 61.415, -38]`.
   - *Resolution:* Updated `src/world/windData.ts` to the verified open-air coordinates (`[-10, 14, 38]`, `[-6, 9, 16]`, `[-3, 4.5, -1]`, `[6, 14, -24]`, `[6, 36, -32]`, `[12, 58, -36]`, `[20, 72, -38]`), added per-ring cooldown (`1.8s`) and `landing` skip, and added unit tests in `tests/wind-currents.test.ts` verifying clearance against `heightAt(x, z)`, the Cloven Arch soffit, and landing targets.
2. **Blocker 2 (`punchFov` Spring Integration When `Shooter` Is Unmounted):**
   - *Finding:* `punchFov` increments `fx.fovShotV`, which requires `advanceCamFx` to run each frame.
   - *Resolution:* `WindCurrents.tsx` calls `advanceCamFx(runtime.shooter.camFx, dt, state.reduced, three.clock.elapsedTime)` each frame when `!state.paused`, so `CameraRig.tsx` smoothly applies and decays the FOV breath.
3. **Blocker 3 (`HeroTrail` Hardcoded Cyan RGB & Epoch/Grounded Reset):**
   - *Finding:* `writeTrail` writes cyan `[0.098, 0.75, 1]` into `b.col` and only resets on negative clock deltas.
   - *Resolution:* `WingTrails.tsx` runs at priority `-8`, resets both wingtip buffers on `pose.epoch` changes, grounded state, or first-person camera switch, and overwrites `b.col` with warm dawn-gold RGB `[1.0, 0.906, 0.71]` and speed/bank-scaled alpha.
4. **Blocker 4 (`Cedars.tsx` `computeVertexNormals()` Order):**
   - *Finding:* Calling `computeVertexNormals()` after `toNonIndexed()` produced flat per-triangle normals even with `flatShading: false`.
   - *Resolution:* `Cedars.tsx` computes vertex normals on the indexed geometry before `toNonIndexed()`, increases radial segments to `14`, and restores snow-dusted upper boughs (`#f5efe4`).
5. **Blocker 5 (`Skyline.tsx` Screen-Space `dFdx`/`dFdy` Faceting & `atmospherePalette.ts` / `paintInk.ts` / `kit.ts` Snow Restoration):**
   - *Finding:* `cross(dFdx(vSky), dFdy(vSky))` faceted distant snow ranges; `07c43f9` left muddy tan/purple values in `atmospherePalette.ts`, `paintInk.ts`, and `kit.ts`.
   - *Resolution:* `Skyline.tsx` uses smooth vertex normal `vSkyN`; `massifGeometry.ts` uses 100% shared `vNormals` for `!isArch`; `atmospherePalette.ts` restores `foam: '#ece7db'` and `DRIFT.color: '#f6efdd'`; `paintInk.ts` and `kit.ts` restore snow-alabaster caps (`#f7f3eb`) and alpine limestone shading.
6. **Optional Improvements Applied:**
   - Used 100% shared `vNormals` on `!isArch` terrain in `massifGeometry.ts`.
   - Kept `f.on = false` in `Suit.tsx`.
   - Removed dead boss/spear modules, GLB assets, and boss-specific tests.
