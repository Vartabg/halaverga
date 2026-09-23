# Arm cannon

`public/models/arm-cannon.glb` replaces the right hand while the blaster is on. It is original geometry built by
`scripts/arm_cannon/` in Blender 4.0.2. The frame is set by `src/world/cannonContract.ts`: the forearm_r bind frame
(three.js axes, metres). The root is parented rigidly to forearm_r. Measured numbers are in `asset.json`.

## Size (1 head = 0.26 m)

| Part | Metres | Heads |
|---|---|---|
| Length, cuff rim (s 0.10) to muzzle (s 0.46) | 0.36 | 1.38 |
| Outer U x Z seen along the barrel (fin stack on the outer side, pod on top) | 0.169 x 0.156 | 0.65 x 0.60 |
| Largest extent perpendicular to the barrel | 0.172 | 0.66 |
| Housing, about | 0.09 x 0.115 | 0.35 x 0.44 |
| Barrel shroud, diameter | 0.085 | 0.33 |
| Muzzle ring / bore, diameter | 0.094 / 0.042 | 0.36 / 0.16 |

Length / side-on depth (top to underside, the flight and vent read) is 2.30. The cuff is about 1.3 times the forearm's width.

## Viewing condition

While aiming or carrying, the camera sees the cannon from behind: the views are 12-17 deg off the barrel, tilted
toward the top face (bind -Z) and the outer face (bind +X). The upper arm hides the underside and the inner half.
So every feature meant to read at chase is on the top/outer rear:
- the core pod, with a raked rear face (35 deg) and the recessed core lens;
- the two heat strips on the pod's top flanks;
- a heat-sink stack on the outer flank: two copper fins framed by two graphite vanes and a spine, standing 52-56 mm
  proud, so the rear outline is a stepped block beside the raised pod, not a round cuff (visual review r3 measured the
  old rear view at about 11 x 11 CSS px, mostly round).

At chase in portrait the cannon covers about 17 x 14 CSS px aiming (about 9 x 7.5 in landscape; measured on the
`cannon-fix-r3` scratch captures) and about 21 x 26 px in the carry (upper arm abducted
0.4 rad, so the cannon sits beside the torso: 82% of its surface unoccluded). The muzzle, bore, slide and hatch only read
in ADS and in side-on views.

## Parts and nodes

| Node | What it is |
|---|---|
| `arm_cannon` | Root, identity transform. |
| `cannon_shell` | Cuff (7 mm clear of the rigid forearm hull, 8 mm wall), steel rim trim, dark rim seal, two seams, green band, housing, pod, fins, barrel core, rails, muzzle ring, bore. |
| `cannon_slide` | Barrel shroud, s 0.34-0.42. Origin at its rest centre. Travels along -BARREL_AXIS, up to 25 mm. |
| `cannon_vent` | Hatch, 0.07 x 0.045 x 0.006 m, flush in the pod top. Origin on the muzzle-side hinge edge, so the lid swings away from the chase camera (which looks up the barrel from the elbow side in the vent pose). A positive rotation about local +X opens it (up to 105 deg) over a cavity with a glowing floor and five fins. |
| `cannon_muzzle` | Empty at MUZZLE. |
| `cannon_core` | Empty at the lens centre. |
| `cannon_vent_mouth` | Empty in the hatch opening, 35% along the hatch from its elbow edge and 4 mm above the pod top. Steam jets from it along `VENT_DIR` (outer, a little top, back toward the elbow), so in the vent pose it leaves the hatch sideways. |

## Materials

The asset uses one `cannon` MeshStandardMaterial with three 8x8 palette PNGs and nearest filtering. Each part owns a
2x2 texel block.

| Part | Base colour | Roughness | Metal | Emissive mask |
|---|---|---|---|---|
| Shell | #434a51 (#373c42 read near-black side-on in flight) | 0.50 | 0 | - |
| Panels, seams, rim seal, pod rear face, cavity walls | #2c3035 | 0.70 | 0 | - |
| Steel trim, rails, muzzle ring | #c2bab2 | 0.35 | 1 | lip: B |
| Copper fins | #d4804a (stylised; the physical #fad1c2 reflected the sky and read pale blue-white) | 0.40 | 1 | G 128 (hot only) |
| Green band (painted) | #2f8f5a | 0.50 | 0 | - |
| Bore | #0b0d10 | 0.90 | 0 | - |
| Core lens | #0b0d10 | 0.60 | 0 | R |
| Heat strips, vent cavity floor | #2c3035 | 0.55 | 0 | G 255 |
| Coils: barrel collar s 0.40-0.44 and two slide bands | #1d2226 | 0.60 | 0 | B |

