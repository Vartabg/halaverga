# Consolidated EGM Review Report: `2026-11-01-google-3d-tiles-and-pure-flight.md`

- **Reviewer:** Fresh-context `research` subagent (`conversationId: 0240be63-7d60-46a2-b6da-ca35d969c832`)
- **Reviewed Revision:** `rev-1` -> Updated to `rev-2`
- **Source Baseline:** `93a5b75` on `codex/hades-boss-showdown`
- **Reading List:** `AGENTS.md`, `docs/DECISIONS.md`, `docs/plans/2026-11-01-concept-reset-and-recommendation.md`, `src/world/Scene.tsx`, `src/world/Suit.tsx`, `src/world/HermonCity.tsx`, `src/world/LegacySanctuaryFlora.tsx`, `src/game/CameraRig.tsx`, `src/game/Player.tsx`, `src/ui/Experience.tsx`, `src/ui/LegacyFlightOverlay.tsx`, `tests/flight.spec.ts`, `tests/accessibility.spec.ts`, `tests/layout-tokens.test.ts`

## Findings & Dispositions

1. **Material Blocker 1 — Incomplete `state.shooter` Decoupling in `Player.tsx` & `Experience.tsx` (`Accepted & Fixed in rev-2`):**
   - Replaced all Sanctuary Duel `state.shooter` gates in `Player.tsx` (lines 59, 83, 92, 94, 95, 103, 106, 111, 118, 129, 181) with `const duel = gowRuntime.duelEngaged;` and initialized `gowRuntime.duelEngaged = query.get('duel') === '1'` synchronously in `Experience.tsx` before `setHydrated(true)`.
2. **Material Blocker 2 — Missing Call Site for `stepGeoWorld` & Spawn Corridor Colliders (`Accepted & Fixed in rev-2`):**
   - Assigned `GeoWorldLayer.tsx` (`useFrame`) to call `stepGeoWorld`, rendered region landmarks as visual-only `InstancedMesh`es, and kept all 6 Sky-Gates outside the `x ∈ [-8, 8], z ∈ [40, 72]` spawn/brake corridor tested by `tests/flight.spec.ts` and `tests/accessibility.spec.ts`.
3. **Material Blocker 3 — `GeoFlightHud.module.css` Layer Token & Pointer Stacking (`Accepted & Fixed in rev-2`):**
   - Specified `z-index: var(--z-play); pointer-events: none;` on `.hud` with `pointer-events: auto;` on child buttons, and zero inline `zIndex` in `.tsx`.
4. **Material Blocker 4 — HUD Visibility During Sheet/Vote/Twin/Tap & Positioning Above `.legend` (`Accepted & Fixed in rev-2`):**
   - Hid `GeoFlightHud` when `state.tapControls || state.touchScheme === 'twin' || state.controlsOpen || state.voteOpen` and positioned it at `bottom: max(54px, calc(env(safe-area-inset-bottom) + 46px)); left: var(--gx);` with `<span aria-hidden="true">` on decorative icons.
5. **Material Blocker 5 — `Player.tsx` Line Budget (`193 / 200` lines) (`Accepted & Fixed in rev-2`):**
   - Kept `stepGeoWorld` inside `GeoWorldLayer.tsx` and replaced the 3-line `window.__gowDuelEngaged` check in `Player.tsx` with `duel`, keeping `Player.tsx` under 193 lines.
