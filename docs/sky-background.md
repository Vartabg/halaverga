# Sky and background (task `sky-background`)

Owner note (Garo, 2026-10-01): the sky and the background are ruining the demo. Fix them.

Scope: the sky dome, clouds, sun, horizon band, distant skyline and fog. Not flight, controls or UI.
Fiction (AGENTS.md): a fictional modern hillside city destroyed in 2033, visited in 2113. The target is a clear, hopeful, sunlit
afternoon over a flooded, overgrown, damaged city, not an apocalypse and not a flat grey haze.

Status: **S1 (sky dome, sun, clouds, sky colours and the coherence of water reflection, fog colour, hemisphere and environment) and S2
(horizon band, sea haze, distant skyline, fog range) are built, and repair round 1 (after the first review of the S2 frames) is in; see
"Repair round 1" and "Repair round 2" near the end, which supersede the numbers below where they differ.** Nothing is pushed. The old skyline boxes are
gone: the background is now a sky, one haze, and a seeded three-layer skyline standing in the sea.

## One source of truth: `src/world/atmospherePalette.ts`

Plain data and pure maths, no `three`, no DOM. Import it only from `src/world` modules reached through `Scene.tsx` (it must stay in the
lazy world chunk; `grep -rn atmospherePalette src/game src/ui` returns nothing). The file is **not** called `atmosphere.ts` because
`Atmosphere.tsx` sits beside it and a case-insensitive filesystem (macOS) resolves `./Atmosphere` to the `.ts` file first
(`tsc` reports TS1149). S2 extended this file.

Exports: `SUN_POSITION`, `SUN_DIRECTION`, `SUN_COLOR`, `SUN_DISC`, `SUN_CREAM`, `SUN_PALE`, `SUN_UV`, `SUN_XZ`, `HAZE`, `SKY`,
`SKY_STOPS_H`, `CLOUD`, `FOG`, `SKYLINE` (S2: seed, crown green, layer gaps, layer tints), `HEMISPHERE`, `EXPOSURE`, `WATER_BODY`,
`SEA_BODY`, `acesFilmic`, `hexToLinear`, `glslRgb`, `glslVec3`, `skyBase` (the TypeScript twin of the GLSL `skyBase`),
`directionFromUv`, `driftClouds`.
Colours are display hex (what appears on screen). Nothing else in the repo hand-types the sun or a sky colour any more: the
directional light, the dome, the water glint and reflection, the environment map (glow centre and sky half), fog and hemisphere all read
this file. `scripts/arm_cannon/render.py` still carries the old olive hemisphere ground and its own sun for the Blender cannon renders;
it was left alone on purpose.

### Palette (S1 values)

| Role | Hex | Notes |
|---|---|---|
| HAZE | `#d3e0e4` | Horizon, eye level and below, fog colour, far end of the sea. One colour for all of them. |
| Sky low (10 deg) | `#a9cbe3` | |
| Sky mid (30 deg) | `#7fb0dc` | |
| Sky zenith | `#3f7fc4` | |
| Warm sun-side lift | `#f2e6cc` | Lifts the low sky toward the sun only, zero at the horizon and on the far side. |
| Sun light / disc / cream / pale | `#ffe6b2` / `#ffe8a0` / `#ffecbc` / `#e4eef8` | The light is unchanged. The disc is a fixed on-screen gold, soft edged; cream and pale are the glow (round 1). |
| Cloud lit / shade | `#fbf8ee` / `#a3bad0` | Round 1: warmer tops, a cooler shade (was `#f4f4ee` / `#aebbc8`). |
| Hemisphere sky / ground | `#c0dbed` / `#647c7a` | Ground was `#737657` (olive); see the A/B below. Intensity 1.7 unchanged. |
| Fog | HAZE, near 70, far 590 | S1 changed the colour (was `#a9c0b8`), S2 the range (was 95 to 330). See the factor table below. |

### Sun (it does not move)

`SUN_POSITION = [-65, 100, 80]`, direction `(-0.4526, 0.6963, 0.5570)`, elevation 44.1 deg, equirect centre `SUN_UV = (0.8586, 0.7452)`
derived from the direction, never typed. At the default heading (north) the sun is 141 degrees behind the view. The hero, arm cannon and
FX are tuned against this sun and ACES at exposure 1.2, so it stays. Moving it later is one line, plus `scripts/arm_cannon/render.py` and
the SUN constant in the scratch capture script.

## What S1 changed

