# Plan: God of War (2018 / Ragnarök) + Winged Rage Combat Overhaul (`2026-10-28`, `rev-2`)

- **Plan Revision:** `rev-2` (Updated after independent EGM review `2995adf1-e192-4041-96e2-c5d279f1b34f`)
- **Source Baseline:** `e8999ca` (`codex/hades-boss-showdown`)
- **Minimum Reading List:**
  - `AGENTS.md`
  - `docs/DECISIONS.md`
  - `src/world/Scene.tsx`
  - `src/world/Suit.tsx`
  - `src/game/CameraRig.tsx`
  - `src/game/cameraFx.ts`
  - `src/game/motion.ts`
  - `src/game/Player.tsx`
  - `src/game/store.ts`
  - `src/ui/Experience.tsx`
  - `tests/flight.spec.ts`
  - `tests/accessibility.spec.ts`
  - `tests/layout-tokens.test.ts`

---

## 1. Goal & Concept Brief

### 1.1 Who It Is For & Core Fantasy
Transform *Halaverga* into a **Hybrid Norse *God of War (2018 / Ragnarök)* + Winged Rage** third-person mythic brawler set on **Mount Hermon at dawn in the days of Jared (*1 Enoch 6*)**, powered by the studio-grade **Quaternius Universal Base Characters (`Superhero_Male_FullBody` + `Hair_Beard` + `Hair_Long`)** and **Universal Animation Library (`UAL1_Standard.glb`, 65-bone skeleton)** from `/Users/vartny/Downloads/`.

### 1.2 Concrete Action-to-Result Dopamine Loop & World Coordinates
1. **Protagonist — Bearded Archangel Warrior in Physical Form (`/models/archangel-gow.glb`):**
   - Built from the user's downloaded 65-bone `Superhero_Male_FullBody.gltf` + `Hair_Beard.gltf` + `Hair_Long.gltf` + PBR normal/roughness/albedo maps + Archangel golden pauldrons, cuirass, waist tassets, and Aegis bracers, wielding a forged **Celestial Greatblade** in `hand_r`, with articulated **Archangel Wings** (`archangelWings.ts`) attached to `spine_03` that stay sleekly folded during grounded brawling and burst open during **Winged Rage**, **Aerial Leap-Slams**, and **Flight**.
2. **Over-the-Shoulder Combat Camera (`CameraRig.tsx`, `cameraFx.ts`):**
   - `CameraRig.tsx` remains the **single authoritative camera writer**.
   - When `state.shooter && state.camera === 'third'`, the grounded camera (`pose.flight === 0`) uses a tight Norse *God of War* over-the-shoulder boom (`right = +0.58 m`, `up = -0.14 m` from `CHASE_HEAD`, `back = 2.75 m`) and a `-9°` combat FOV tightening weighted smoothly by `(1 - pose.flight)` so takeoff/landing (`pose.flight: 0 <-> 1`) glides smoothly without snapping `baseFovStep`.
   - When `?shooter=0` (`!state.shooter`), `CameraRig.tsx` and `cameraFx.ts` remain 100% bit-identical to baseline so `tests/camera-boom.test.ts` and `tests/flight.spec.ts` pass without change.
   - Target soft-lock orientation assist nudges `runtime.yaw` during active grounded melee swings (`!state.flying && !state.reduced`) toward the nearest live enemy within the melee cone so `Player.tsx`, `FlightPresentation.tsx`, and `CameraRig.tsx` stay synchronized.
