# Stage 1 Technical Plan: Isometric 2.5D Illustrated Action Brawler on Mount Hermon

## 1. Purpose & Approved Direction
Per the user-approved 3-stage plan (`isometric-enoch-game-plan.md`), Stage 1 transforms the default game (`state.shooter === true`) into a responsive **Isometric 2.5D Illustrated Action Brawler** (*Hades* + *Darksiders Genesis* + *Batman: Arkham Freeflow*) matching the visual target mockup (`isometric_visual_target_png_1793297179571.jpg`) and painted sanctuary floor texture (`sanctuary_floor_texture_png_1793297196178.jpg`).

## 2. Supplied Reading List for Review
- `AGENTS.md`
- `src/game/CameraRig.tsx`
- `src/game/Player.tsx`
- `src/game/motion.ts`
- `src/game/gowTypes.ts`
- `src/game/gowCombat.ts`
- `src/game/gowEnemies.ts`
- `src/game/gowInput.ts`
- `src/world/GowWarrior.tsx`
- `src/world/GowArena.tsx`
- `src/world/gowArenaBuilder.ts`
- `src/ui/GowHud.tsx`
- `tests/flight.spec.ts`
- `tests/accessibility.spec.ts`

## 3. Stage 1 Architecture & Module Changes

### 3.1 Asset Processing Pipeline (`public/sprites/`)
A Python script (`scripts/build-25d-sprites.py`) processes the generated art sheets into optimized, transparent PNGs and floor textures under `public/sprites/`:
- `public/sprites/sanctuary-floor.jpg`: High-contrast painted circular Enochian stone altar texture mapped onto the `20 m` sanctuary floor disc.
- `public/sprites/uriel-ground.png`: 2-frame horizontal atlas (`[0]` combat stance, `[1]` greatsword slash lunge) with pure alpha background removal.
- `public/sprites/uriel-aerial.png`: 2-frame horizontal atlas (`[0]` elevated winged hover with raised solar greatsword, `[1]` diagonal aerial swoop-strike dive).
- `public/sprites/semjaza.png`: 2-frame horizontal atlas (`[0]` towering horned Watcher stance, `[1]` magma greatsword cleave).
- `public/sprites/vanguard.png`: 2-frame horizontal atlas (`[0]` dark bronze vanguard stance, `[1]` halberd/axe lunge strike).
- `public/sprites/uriel-portrait.jpg`: Cropped diamond HUD portrait of Uriel for the top-left mythic status bar.

### 3.2 Isometric 42° Action Camera (`src/game/CameraRig.tsx`)
- When `state.shooter && state.camera === 'third'`, `CameraRig.tsx` (the single authoritative camera writer) locks into an **Isometric Action Framing**:
  - Fixed camera pitch `-0.72 rad` (`~41.3°` downward look) and fixed yaw `0 rad` (looking North `-Z` across the Summit Sanctuary), plus any active `fx.kickP` / `fx.kickY` / `fx.shakeP` / `fx.shakeY` combat trauma.
  - Isometric boom offset from Uriel's anchor: `(0, 10.5, 13.5)` on the ground, smoothly pulling out to `(0, 12.8, 16.5)` when `state.flying === true` (Elevated Wing Hover) so both hovering Uriel and all ground enemies remain clearly framed inside the viewport.
  - Preserves all legacy `/?shooter=0` boom and first-person behavior untouched so `tests/flight.spec.ts` and `tests/camera-boom.test.ts` pass 100%.