- The shell is a value step darker and glossier than the textile (#57636c, roughness 0.80).
- Metal covers 17.4% of the outer area.
- There are no normal maps. Normals come from 2.5-3 mm bevels and a Weighted Normal pass (Face Area, 50, Keep Sharp), exported as custom normals.
- The runtime shader computes `mask.r * core + strip * heat + fin * fins + mask.b * ring`, with strip = G >= 0.75 and fin = G in 0.25-0.75,
  so the fins stay copper until the heat reaches 0.8.
- The core lens is 0.25 relaxed, 0.45 aimed, 0.55 firing plus a 0.4 flare (under ACES at exposure 1.2 the old #58e1ff at
  1.0-2.5 rendered pale and then white). Its colour follows the same heat ramp as the strips: #00c8ff below 0.6, amber from 0.6,
  red from 0.85. Seen from behind, the lens is the largest glow, so it is the one that has to change colour.
- The ring set (mask B: muzzle lip, barrel collar, two slide coils) glows cyan at 0.2 relaxed, 0.3 aimed, 0.45 firing plus the
  flare, so the barrel reads as an energy weapon side-on (flight carry). The barrel core is slimmer than the housing and the
  muzzle ring flares to 0.10 m, so the side view steps housing, shroud, collar, muzzle.
- Overheat: core red at 0.3; while the hatch stands open the strips, cavity floor and fins keep at least 3/4 of their red glow
  (fading with the lock alone, the exposed copper fins plus a sun highlight on the raked rear face read as a pale skin-coloured
  patch). The rear face and cavity walls are matte panel (roughness 0.70) for the same reason.

## Budget

- 2,808 triangles (cap 4,000) and 106,000 bytes (cap 150,000).
- 3 meshes: +3 draw calls, with `castShadow` false.

## Rebuild

```sh
perl -e 'alarm 900; exec @ARGV' /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/arm_cannon/build.py     # GLB + asset.json (run twice: consecutive_builds_identical)
perl -e 'alarm 900; exec @ARGV' /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/arm_cannon/render.py    # review.png + closeup.png
pnpm exec vitest run tests/arm-cannon-asset.test.ts
```

| Script | Job |
|---|---|
| `fit.py` | Reads suit.glb and the contract, builds the R1 rigid hull, weights and posing. |
| `parts.py` | Geometry. |
| `palette.py` | PNGs, material, per-face palette UVs. |
| `build.py` | Export and measurements. |
| `render.py` | Stills. |

## Review stills

- `review.png`:
  - top row: chase aim, chase carry, ADS and vent in portrait;
  - second row: chase aim and carry in landscape;
  - third row: ADS landscape, the STRESS pose (elbow 1.55 rad) side-on, and a flight-style pose side-on;
  - last rows: 4x crops around the cannon in each game frame.
- `closeup.png`:
  - the view along VIEWS[0], a three-quarter view from the top-outer rear, and the cuff-to-sleeve joint;
  - four heat states: cyan, amber, red (lens and strips together), and overheat with the hatch at 105 deg and the slide back.

The stills are posed in Python with blaster weights R1-R3 (without the runtime seam ring) and hand_r scaled to 1e-3. The approximation is Filmic, not
ACES.

## Known limits

- The per-shot slide cannot be seen at chase aim, because it moves along the view axis. It reads in ADS, side-on flight and the vent pose.
- The upper arm partly hides the cannon at chase aim. The carry holds it out beside the torso, where it reads whole.
- The heat strips reach only 35% visible from behind: they lie on the pod flanks. They pass the projected-area test together with the exposed fins.
- Because of the 7 mm clearance, a dark ring shows at the rim. A dark seal 2.5 mm off the sleeve hull, in the first 4 mm of the rim, narrows it.
- The raised-arm shoulder shape (a deltoid corner in AIM) comes from the character rig. Lowering the clavicle 0.1 rad in AIM_BASE
  rounds it; the blaster weights' seam ring removed a 17 mm ridge the harmonic solve had added on the front armpit fold.
- The under-hatch fins are 4 mm thick, not 3 mm, to respect the 4 mm minimum feature size.
- The pale fingers behind the cannon in the closeup's heat tiles are the character's left hand (hanging at the far hip,
  checked by projecting its vertices into that camera), not the hidden right hand.
- In ADS the sleeve at the elbow end crosses the top of the steel rim by 1-2 device px. It is nearer the camera than the rim,
  so this is occlusion, not poke-through: rigid forearm points clear the shell by at least 5.6 mm, and the flexion check keeps
  every upper-arm triangle at least 56 mm away in the aim, carry, vent and stress poses.
- iPhone Safari is not validated.

## In-game captures (2026-09-23)

`ingame-portrait.png` (390×844) and `ingame-landscape.png` (844×390): production build in headless system Chrome with iPhone-sized emulation (not iPhone validation). Each tile is the full frame over a zoom on the arm. Frames N to N+12 of hip fire from carry are CDP screencast frames (about 17 ms apart); the other states are screenshots at approximate times (a screenshot takes about 240 ms). What they show: frame N already has the barrel on the crosshair line with the flash, and the tracer leaves the muzzle on N+1; the cannon reads at chase mainly as the lit cuff and lens at the end of the arm, side-on in cruise flight as the barrel with its rings; overheat shows the red fins, open hatch and steam. In the grounded carry the cannon is mostly hidden behind the body from the chase camera.

Revision 2026-09-23 (visual review r3, checked in the `cannon-fix-r3` scratch captures): the pod stands 11 mm taller and
wider, and the outer flank carries the fin stack (0.169 m across seen from behind, was 0.131). The asset test now caps the
side-on depth (0.16 m, length ratio 2.2-3.2) and the rear width (0.18 m) separately. The in-game tiles above predate r3.

Revision 2026-09-23 (visual review r2, checked in the `cannon-fix-r2` scratch captures): the core lens follows the heat ramp; the
hatch hinges on its muzzle-side edge and opens to 105 deg, showing the red cavity and fins at chase in the vent pose; steam jets
sideways out of the hatch; the barrel carries glowing coils and a slimmer core; the shell is one step lighter; the pale patch in
the lockout return is gone (red lens, matte rear face).

Revision 2026-09-23 (visual review r1): the captures above predate these fixes. Re-checked in `cannon-fix-r1` scratch captures:
the tracer is drawn from the muzzle on the shot frame, the carry-to-aim punch runs over 4-6 frames (AIM_RATE 18, no press snap
from carry), and the grounded carry shows the cannon beside the body. The flexion check now uses the runtime R1 + R3 weights
(with R1 alone, rig.py's spine share on the forearm read as a 17 mm overlap in the abducted carry that the runtime never shows).
