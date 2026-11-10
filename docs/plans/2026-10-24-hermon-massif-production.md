# Connected Hermon Massif — Implementation Plan

**Goal:** Replace the active city-grid, rectangular-deck, stacked-box, and capped-cylinder terrain grammar with one continuous Mount Hermon massif whose rendered triangles and collision triangles come from the same deterministic source.

**Approved design:** Garo selected **Continuous shared terrain** in the active production-directive thread on 2026-10-24. Use a pure world-space sampler, indexed source meshes, Rapier trimeshes, authored landing plateaus, and a faceted dawn/cel-and-ink treatment. Do not preserve invisible city colliders merely to satisfy old snapshots.

**Done means:** the arrival and High Sanctuary landings work; every `BUILDING_ROUTE` segment passes a real swept-body test; near and outer terrain join without holes; no active generator uses the old street grid or box tower stacks; terrain draw calls stay bounded; required checks pass; and desktop/portrait/landscape screenshots are inspected. Emulation is not physical iPhone Safari validation.

## Contracts

- `massifData.ts`: pure deterministic `heightAt(x, z, seed)`, named plateau heights, gorge/ridge shaping, and world/chunk bounds. The central gorge remains below the dawn meltwater plane; arrival support is y=20 and summit support is y=61.415.
- `massifGeometry.ts`: generate grid vertices and triangle indices once. Expand those exact triangles into a flat-faceted Three `BufferGeometry`; retain the source `Float32Array` vertices and `Uint32Array` indices for Rapier. No separately tuned collision approximation.
- `TerrainChunk`: `{ geometry, vertices, indices, triangles }`. Every render position must equal the source vertex referenced by the source triangle index.
- `MassifTerrain.tsx`: fixed trimesh colliders plus static meshes; owns and disposes only its material. Parent components own chunk geometries.
- Shared `paintInkMaterial`: flat-facet vertex pigments from `massifGeometry`, chromatic indigo shadows, altitude-and-slope snow, dawn-gold crest light, distance-faded crease ink. No horizontal contour/brick stripes and no photo-concrete dependency. Reuse the existing material rather than adding a duplicate wrapper.
- Near terrain: one chunk covering x=-225..225, z=-205..130 at 5 m source resolution. Outer terrain: four abutting chunks covering the rest of `WORLD` at the same resolution. All chunk boundaries lie on the same global grid.
- Skyline: three continuous rectangular ridge rings beyond `WORLD`, sampled from the same height function at lower resolution and merged into one static mesh. No tower records, box specs, windows, or colliders.
- Authored monuments remain separate kit geometry/cuboids only where intentional. The Cloven Arch uses custom faceted rock geometry and its own matching trimesh, not a highway deck or tilted invisible cuboid.

## Tasks

- [ ] **1. Write failing terrain contracts.** Create `tests/massif.test.ts` for determinism, finite geometry, connected chunk edges, render/collision identity, landing plateau heights, gorge continuity, triangle budgets, and absence of grid/tower generator imports. Run the focused test and confirm it fails because the new modules do not exist.
- [ ] **2. Implement the shared sampler and geometry.** Create `src/world/massifData.ts`, `src/world/massifGeometry.ts`, `src/world/MassifTerrain.tsx`, and `src/world/hermonArch.ts`. Keep every module below 200 lines.
- [ ] **3. Replace the three active terrain grammars.** Rewrite the terrain paths in `src/world/cityData.ts`, `src/world/fieldData.ts`, and `src/world/skylineData.ts`; mount matching collision in `src/world/City.tsx` and `src/world/RuinField.tsx`; render continuous ranges in `src/world/Skyline.tsx`. Retain only intentional megalithic sanctuary/stele geometry. Remove active imports of `ruinBuilding`, `dudaelFieldShapes`, `dudaelFieldData`, `summitStone`, and box-based skyline baking from these paths.
- [ ] **4. Unify paint and lore framing.** Remove repetitive strata from `src/world/paintInk.ts`; update active legacy route labels/comments in `src/game/navigation.ts`, `src/game/motion.ts`, and `src/world/Atmosphere.tsx`. Preserve quoted source text and source/fiction labels unchanged.
- [ ] **5. Update physics fixtures and behavioral tests.** Add `tests/physicsWorld.ts` to mount both cuboid props and terrain trimeshes. Use it in `tests/navigation.test.ts`, `tests/lim/harness.ts`, and `tests/shot-resolve.test.ts`. Replace old grid/count assertions in `tests/field.test.ts`, `tests/skyline.test.ts`, `tests/paint-ink.test.ts`, `tests/drone-patrol.test.ts`, and `tests/drone-brain.test.ts` with terrain, route, landing, shot-occlusion, and patrol-clearance invariants. Rebaseline only geometry-specific pins; retain boundary and escape behavior coverage.
- [ ] **6. Verify and visually direct.** Run focused tests, `pnpm typecheck`, `pnpm test`, `pnpm build`, `node scripts/check-first-load.mjs`, `node scripts/check-vote-build.mjs`, and Playwright accessibility/browser checks. Add or update a bounded capture script for landing, arrival, liftoff, gorge vista, outer horizon, pause, and Field Guide at desktop/portrait/landscape sizes. Inspect every produced image and iterate on composition/material defects.
- [ ] **7. Review and finish through lifecycle.** Run Pass 0 hard constraints plus code review, record exact verification/evidence and physical-device limitation, then `agent-task finish`. Do not report completion unless the final state is `COMPLETE`.

## Non-goals for this branch

- No character rig, wing, combat, or UI redesign unless a terrain change directly breaks it.
- No dependency upgrade, WebGPU migration, production deployment, direct merge to `main`, or claim of physical-iPhone performance/feel.
- No full-screen depth/normal outline pass in this slice; silhouette quality comes first from geometry, composition, pigments, and bounded crease ink.