### 3.3 Direct Screen-Space Movement & Controlled Wing Hover (`src/game/Player.tsx`, `src/game/motion.ts`, `src/game/gowInput.ts`)
- **Zero Camera Dragging:** When `state.shooter` is active, pointer movement updates the 2D normalized screen cursor (`gowRuntime.cursorX`, `gowRuntime.cursorY`) instead of rotating camera yaw/pitch.
- **Screen-Space `WASD` Movement:** Because the isometric camera faces North (`yaw = 0`), pressing `W` (`intent.forward > 0`) moves North (`-Z`), `S` moves South (`+Z`), `A` moves West (`-X`), and `D` moves East (`+X`) at a responsive `9.5 m/s` ground speed (or `11.5 m/s` in Elevated Wing Hover).
- **Instant Toggle for Elevated Wing Hover (`Space`):**
  - Pressing `Space` on the ground launches Uriel into **Elevated Wing Hover** (`state.flying = true`), smoothly holding combat hover altitude at `y = 25.0 m` (`4.1 m` above the `20.0 m` altar floor) instead of flying off into the stratosphere.
  - Pressing `Space` again (or `C` / **Land** button) while elevated immediately descends back to grounded stance (`state.flying = false`), or **Left-Clicking (`triggerAerialSwoop`)** dives straight onto the locked Watcher and lands with a golden shockwave cleave.
  - Arena boundary clamp in `state.shooter` mode keeps Uriel within `18.8 m` of the altar center `(0, 55)` so the player never accidentally falls off the mountain during fast isometric dashes.

### 3.4 Cursor + Auto Lock-On (`src/game/gowCombat.ts`, `src/game/gowEnemies.ts`)
- `findFreeflowTarget` evaluates enemy screen-space/world projection against `gowRuntime.cursorX, gowRuntime.cursorY` (when the mouse cursor has moved recently) combined with movement direction and proximity (`14.5 m` grounded, `28.0 m` elevated), locking onto the Watcher under/nearest the cursor.

### 3.5 2.5D Illustrated HD Fighter Billboards & Painted Sanctuary (`src/world/GowWarrior.tsx`, `src/world/GowArena.tsx`, `src/world/gowArenaBuilder.ts`)
- **Painted Sanctuary Altar (`gowArenaBuilder.ts`):** Maps `public/sprites/sanctuary-floor.jpg` onto the `20 m` circular altar platform with warm golden emissive rune accents and ruined stone perimeter pillars matching Slide 1.
- **Uriel 2.5D Illustrated Fighter (`GowWarrior.tsx`):**
  - Renders Uriel as a crisp camera-facing 2.5D illustrated sprite quad (`uriel-ground.png` when grounded, `uriel-aerial.png` when elevated/swooping) with horizontal flip (`repeat.x = ±0.5`) based on facing left/right, dynamic attack frame switching (`frame 0` idle/run bob, `frame 1` slash/swoop), golden ground shadow ring directly at `(x, 20.05, z)` (so you always see your exact ground spot while hovering!), and sweeping golden crescent slash arcs.
- **Semjaza & Watcher Vanguards 2.5D Illustrated Fighters (`GowArena.tsx`, `gowArenaBuilder.ts`):**
  - Renders Semjaza (`semjaza.png`, `4.4 m` tall) and the two Watcher Vanguards (`vanguard.png`, `3.1 m` tall) as 2.5D illustrated billboards with dark ground shadows, golden floor target-lock ring (`isometric_visual_target` style), yellow/red attack telegraph rings, hit-flash, and knockback tilt.

### 3.6 Mythic Isometric HUD (`src/ui/GowHud.tsx`, `src/ui/GowHud.module.css`)
- Updates the HUD to match Slide 1:
  - Top-left diamond portrait (`uriel-portrait.jpg`) + golden **URIEL** Vitality & Winged Rage bars + 3 visual ability badges (`[Click] Swoop/Strike`, `[R-Click] Beam/Parry`, `[Space] Wing Hover`).
  - Bottom-center **SEMJAZA, WATCHER LEADER** boss bar + Stun meter + active Aerial Lock / Counter prompt.

## 4. Constraints & Acceptance Criteria
- Every file under `src/` remains strictly `< 200` lines.
- `CameraRig.tsx` remains the single authoritative camera writer.
- Landing first-load JS remains `<= 629.0 KB`.
- All existing Vitest (`199/199`) and Playwright (`tests/flight.spec.ts` with `/?shooter=0`, `tests/accessibility.spec.ts`) suites pass.