- `Sky.tsx`, `skyShader.ts`: a display-referred dome (`toneMapped` off, `colorspace_fragment` only encodes sRGB, a one-fract screen-space
  dither on top). The view direction is `normalize(vWorld - cameraPosition)`, so the horizon is exactly at eye level at any height.
  The dome keeps `gl_Position.z = w`, radius 700, camera far 650. `renderOrder 1`: drawn after the opaque scene, so early-z rejects the
  pixels the city covers (derived from three's sort order, not measured on a phone).
- `skyBase` ramp on screen matches the authored stops within 0 to 2 levels on clear pixels (measured on `high-horizon-desktop`:
  8 degrees `#b0cee3`, 10 `#aacbe3`, 15 `#a3c6e1`, 20 `#94bddf`, 25 `#88b5dd`), so the GLSL and the TypeScript twin agree.
- `cloudData.ts`: one 256x256 RGBA8 tileable texture made once at load with an integer hash (no `Math.random`, no `sin`): R coarse
  billow cumulus (domain warped), G finer detail, B a broad weather map that makes banks and clear gaps. Texture: repeat wrap, mipmaps,
  no colour space, created in `useMemo`, disposed on unmount (the Scene remounts after context loss).
- Cloud shader (S1 numbers; round 1 raised the lift to .55, see below): a flat layer projected as `dir.xz / (h + .3)`, faded out before the horizon (no vertical curtain streaks; checked with a
  strong contrast stretch of the rows 3 to 10 degrees above the horizon). Five taps and no loops: shape, a blurred read and a blurred
  read shifted toward the sun for the lighting (lit rims toward the sun, cool shaded bases), the weather map, and an edge-roughness read.
  The edge ramp follows `fwidth`, so edges stay crisp when a cloud is magnified at the zenith.
- Drift: `driftClouds()` advances a uniform at `(.003, .001)` uv per second inside the dome's `useFrame`, only while playing and not under
  reduced motion; a long frame counts as .04 s; it never calls `invalidate()` (play already renders every frame).
  Measured on the production build (top 140 rows of the 1440x900 hero view, sky-only strips, 126,000 px): 5 s of play 62,747 px differ;
  reduced motion over 4 s 430 px differ, all by at most 2 levels (sub-pixel camera jitter at cloud edges, no translation); paused, then
  resized and restored, 0 px differ.
- `CLOUD.offset` was picked by a CPU twin of the cloud mask (a search over 1,600 offsets) so that the sun neighbourhood stays clear, the
  first view keeps the middle of the skyline clear, and the look-up and level views keep a believable amount of cloud. Round 1 changed
  the texture scale, lift and coverage, so it was picked again, and the search now also keeps the HUD text clear (see round 1). If the
  texture, scale, lift, coverage or wind change, pick the offset again.
- `waterShader.ts`, `Atmosphere.tsx` (`Water`): the body (deep teal, shimmer, wake) is still tone mapped like the city; the reflection is
  `skyBase(reflected)`, display-referred, mixed in by the Fresnel term, so at a grazing angle the water meets the dome with no seam; the
  sun glint is tone mapped and added on top; the far end fades to HAZE between 110 and 360 m (S2 replaced this with scene fog). The
  unused `tint` uniform and the private sun vector are gone; the water takes `SUN_DIRECTION` as a uniform.
- `EnvironmentLight.tsx`: the sky half of the environment map is `skyBase(directionFromUv(u, v))` at texel centres, the glow centre is
  `SUN_UV`; ground, intensity (.45) and glow strength are unchanged.
- `Scene.tsx`: fog, hemisphere and directional light read the palette (same sun vector, same intensity 3.5).

## Deviations from the design brief

1. File name `atmospherePalette.ts` instead of `atmosphere.ts` (case clash above). Tests live in `tests/atmosphere.test.ts` as planned.
2. Dither is a one-fract interleaved-gradient noise in the dome shader, not three's `dithering` define: that chunk calls `rand()` from
   the `common` chunk, which ShaderMaterial does not include (shader failed to compile), and `rand` is a `sin` hash.
3. Clouds: five taps, not three. The planned thin-streak tap drew long straight contrail-like lines near the sun and was dropped; its
   channel became the weather map. Projection `h + .3` (was `.12`) and scale `.5` (was `.35`) to cut the 4x size jump between the
   horizon and the zenith; wind half the planned speed; a billow fold on every octave, which gave the defined cumulus edge.
4. The sun disc has its own fixed gold (`SUN_DISC`) instead of a clipped `SUN_COLOR * 1.5`, which showed as pale yellow-white. A warm tint
   on the halo was tried and rejected (it went mauve against the blue).
5. The sun glint is tone mapped separately and added after the reflection mix, so the Fresnel mix does not dim it.

## Measurements (S1)

- Cloud texture generation: 19 to 23 ms on first use and 13 to 15 ms warm, in headless Chrome on this Mac while another build was
  running (logged from a scratch copy, not committed). That is under the 25 ms line, so it stays 256x256. A phone is likely two to three
  times slower; not measured.
- Hemisphere and environment A/B (mean luma of a fixed crop on the hero's back and hips, before vs now): desktop 92.8 to 90.3,
  phone portrait 91.5 to 88.8, phone landscape 85.4 to 82.2 (-2.5, -2.7, -3.2; the limit was 6). The new environment alone gave -2.9 and
  the cooler hemisphere ground +0.3 on top. Mean RGB desktop (83, 96, 93) to (78, 93, 95): a slightly cooler suit, no clipping.
  Both stay. Reverting the ground is one line (`HEMISPHERE.ground` back to `#737657`).
- Renderer counters (production build, desktop, at the spawn and at 80 m): 18 draw calls, 578,872 triangles, 18 geometries, 20 textures
  (before: 18, 578,872, 18, 19; the one new texture is the clouds).
- Landing first load: `node scripts/check-first-load.mjs` prints 635.6 KB of 636 KB, unchanged. No new dependency, no network asset,
  `package.json` and the lockfile untouched. Every new module is under 200 lines.
- Sun (`toward-sun-*`, three viewports): the disc is `#ffeeaa`; the clear-sky brightness falls off monotonically outward, 35 to 83 luma
  levels lower at about 8 disc radii than at 3; clear sky keeps saturation .25 at 8 degrees from the sun, .34 at 12 and .39 at 18
  (desktop, rows below the CSS scrim; the 25 degree ring runs into the foreground slab); no pixel in any of the 33 frames matches the
  drone-eye detector (`r > 190, g < 110, b < 100, r - g > 120`).
- HUD legibility, white against the pixels behind the HALAVERGA brand text (ground-horizon-hud, median background): portrait 2.84 to 2.46,
  desktop 2.67 to 2.78. The brand sits over a cloud edge in portrait, so it is a little weaker there than over the old grey sky.
  The telemetry in portrait went 1.59 to 1.81 (median) and 1.56 to 1.36 (80th percentile). The CSS scrim is unchanged.
- Tests (S1; round 1 added more): `tests/atmosphere.test.ts` (16 tests): one sun, haze exact at and below eye level, ramp stops, bluer with height, warm lift
  toward the sun only, fog colour equals haze, GLSL strings built from the palette, display-referred dome pinned to the far plane,
  disc colour, cloud data deterministic, tileable and 32 to 48 percent coverage, drift holds still when paused or reduced.
  `pnpm test` runs 175 files and 2,158 tests, all green (one earlier full run under CPU load showed a single timing failure that did
  not repeat in two re-runs). Browser specs run on a scratch production build on port 3511:
  `recovery.spec.ts` and `flow-recovery.spec.ts` 16 of 16, `lab-switch.spec.ts`, `accessibility.spec.ts` and `classic-blast.spec.ts` pass
  (one `classic-blast` second-finger tap failed once under CPU contention from another build and passed on two re-runs of the file).

## What S2 changed

(S2 numbers for the skyline look, the foot mist and the edge hills are superseded by round 1 below.)

### Fog, one haze for sea, city and skyline

`FOG = { color: HAZE, near: 70, far: 590 }`, still three's linear smoothstep on view depth, applied after tone mapping and the sRGB
encode, so the fog colour on screen is exactly the HAZE hex and equals the dome at eye level. The far end stays under the camera far
plane (650), so the sea's far-plane clip always lands in full haze.

| Depth m | 100 | 150 | 230 | 300 | 330 | 370 | 400 | 450 | 500 | 550 | 590 | 650 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| new 70 to 590 | .01 | .06 | .23 | .41 | .50 | .61 | .70 | .82 | .92 | .98 | 1 | 1 |
| old 95 to 330 | 0 | .14 | .61 | .96 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

From the spawn the three skyline layers sit at about 380, 440 and 500 m (fog about .64, .79, .93). The district itself (under 250 m) is
crisper than before. `tests/atmosphere.test.ts` pins 70, 590 and the factor at and beyond 590.

### Water (`waterShader.ts`, `Atmosphere.tsx`)

- The sea takes the scene fog: `fog` on the material, `UniformsLib.fog` merged into its uniforms, `fog_pars_vertex`, `fog_vertex`,
  `fog_pars_fragment`, and `fog_fragment` after `colorspace_fragment`. S1's private 110 to 360 m blend is deleted.
- The plane (1400 x 1400, y .1) follows the camera on x and z in the water's `useFrame` (outside the paused guard). The ripple phases use
  world position, so they do not slide. Its edge is never in view, and it stays 2 triangles.
- Each ripple octave fades out once it is finer than a pixel (`fwidth` of its own phase): `a` (3.3 m) between .4 and 1.2 rad per pixel,
  `b` (2.5 m) between .2 and .7, `c` (1 m) between .15 and .5. The shimmer term uses the same fades. The far sea is calm: long soft
  streaks that dissolve into the haze, no checker.

### The distant skyline (`skylineData.ts`, `skylineParts.ts`, `Skyline.tsx`)

World-fixed, outside the flyable box, seeded (`mulberry32(2033)`, no `Math.random`), no colliders, nothing added to `makeCity().solids`,
no shadows, no per-frame code, one draw call. The 20 old window-less boxes are deleted from `cityData.ts` (city mesh 85,928 to 85,448
triangles; the 101 colliders and their hash `ef8cefd9ae2bbdc6` are unchanged).

- Layout: three layers on the flyable box pushed out by a gap per side (north / east and west / south): 110 / 120 / 200 m, 170 / 180 /
  260 m, 240 / 250 / 330 m, corners rounded (radius 90 m), arc pitch 24 to 38 m with irregular gaps, density x1 within 75 degrees of due
  north and about x.6 elsewhere. Layers 1 and 2 keep the canal axis clear (|x| < 30 m, north) and flank it with a tall cluster on the
  left (x -130 to -60: 3 towers of 85 m or more) and a smaller one on the right (x 60 to 110: 2 towers). The bounding boxes stand 107 to
  370 m outside the flyable box (the nearest layer's contour is 110 m out; the bounding box of a yawed tower reaches 3 m in).
- Counts: **183 towers** (layer 1: 46, layer 2: 65, layer 3: 72; by side, centres: north 31, south 26, west 15, east 20), **3,816
  triangles**, 7,632 vertices, built in about 23 ms in Node on this Mac (not timed on a phone). Tops, spires included: 49 to 135 m (layer 1),
  56 to 150 m (layer 2), 65 to 150 m (layer 3); nothing is over 170 m.
- Shapes (each tower is a body plus parts that start inside the part below it, so nothing floats): setbacks on 74 of 183 (stacked at
  80 and 60 percent footprint), a notched top on 18, a tilted slab top on 28, spires on 27, a lean of up to .07 rad about the foot on 26,
  a green crown on 8 of layer 1's 46 (`#4f6f4a`). Every foot is 3 m under the water, as the old skyline was.
- Colour: baked per vertex from the layer tint table (lit and shaded, wide split on purpose, because fog compresses it to about a
  fifth), chosen by the face normal against the one shared sun with a smooth step, tops 8 percent brighter, per-tower brightness jitter
  of 6 percent. Layers are paler and cooler with distance: lit `#889aa6`, `#8496a2`, `#93a5b0`; shaded `#5a6c78`, `#64767f`, `#778992`.
- Material (`Skyline.tsx`): `MeshBasicMaterial`, vertex colours, `toneMapped: false`, `fog: true`. One small `onBeforeCompile` patch adds a
  mist at the feet (67 percent haze at the waterline, 20 percent 12 m above the foot: a misty foot, never a hard dark one) and, on vertical faces
  only, a faint window grid (3 m bays, 4.5 m floors, found from the face's own derivatives, no texture). The grid fades out between
  300 and 520 m of depth and before it gets finer than a pixel, so near towers read as buildings and the hazy hero skyline stays calm.
- Layer 3 is kept: at fog .93 it reads as faint pale silhouettes behind layer 2 in `ground-horizon-*` and `high-horizon-*`, which is the
  point of the third layer.

### District-edge hills and the terrace parapet (scope-adjacent, one-line reverts)

- The two edge slabs (`cityData.ts`, solid colliders, size and position unchanged) went black in every sideways view under the new sky:
  a dark olive tint on a dark moss map (mean linear albedo .098, .097, .013). Their hexes are now `#94a98c` and `#8aa084`, both added to
  the `ground` list in `kit.ts` (the old two removed; an unlisted hex silently becomes `stone`), and `kit.box` takes an optional `lift`
  that multiplies the baked vertex colour past 1 (`SLAB_LIFT = 2.7`), because a white tint could not lift that texture enough.
  `tests/skyline.test.ts` pins that the lifted tints land in the ground group.
- The black wedge in `toward-sun-*` and `skyline-left/right-*` was not a slab: ray-casting the frames against the city boxes showed it is
  the 2 m steel panel at each side of the arrival terrace (x = +/-9, 12 to 14 m from the camera, shaded face, metal group). It is now pale
  concrete with a lift of 1.5 (not solid, so colliders and navigation are untouched).

## Deviations from the design brief (S2)

1. Window grid on near faces (the brief had only soft floor bands). The bands alone read as plastic stripes at 143 m (`edge-out`).
2. Ripple fades are per octave and tighter than the brief's single `.8 to 2` (see Water): at `.35 to 1.1` a regular lattice from the
   two main octaves was still visible between 60 and 110 m.
3. The slab fix needed a vertex colour lift as well as the hex lift (the brief asked for roughly twice the albedo; that alone left the
   shaded face at luma 28 to 39 under the new fog). With the lift the median is 58.
4. The terrace parapet is changed too (see above): the brief took it for a slab.
5. The sky-above contrast in G4 cannot hold for layers 2 and 3 in `high-horizon-*`: the camera is near the tower tops, so the sky above is
   the haze band, which is also what the fog fades them to. Their separation is by layer luma steps instead (below).

## Measurements (S2)

- Renderer counters (production build, desktop, spawn and 80 m): **19 draw calls, 582,208 triangles**, 19 geometries, 20 textures (S1: 18,
  578,872, 18, 20; before: 18, 578,872, 18, 19). The +1 call and +3,336 triangles are the skyline (3,816) minus the old boxes (480).
- Landing first load: `node scripts/check-first-load.mjs` prints **635.6 KB** of 636 KB, unchanged. No dependency, no network asset,
  `package.json` and the lockfile untouched. Every new module is under 200 lines (`skylineData.ts` 62, `skylineParts.ts` 82,
  `Skyline.tsx` 37).
- Hero (suit crop of `ground-horizon-*`, same rectangle as S1): mean luma desktop 90.3 to 90.2, portrait 88.8 to 88.8, landscape 82.2 to
  82.1. No change in hue or clipping, because fog at 15 m is 0. HUD contrast numbers are the S1 numbers (the sky behind the text is the
  same).
- Horizon: no flat band, no water edge. Largest adjacent-row step through the horizon on a column of sea and haze only: `high-horizon-desktop`
  5, `edge-out-desktop` 6, `high-horizon-phone-portrait` 1 levels (S1: 9 to 2). At `low-water` (2 m eye height) the fog ramp is steeper
  per row because perspective compresses 350 m of sea into 8 rows: 8, 6, 5, 4, 3 levels over the first rows, smooth, no edge.
- Layers (`high-horizon-*`, tower faces sampled by projecting the generator's towers into the frame): mean luma desktop 193.9, 203.8,
  216.1 (steps of 9.9 and 12.3), landscape 180.6, 202.8, 215.9. Layer 1 is 38 (desktop) and 22 (landscape) RGB levels from the sky above
  its tops; layers 2 and 3 are within 5 to 9 of it, because that sky is the haze band (deviation 5).
- Darkest tower faces: in `edge-out-*` (143 m, the nearest approach) the 1st percentile of tower pixels is luma 104 and the darkest pixels
  (78) all lie in the top 62 rows, under the CSS vignette. Nothing near black. The old monoliths read luma 30 to 70.
- Edge hills: shaded face (`skyline-left-desktop`, outer slab) median luma 58 (10th percentile 54; the hex lift alone gave 28 to 39), sun-lit face
  median 87, brightest lit top 216 (limit 235). Terrace parapet median 57 to 86 depending on the view.
- Drone-eye detector (`r > 190, g < 110, b < 100, r - g > 120`): 0 pixels in all 33 frames.
- Behaviour (production build): clouds drift in play (104,275 px differ over 5 s in the top 140 rows); paused, resized and restored: 0
  px differ; reduced motion: mean absolute difference .18 levels over 4 s (7,121 px differ by at least one level on the S1 build with the
  same script, 6,950 here: sub-pixel edge shimmer, no translation; the camera direction change is exactly 0). Water still animates under
  reduced motion (existing behaviour, decision D10).
- Frames: `scratchpad/sky/build-S2` (33 frames and 3 contact sheets, 0 missing, 0 camera mismatches, 0 page errors, production build on
  port 3512, desktop Chrome on Metal at phone-shaped viewports: emulation, not iPhone validation).
- Tests: `tests/skyline.test.ts` (11 tests: deterministic bytes, triangle budget 2,500 to 6,000, colours in range, three layers, nothing floats,
  shape variety, 100 to 400 m outside the flyable box, 340 to 410 m from the spawn camera, canal vista and landmark clusters, colliders and
  city triangle count, edge hills in the ground group, mount source checks) and `tests/atmosphere.test.ts` (19 tests, 3 new: fog numbers,
  water fog chunks, ripple fades).

## Repair round 1 (2026-10-02, after the first review of the S2 frames)

Garo: "better, you're trending in the right direction; the sky and the background still are ruining the demo". A second round of reviewers
looked at the S2 frames (`scratchpad/sky/after0`) and raised 13 problems. Each was checked on those frames first. Measured frames of this
round: `scratchpad/sky/fix0` (production build of the final commit, 33 frames and 3 sheets on port 3530, 0 missing, 0 camera mismatches,
0 page errors, desktop Chrome on Metal at phone-shaped viewports: emulation, not iPhone validation).

### What was real and what was done

| Problem | Verdict | Change |
|---|---|---|
| Sun is a flat yellow dot in a cool white bloom | Real: disc `#ffeeaa` (10 px), then `#edf2f5` (sat .05) within 4 px | The glow is mixed, not added (an add pushes blue sky through white): gold core `#ffe8a0`, cream `#ffecbc`, pale lift `#e4eef8`, sky. The disc is about 1.5x larger with a soft edge. Cloud rims toward the sun get a cream silver lining. Measured on `toward-sun-*`: disc `#ffe8a0`, cream `#eee3c6` (sat .17) at 26 px, pale `#ccd5db` at 50 px, sky `#8ab5dc` at 220 px; before `#ffeeaa` then `#e8f0f9` (sat .07). |
| Edge hills are lime (and flat, and one wall near black) | Real: sat .50 to .72, hue 70 to 72. Cause: the moss texture is yellow (mean 88, 87, 30), so any tint on it is lime | `HILL` in `cityData.ts`: grey-green walls and sage tops on the stone texture (hexes not in `surface()`'s lists), `kit.hill()` cuts each hill into 16 m cells with their own tone, tops mossy and walls darker toward the water. Colliders are the same plain boxes (hash `ef8cefd9ae2bbdc6` unchanged). Measured: tops sat .24 to .31 (was .55 to .62), hue 75 to 82; shaded walls luma 69 to 77 (was 50 to 56). City mesh 85,448 to 86,784 triangles. |
| Skyline is clean, uniform, cardboard (3 reports) | Real: faces within 1 level of each other, flat roofs, one grid | `skylineDamage.ts` (new) and `skylineParts.ts`: each tower has a mood (bleached, moss-stained, rusty, glassy, dark, plain), a darker low third, and damage from its own seeded stream so the layout never moves (layer counts 46, 65, 72 unchanged): lost floors (a recessed core between two blocks) on 13 of layer 1's 46 and 16 of layer 2's 65, sheared roofs on 33, leaning facade panels, and clusters of green crowns (14 of layer 1's 46, was 8). Lit faces on the two near layers are warmer. The shader varies the window grid per tower (a vertex seed sets bay width and floor height), darkens blocks of panes and dim floors, and drips moss stains on the two near layers. 4,772 triangles (was 3,816, cap 6,000). |
| Near towers have a hard, pale foot | Real: at `edge-out-desktop` x 950, y 520 the foot was luma 199 against water 163 | The foot now mists toward the colour the sea really has there (`SEA_BODY`, the ACES twin of the water body, mirrored with the haze by the grazing angle, as `waterShader.ts` does), over a thin darker contact shade. The ACES twin matches the sea on a downward frame (`#01827c` computed, `#06817d` measured). Measured: 159 at the waterline against water 162; the 25 px above it are 12 to 14 levels darker (the contact shade and the darker low floors), a soft ramp, not an edge. |
| Clouds smeared and streaky at the top of a level phone frame | Real cause: projection `dir.xz / (h + .3)` magnifies the top of the frame about 4x; the lighting taps used a +2 mip bias on top | Lift .55 and scale .84 (the 10 to 40 degree texture density ratio falls from 2.0 to 1.65 along the horizon and from 3.5 to 2.2 up the frame), taps blurred by 1.5 not 2, edge roughness grows with height, shade colour cooler. `tests/atmosphere.test.ts` pins both ratios (below 1.8 and 2.5). |
| Cloud coverage looks like 55 to 60 percent | Not borne out: measured on the S2 frames (cloud = not blue dominant, upper rows), 38 to 44 percent. Perceived busyness, not amount | Left near the 35 to 45 brief; now 27 to 34 percent in `ground-up` and the hero frames (the hero frame is deliberately clearer: see the offset), 46 to 69 percent in `toward-sun` (the sun sits in a bank). |
| Centre of the first play frame is a milky void; the farthest tower is invisible | Real: farthest tower 217 against haze 219 | The skyline's own fog is capped at 88 percent, so the farthest layer keeps a trace of its colour: tower 209 against haze 219 (10 levels). The haze band above the horizon falls off faster (22 not 18, weight .78), so it reads as mist, not a white wall. The authored stops at 0, 10, 30 and 90 degrees still hold. |
| Landing screen is dark teal murk | Real, and not fixable in the world: see the flags. Measured sky luma 100 at `y 150 to 330` on a phone before and 101 now | Not changed. |
| Black notch (luma 14) beside the slab ends at `low-water` | Real pixels, but it is the shaded canal-side face of the district's own bank and barrier geometry inside the flyable box, not background | Skipped: changing it would change the district's materials. Flagged. |

### Cloud offset, HUD and frame 0

The offset (`.725, .525`) comes from a CPU twin of the dome's cloud density (bilinear texture, weather map, edge roughness) over 1,600
offsets and three viewports (portrait, desktop, landscape): about 35 to 40 percent cloud in the upper 40 percent of the frame, the canal
vista (centre column, 3 to 13 degrees up) 3 to 13 percent cloud, the sun clear at frame 0, and the exposed HUD text zones (brand, telemetry)
clear. The first S2 offset put a cloud behind the brand and telemetry text and a bank over the middle of the skyline. White text behind the
brand now has 2.68:1 on a phone (median background; S2 2.38) and 2.91:1 on desktop (S2 2.60); the telemetry 1.86 (S2 1.83).

### Measurements (production build, `fix0`)

- Renderer counters (spawn and 80 m): **19 draw calls, 584,518 triangles**, 19 geometries, 20 textures (S2: 19, 582,208, 19, 20). The +2,310
  triangles are the cut-up hills (+1,336) and the skyline damage (+956 net).
- Landing first load: `node scripts/check-first-load.mjs` prints **635.6 KB** of 636 KB, unchanged. No dependency, no network asset.
  `grep -rn atmospherePalette src/game src/ui` returns nothing. Every module is under 200 lines (`kit.ts` 121, `Skyline.tsx` 65,
  `skylineParts.ts` 92, `skylineDamage.ts` 49).
- Drone-eye detector (`r > 190, g < 110, b < 100, r - g > 120`): 0 pixels in all 33 frames.
- Horizon seam on columns of sea and haze only: worst adjacent-row step 1 (`high-horizon-desktop`) and 3 (`edge-out-desktop`).
- Darkest tower pixels in `edge-out-*` (not blue, not cloud): minimum 81 (desktop and landscape), 91 (portrait); 50 and 52 pixels of about
  100,000 are under 85, all in the recessed cores. Nothing near black.
- Behaviour: clouds drift in play (78,984 px differ over 5 s in the top 140 rows); paused, resized and restored: 0 px differ; reduced
  motion: 6,729 px differ by sub-pixel edge shimmer (S2: 6,950), no translation.
- Tests: `pnpm test` runs 176 files and 2,180 tests, all green. New: sun glow mix and cloud density ratio (`atmosphere.test.ts`, 21 tests);
  hills on the stone texture and cut into cells, the weathering counts, seeds and moods, the layout kept (46, 65, 72), the ACES twin and
  the sea colour, and the foot shader source (`skyline.test.ts`, 17 tests). Browser specs on the scratch production build on port 3530:
  `recovery.spec.ts` and `flow-recovery.spec.ts` 16 of 16 (graphics loss rebuilds the skyline), `classic-blast.spec.ts`,
  `lab-switch.spec.ts` and `accessibility.spec.ts` 28 of 28.

### Owner flags that remain

1. **The landing screen is still the same murk, and only a CSS change fixes it.** The scrim over the canvas
   (`src/ui/Experience.module.css` lines 5, 6 and 34) darkens the landing sky to luma about 100. This round was fenced off the UI, so
   it is unchanged. A scratch-only trial of the proposed values (three small edits, the patch is `scratchpad/sky/fix/landing-scrim.patch`
   and applies cleanly) lifts the same sky to luma 165 and the headline still reads: base top stop `rgba(7,25,32,.67)` to `.3` fading out by
   18 percent; `.introVignette::after` to `radial-gradient(ellipse at 30% 55%,#10272f66 0%,#10272f40 35%,transparent 80%)`; the phone rule's
   top stop `#102a32aa` to `#102a3255`, fading out by 18 percent. In play, the top 12 percent still gets a dark band from
   `.vignette:not(.introVignette)` (`#102a3266`): it is visible as a step at the top of every play frame. Needs Garo's yes.
2. The black bank-end faces at `low-water` (district geometry, above).
3. The sun still sits behind the camera at the default heading (D2). Moving it is the one-line change in the deferred list.
4. Real phone confirmation is still owed: no Safari or iPhone frame exists, and OLED brightness changes how a pale sky reads. The skyline
   shader now has about 12 more ALU ops per skyline pixel and no new texture; the dome has the same five taps. Not timed on a device.

## Repair round 2 (2026-10-02, after the second review of the S2 frames)

Garo: "better, you're trending in the right direction. the sky and the background still are ruining the demo for me". Three reviewers (art,
technical, the owner's eye) looked at the round 1 frames (`scratchpad/sky/after1`) and raised 14 problems. Each was checked on those frames
first. Measured frames of this round: `scratchpad/sky/fix1` (production build of the final commit, 33 frames and 3 sheets on port 3531,
0 missing, 0 camera mismatches, 0 page errors, desktop Chrome on Metal at phone-shaped viewports: emulation, not iPhone validation).

### What was real and what was done

| Problem | Verdict | Change |
|---|---|---|
| Landing sky is dark slate (raised three times, art, technical, owner) | Real, and still only a CSS change fixes it. Landing sky mean luma 79 (desktop), 108 (phone), 70 (landscape), against 163, 186, 165 in play at the same camera | Not changed: the UI is fenced off this round. A ready patch and its measured result are in the flags below. |
| Sun halo is a dirty grey, the disc a flat sticker | Real: the old ramp went blue, grey (saturation .01 at luma 212), cream | The lift is now a wide warm white (`#f7f6ee`, rate 60, weight .85) that closes into cream (rate 420) and a two-tone disc (core `#fff3c4`, rim `#ffe39a`). The falloff constants live in `SUN_GLOW` with a TypeScript twin, `sunGlow()`. On screen the colour is neutral only at luma 225 (a white glare, 4.5 to 4.8 degrees out), luma falls monotonically outward, the sky 16 degrees out has saturation .36 to .38 |
| Clouds read as crumpled paper (creases, stained interiors, razor edges, specks) | Real: lighting delta x6 at a fine mip, roughness added anywhere, edge ramp .03 | Light comes from a broad slope read at mip 2.8 (gain 4, a thick-core term), roughness only where the mass already is, the edge ramp is .075 near the horizon and .05 high up, fine detail weight .18, shade `#bccbdc`. Same five taps. Speck share (components under 40 px2, sky rows only): `ground-up-desktop` 48 percent to 29 percent and 145 components to 55; hero desktop 42 to 31 percent |
| Cloud bank swallows the sun side (63 percent) | Real | The offset was picked again: see below. Toward-sun, same crude measure (it counts the white glow too): 63 to 52 percent portrait, 44 to 49 desktop, 42 to 45 landscape, with the sun in a clear gap |
| HUD telemetry on a white cloud in landscape | Real: contrast of white on the brightest 5 percent behind it 1.11:1 | Two soft clear patches in the weather (below). Brightest 5 percent behind the telemetry is now 1.70:1 (landscape) and 1.74:1 (portrait). The median is 1.7 to 1.8 because the sky itself is pale there: white text on a pale sky needs a UI scrim, which is fenced off |
| Skyline is pale, flat, intact foam core (3 reports) | Real | Tints cooler and darker (`#7f95a3`, `#7b97ab`, `#86a2b7` lit), faces lit on a smooth ramp (south, west, east: three tones), the tower fog is clearer with height (`pow(f, 1.6) * .8`, equal to the sea's at the waterline), floors read as bands where the windows fade, window panes darker and cooler. Towers in `high-horizon-desktop` row 420 went 186, 171, 200 to 162, 149, 184 against haze 219. 51 of 183 towers have a sheared roof (31 of them deeply, 10 to 20 m; round 1 stopped at 10 m), 6 lose their top floors (columns on a lowered roof) |
| Towers stack like blocks, necks dark, crowns lime lids | Real | The recessed core is shallow (90 percent of the body) and its colour is the shade face's, the upper block is narrower (88 percent), crowns are `#46623f` tufts on 42 parts across 16 towers |
| Towers pasted on the water, flat faces, khaki | Real (khaki: the old tan lit tint) | Wet concrete (darker, greener) up to 2.4 m, a foam line at the water, mist 70 percent at the foot and gone by 12 m, cool tints. The window grid already varies per tower (bay width and floor height come from the seed): kept |
| Distant skyline reads as toy blocks: common base line, fog shelf, white column behind the canal | Partly. The base is the water plane at y .1, so a varied foot elevation is invisible, and the haze column through the canal gap is a gradient, not an edge (worst step 8 luma levels per 12 px, `ground-horizon-phone-portrait` x 300 and 370) | Foot, wet band and foam above, floor bands on the far layers. No mirrored smear below the base (there is no reflection pass) |
| District-edge slabs read as flat camo walls | Mis-attributed. The dark marbled wall in `toward-sun`, `skyline-left` and `skyline-right` is the terrace's own 10 m parapet panel (raycast: x -8.9, 12 m away, the stone group, shaded side). The hills behind it are fine | A calm concrete group (index 5, one more draw call, same triangles): the same texture with its marbling mostly out, a soft normal map and a wet band, used by the four hills and the two parapet panels (cool grey, still not solid). The parapet is lighter and calmer; it is still a textured concrete wall 12 m away |

### Cloud offset and the telemetry patches

`CLOUD.gaps` are two clear patches in the weather: azimuth -9.5 degrees, elevation 15.5 (clear 6.5, fade 11) is where the portrait telemetry
sits at frame 0; azimuth 39.5, elevation 17.5 (clear 9, fade 13) is the landscape one. Inside, the cloud threshold rises by `gapLift` .3;
a dot product and a smoothstep each, no texture tap. The offset (`.95, .05`) comes from a CPU twin of the dome's density, `cloudAt()` in
`cloudData.ts` (the same twin the tests walk), over 1,600 offsets and three viewports: the sun clear at frame 0, the canal vista clear, the
telemetry patches clear, 23 to 31 percent cloud in the toward-sun view in the twin. Only 5 of 1,600 offsets met every limit once the patches
were in; without them none did. The patches are world fixed and drift away with the clouds in play, which is when a HUD zone no longer
matters as much. `tests/atmosphere.test.ts` walks the same rectangles on the baked data (under 3 percent cloud) and the sun and the vista.

### Measurements (production build, `fix1`)

- Renderer counters (spawn and 80 m): **20 draw calls, 584,726 triangles**, 19 geometries, 20 textures (round 1: 19, 584,518, 19, 20). The
  one new call is the calm concrete group. The skyline is 4,998 triangles (was 4,790).
- Landing first load: `node scripts/check-first-load.mjs` prints **635.6 KB** of 636 KB, unchanged. No dependency, no network asset, the
  lockfile untouched, `grep -rn atmospherePalette src/game src/ui` returns nothing, every module under 200 lines (`atmospherePalette.ts` 120,
  `cloudData.ts` 104, `skyShader.ts` 97).
- Drone-eye detector: 0 pixels in all 33 frames.
- Behaviour (top 140 rows of the 1440x900 hero view): default motion 68,017 px differ over 5 s (clouds drift, 28,639 of them in the sky rows
  alone); paused, resized and restored 0 px differ; reduced motion over 4 s, in the sky rows (0 to 58) 610 px differ, 5 of them by more than
  2 levels (sub-pixel camera jitter at cloud edges); the larger differences in the full strip are the animated foliage on the buildings.
- Tests: `pnpm test` runs 176 files and 2,184 tests, all green. New: the sun glow walked from the disc to 25 degrees (monotone luma, a brief
  white neutral zone, the sky still blue), the first-frame sky (telemetry patches, sun, vista, cloud overhead), the damage counts, the calm
  group. Browser specs on the scratch production build on port 3531: `recovery.spec.ts`, `flow-recovery.spec.ts`, `accessibility.spec.ts`
  and `composition.spec.ts` 26 of 26, `classic-blast.spec.ts` and `lab-switch.spec.ts` 21 of 21.

### Owner flags that remain

1. **The landing screen is still murk, and only the CSS fixes it.** This round again left `src/ui/Experience.module.css` alone. The patch
   is `scratchpad/sky/fix1/landing-vignette.diff` (checked with `git apply --check -p1`, not applied): landing top stop `.67` to `.30`, ending
   at 18 percent (was 25), the left rail `.40` to `.20`, the `.introVignette::after` ellipse `#10272fa6 / #10272f80` to `#10272f66 / #10272f40`
   fading out at 70 percent, the phone rule's top stop `#102a32aa` to `#102a3266`, and in play the top band `#102a3266` over 12 percent to
   `#102a3226` over 20. Measured on a scratch dev server (CSS only changed in the scratch copy): landing sky mean luma 79 to 135 (desktop),
   108 to 154 (phone), 70 to 123 (landscape), against 163, 186 and 165 in play. The headline, copy and button are as legible as before
   (`landing-head-*.png` and `landing-proposed-*.png` in `scratchpad/sky/fix1`). Needs Garo's yes. Without it the first screen reads as
   overcast dusk whatever the sky does.
2. The telemetry text itself needs a scrim to be readable over a pale sky (about 1.7:1 over clear sky at 15 degrees): a UI change.
3. The sun still sits behind the camera at the default heading (D2).
4. Real phone confirmation is still owed. The dome has the same five taps and gained two dot products; the skyline fragment shader gained
   about ten ALU ops and no texture; the calm concrete adds a draw call. Nothing was timed on a device.

## Deferred (not in this pass)

- A ridge or hill ring behind the skyline ("hillside"): 1 to 2 draw calls, under 1.5k triangles, inside the far plane.
- Canopy blobs on the edge slabs.
- Moving the sun (D2): `SUN_POSITION`, then the skyline's baked tints follow by themselves (they read `SUN_DIRECTION`); the capture
  script's SUN and `scripts/arm_cannon/render.py` need the same vector.
- The CSS vignette (see the flags).
- Sea reflection of the skyline (no mirror, no screen-space reflection).

## Honest limits

- Every frame here is headless desktop Chrome (ANGLE on Metal), at phone-shaped viewports for the phone sets. That is emulation, not
  iPhone validation. There is no Safari frame, no GPU timing, no thermal or shader-compile check on a phone, and OLED brightness changes
  how a pale sky reads.
- The iPhone safety rests on the design: five taps and no loops in the dome, a 256 texture, no `sin` hash, one dome call, and the dpr cap.
  The early-z gain of `renderOrder` and mobile precision are derived, not measured.
- The landing screen still sits under the CSS vignette (see below), so it is darker than the sky and the skyline themselves.
- S2 adds a few derivative-based ops to the skyline fragment shader (window grid, `fwidth` fades in the water). WebGL2 only, as the rest
  of the scene; nothing about their cost on a phone GPU was measured.

## Flags for Garo (decisions that are not this pass's to make)

1. The CSS vignette over the canvas (`src/ui/Experience.module.css:5-7`) darkens the landing sky and the top 12 percent in play. It is UI,
   so it was left alone. Proposed if you say yes: landing top stop `.67` to about `.35`, play top stop to an eased fade, and keep a dark
   scrim only behind the brand and the HUD text.
2. The sun stays behind the camera at the default heading. If you want the glow in the first view, move `SUN_POSITION` to about 30 to
   38 degrees elevation and 60 to 70 degrees off the view axis, then re-check the hero, cannon and FX.
3. The cooler hemisphere ground (`#647c7a`) is a scope-adjacent change. It is a one-line revert.
4. Real phone confirmation is still owed: open the playtest link on an iPhone in both orientations.
5. Scope-adjacent edits made in S2, each a small revert: the district-edge hills are lighter and lifted (`cityData.ts` `SLAB_LIFT`, the two
   hexes, `kit.ts` list), and the two terrace parapet panels are pale concrete instead of steel (`cityData.ts`). Both were near black
   against the new sky. The lifted moss is a fresh lime green; if you want it quieter, lower `SLAB_LIFT` toward 2.5 (the shaded face then
   sits right on luma 55).
6. "Hillside" is still not in the backdrop (no ridge). The skyline stands in open sea on all four sides; a ridge is the follow-up.