3. **Visceral *God of War* Combat Moveset & Input Coexistence (`src/game/gowCombat.ts`, `src/game/gowInput.ts`, `src/game/motion.ts`):**
   - **Root Motion Integration (`src/game/motion.ts`):** `runtime.combatMotion = { vx: 0, vz: 0, timer: 0 }` is applied inside `advanceVelocity` in `src/game/motion.ts` when `!flying && runtime.combatMotion.timer > 0`, driving Dodge Roll (`9.5 m/s` burst) and attack lunges through Rapier's `CharacterController` (`c.computeColliderMovement`) in `Player.tsx` with full terrain/wall collision and zero lines added to `Player.tsx`.
   - **Light Weapon Combo (`KeyJ` / `Click` on scene / Touch `Light`):** 3-hit chaining combo using `Sword_Attack` (`Cleave` $\to$ `Cross Slash` $\to$ `Judgment Finisher`) with forward root lunge, golden weapon-arc ribbon, directional hit sparks, `55 ms` hitstop, and camera punch.
   - **Heavy Aegis Bash (`KeyK` / Touch `Heavy`):** Plays `Punch_Jab` & `Punch_Cross` with high **Stun Bar** buildup and knockback.
   - **Aegis Shield/Bracer Parry (`KeyQ` / `Right-Click` when grounded / Touch `Parry`):** Timed `0.28 s` parry window against enemy **Yellow-Ring** strikes triggers a **Golden Parry Shockwave**, brief slow-motion (`0.35x` for `0.35 s`), and forces the attacker into `Hit_Head` stagger with `+45` Stun.
   - **Evade Step & Dodge Roll (`KeyC` / `ShiftLeft` when grounded / Touch `Dodge`):** Plays the 65-bone `Roll` animation (`0.52 s` duration, `0.38 s` i-frames, `9.5 m/s` directional burst). Dodging an enemy **Red-Ring** unblockable attack within `0.24 s` triggers **Celestial Realm Shift** (`1.4 s` of `0.4x` enemy time-dilation). When `state.flying` is true, `ShiftLeft` retains its flight surge behavior.
   - **Runic / Enochian Spell — Uriel's Flame (`KeyG` / Touch `Runic`):** Plays `Spell_Simple_Shoot` (`5 s` cooldown), launching a blazing celestial projectile that explodes for heavy damage + AoE stagger.
   - **Winged Rage & Aerial Slam (`KeyV` / Touch `Rage`):** Unfurls the Archangel wings to full span, ignites golden aura embers, heals `+35 HP`, and slams down with a golden shockwave crater (`Jump_Start` $\to$ `Jump_Land`). `Space` remains the dedicated Lift/Land flight toggle.
   - **Brutal Stun Execution (`KeyE` when an enemy is in Stun-Full state and `!state.nearTerminal` / Touch `Execute`):** Executes a high-impact close-up finisher (`Sword_Attack` + shockwave) that shatters the Watcher's armor and restores `+25 HP` & `+30 Rage`.
4. **Sanctuary Court Arena Coordinates & Enemy Ecology (`src/game/gowEnemies.ts`, `src/world/GowArena.tsx`):**
   - Relative to player spawn `START = { x: 0, y: 21.06, z: 65 }` (looking toward `-Z` across the flat Sanctuary Promontory court at `y ≈ 20.0 m`):
     - **Nephilim Vanguard I (`nephilim-west`):** Spawns at `(-4.2, 20.0, 56.5)`, scale `1.22`, facing `+Z`.
     - **Nephilim Vanguard II (`nephilim-east`):** Spawns at `(4.2, 20.0, 56.5)`, scale `1.22`, facing `+Z`.
     - **Semjaza, Chief of the Two Hundred (`semjaza-boss`):** Spawns at `(0.0, 20.0, 49.0)`, Titan scale `2.15`, facing `+Z` with horned obsidian-bronze crown, dark crimson/gold wings, and a colossal Nephilim Greatsword.

---

## 2. Module Architecture & `< 200` Line Budget

Every file in `src/` stays strictly under `200` lines:

| File | Responsibility | Max Lines |
| :--- | :--- | :---: |
| `scripts/build_gow_assets.py` | Packs `Superhero_Male_FullBody` + `Hair_Beard` + `Hair_Long` + resized PBR textures + 17 `UAL1_Standard` clips into `public/models/archangel-gow.glb`. | $< 200$ |
| `src/game/gowTypes.ts` | Pure state types, attack frame tables, arena spawn coordinates, and `gowRuntime` singleton outside React state. | $< 130$ |
| `src/game/gowCombat.ts` | Pure player combat state machine (3-hit Light combo, Heavy bash, Parry window, Dodge Roll i-frames & Realm Shift, Runic spell, Winged Rage slam, Stun Execution, hitstop, soft-lock yaw). | $< 190$ |
| `src/game/gowEnemies.ts` | Pure enemy & Semjaza boss AI state machine (aggro, Yellow-Ring parryable cleaves, Red-Ring unblockable slams, Stun bar, stagger/death/respawn states, terrain height clamping). | $< 190$ |
| `src/game/gowInput.ts` | Grounded keyboard/mouse combat bindings (`KeyJ`/`Click` Light, `KeyK` Heavy, `KeyQ`/`Right-Click` Parry, `KeyC`/`ShiftLeft` Dodge, `KeyG` Runic, `KeyV` Rage, `KeyE` Execute) mounted inside `GowArena.tsx`. | $< 130$ |
| `src/world/gowMaterials.ts` | Builds Archangel & Watcher armor attachments (pauldrons, Aegis bracers, Celestial Greatblade, Nephilim Greatsword, horned crown) and shared materials. | $< 180$ |
| `src/world/GowWarrior.tsx` | Clones `archangel-gow.glb` via `SkeletonUtils.clone`, binds `AnimationMixer`, attaches wings (`archangelWings.ts`) & Greatblade, and blends locomotion + combat clips. | $< 180$ |
| `src/world/GowArena.tsx` | Clones 65-bone meshes for the 2 Nephilim Vanguards and Semjaza Titan, mounts `useGowInput()`, steps `gowCombat` & `gowEnemies` in `useFrame`, and renders telegraph rings, weapon arcs, and shockwaves. | $< 195$ |
| `src/ui/GowHud.tsx` | Dynamically imported *God of War* HUD (`ssr: false` inside `<Optional>` in `Experience.tsx`): Top Semjaza Health + Stun bar, bottom-left player Health/Rage/Runic bar, combat key legend, and accessible touch combat cluster. | $< 185$ |
| `src/ui/GowHud.module.css` | Styles using ONLY `var(--z-hud)` and `var(--z-play)` (`tests/layout-tokens.test.ts` compliant), `>= 4.5:1` opaque dark slate plates (`#0d131ae6`), and `>= 44×44 px` touch buttons positioned clear of `Lift` / `TouchCluster`. | $< 160$ |
| `src/world/Scene.tsx` | Mounts `<GowArena />` inside its own `<Boundary fallback={null}><Suspense fallback={null}>` inside `<Physics>`. | $< 85$ |
| `src/world/Suit.tsx` | Mounts `<GowWarrior />` inside `<Boundary fallback={null}><Suspense fallback={null}>` when `state.shooter` is true; hides fallback `rig.root` once `gowRuntime.heroReady` is true; clears `/models/archangel-gow.glb` in `clearWorldCache()`. | $< 85$ |
| `src/game/CameraRig.tsx` & `src/game/cameraFx.ts` | Smoothly blends the over-the-shoulder *God of War* grounded boom (`[0.58, -0.14, 2.75]`) and `-9°` combat FOV tightening using `(1 - pose.flight)` when `state.shooter` is active. | $< 125$ |
| `src/game/motion.ts` & `src/game/runtime.ts` | Adds `combatMotion: { vx: 0, vz: 0, timer: 0 }` on `runtime` and applies it in `advanceVelocity` when `!flying`. | $< 90$ |

---

## 3. Resolution of All 7 EGM Review Blockers

1. **B1 (`tests/layout-tokens.test.ts`):** `GowHud.module.css` uses strictly `z-index: var(--z-hud)` for HUD readouts and `z-index: var(--z-play)` for touch action buttons, with zero inline `zIndex` in `.tsx`.
2. **B2 (Keybinding & Click Coexistence):** `useGowInput()` only intercepts combat keys when grounded (`!state.flying`) and `state.shooter` is active; `Space` stays dedicated to Lift/Land, `KeyG` triggers Runic Spell, `KeyV` triggers Winged Rage/Slam, and `KeyE` yields to `state.nearTerminal` when near a lore stele.
3. **B3 (Physics Root Motion via `motion.ts`):** `runtime.combatMotion` is consumed in `motion.ts` (`advanceVelocity`) so Dodge Roll (`9.5 m/s`) and attack lunges move through Rapier's `CharacterController` in `Player.tsx` without adding a single line to `Player.tsx`.
4. **B4 (`CameraRig.tsx` Smooth Transition & Soft-Lock):** Grounded over-the-shoulder boom and `-9°` FOV offset are weighted by `(1 - pose.flight)` inside `boomFor` and `fovFor` when `state.shooter` is true, avoiding any `baseFovStep` snap on takeoff/landing and keeping `?shooter=0` bit-identical.
5. **B5 (First-Load JS Budget $\le 629.0\text{ KB}$):** `useGowInput()` lives inside `GowArena.tsx` (inside lazy `Scene.tsx`) and `GowHud.tsx` is loaded via `dynamic(..., { ssr: false })` inside `<Optional>` in `Experience.tsx`, adding `< 100 bytes` to the landing first-load bundle.
6. **B6 (Touch Controls & WCAG AA):** Touch combat buttons in `GowHud.tsx` render only when `!state.flying && !state.tapControls`, sit in a bottom-left/center-left arc clear of bottom-right `Lift` / `TouchCluster`, and use opaque `#0d131ae6` plates with `#f7f2e8` text (`> 12:1` contrast) and explicit `aria-label`s.
7. **B7 (`<Boundary><Suspense>` Isolation):** Both `<GowWarrior />` and `<GowArena />` are wrapped in their own `<Boundary fallback={null}><Suspense fallback={null}>` so `Player.tsx` initializes `ready: true` on frame 1 without waiting for `archangel-gow.glb`.
