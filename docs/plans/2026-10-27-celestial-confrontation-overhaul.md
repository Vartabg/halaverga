# Mythic Aerial Confrontation Overhaul: Mount Hermon at Dawn (1 Enoch 6)

## 1. Context & Motivation

The user has decisively rejected the legacy hybrid state ("this looks nothing like it should because of the characters, environment and gameplay"). The game was previously torn between a 2033 sci-fi astronaut flight test and procedural terrain.

Following user direction on 2026-10-27:
- **Core Gameplay:** Mythic Aerial Confrontation — a focused, high-stakes battle against the descending Watchers (Semjaza/Azazel) on Mount Hermon, featuring sweeping dive strikes, divine banishment, and escalating combat phases.
- **Visual Foundation:** Complete retirement of the astronaut suit (`suit.glb`) and procedural noise heightmap in favor of authored character and environmental assets.

---

## 2. Architecture & Design Specification

### Pillar 1: The Character — Archangel Envoy
- **Asset Pipeline:** Retire `public/models/suit.glb`. Adopt `public/models/angel.glb` (CC0 Quaternius sculpted angelic warrior with ivory tunic, chestnut hair, gold pauldrons, and calibrated 21-bone skeleton).
- **Skeleton Calibration:** `angel.glb` bone heads are aligned to `suitSkeleton.ts` within the strict 10-micrometer tolerance (`0.00001m`) verified by `skinnedSuit.ts` and `tests/suit-skeleton.test.ts`.
- **Wings & Motion:** Anatomical feathered archangel wings (`src/world/archangelWings.ts`) with dynamic banking flare, clearance folding, and dive tuck.
- **Weaponry:** Wielding the flaming sword of judgment (`src/world/FlamingSword.tsx`) and radiant dawn hand-sigils.

### Pillar 2: The Environment — Mount Hermon at Dawn
- **Setting:** Mount Hermon at dawn in the days of Jared (1 Enoch 6). First light on snow, stars fading overhead, dawn mist rolling over the Hula plain below.
- **Authored Summit & Altar:**
  - The Sacred Summit (Ardis, 1 Enoch 6:6) where the Watchers descended.
  - Ancient cyclopean megalithic oath-ring: massive basalt standing stones forming the solemn ritual site.
  - Alpine cedar groves (*Cedrus libani*) clinging to the rocky ridges.
  - Layered mountain mist and volumetric-style dawn light using the reviewed atmosphere palette (`#0d081a` twilight shadow, `#ffe6ad` summit dawn gold).
  - Clean separation: Retire legacy `City.tsx` and 2033 urban concrete collision shapes in favor of Mount Hermon summit terrain and megaliths.

### Pillar 3: Gameplay — The Watcher Confrontation Loop
- **Adversary:** The descending Watcher Hierarch (Semjaza / Azazel) powered by `public/models/abyssal.glb` with membrane wings, iron crown, and corrupting shadow-fire.
- **3-Phase Encounter:**
  1. **Phase 1: Descent & Omen:** The Watcher descends over the summit. Player maneuvers through cedar crags, evading pooled star-bolts.
  2. **Phase 2: Sword Dive Strike:** Calibrated aerial dive strike (`src/game/strike.ts`, 55–85 m/s) with hitstop impact freeze and wing sweep-back, piercing the Watcher's defenses.
  3. **Phase 3: Banishment:** Sealing the defeated Watcher in the stony clefts of Mount Hermon with celestial covenant light, fulfilling 1 Enoch 10.

---

## 3. Engineering & Physics Integration Contracts

### Strike Physics & Flight Safety (`src/game/strike.ts`)
- **Dive Speed Bounds:** Calibrated to 55–85 m/s (clamped from 130 m/s to prevent collision tunneling and excessive lookahead inflation).
- **Collision Grouping:** Watcher colliders use dedicated `ADVERSARY_GROUP` (`0x00080001`). `FlightSafety.anticipate()` recognizes the adversary as an intercept target rather than an immovable terrain obstacle, preventing premature emergency deceleration at 300m.
- **Terrain Proximity Guard:** An automatic pullout envelope kicks in if the dive vector passes within 5.0m of non-target mountain terrain, easing velocity back into standard flight safety bounds.
- **Hitstop Specification:** Hitstop executes as an internal physics/animation sub-step pause (`dt = 0` for 3–5 frames, ~60–80 ms) without freezing the browser RAF render loop or writing directly to camera matrices. Camera recoil routes strictly through `src/game/cameraFx.ts` trauma channels to respect the single camera writer rule.

### Chunking & Bundle Isolation (<= 629 KB Ceiling)
- **Zero Static Root Leakage:** No confrontation, strike, sword, or adversary state/types may be statically imported into `src/game/store.ts` or `src/game/runtime.ts`.
- **Dynamic Layer Chunking:** The entire confrontation system is mounted via dynamic React `lazy()` imports under `ConfrontationLayer` inside an Error Boundary and Suspense boundary, identical to `ShooterLayer`.
- **Automated Verification:** `node scripts/check-first-load.mjs` must run on every build to guarantee first-load JS remains strictly <= 629.0 KB.

### Input Mapping Matrix
- **Mobile Safari (One-Thumb Classic):** Tap on the descending Watcher initiates lock-on and dive strike. Releasing thumb returns to neutral glide; dragging continues standard flight.
- **Mobile Safari (Two-Thumbs):** Right-hand strike button / tap target with left-stick flight.
- **Desktop (Trackpad Free-Cursor / Mouse):** Target crosshair click or Space key initiates strike; cursor steering remains active.

---

## 4. Acceptance Criteria & Verification

1. `SUIT_URL` loads `public/models/angel.glb`; zero references to `suit.glb` remain in the active scene.
2. The player model renders as a sculpted winged archangel in ivory linen and gold.
3. The summit features the ancient megalithic oath-ring and authentic alpine dawn vistas.
4. The confrontation features the Watcher adversary (`abyssal.glb`) and the playable dive-strike mechanic.
5. All 197 test suites pass, first-load bundle <= 629 KB, type checks clean, and Playwright captures visual proof.
6. All new and modified modules stay strictly <= 200 lines.
