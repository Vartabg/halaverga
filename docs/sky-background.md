# Sky and background (task `sky-background`)

Owner note (Garo, 2026-10-01): the sky and the background are ruining the demo. Fix them.

Scope: the sky dome, clouds, sun, horizon band, distant skyline and fog. Not flight, controls or UI.
Fiction (AGENTS.md): a fictional modern hillside city destroyed in 2033, visited in 2113. The target is a clear, hopeful, sunlit
afternoon over a flooded, overgrown, damaged city, not an apocalypse and not a flat grey haze.

Status: **S1 (sky dome, sun, clouds, sky colours and the coherence of water reflection, fog colour, hemisphere and environment) and S2
(horizon band, sea haze, distant skyline, fog range) are built.** Nothing is pushed. The old skyline boxes are gone: the background is
now a sky, one haze, and a seeded three-layer skyline standing in the sea.

## One source of truth: `src/world/atmospherePalette.ts`

Plain data and pure maths, no `three`, no DOM. Import it only from `src/world` modules reached through `Scene.tsx` (it must stay in the
lazy world chunk; `grep -rn atmospherePalette src/game src/ui` returns nothing). The file is **not** called `atmosphere.ts` because
`Atmosphere.tsx` sits beside it and a case-insensitive filesystem (macOS) resolves `./Atmosphere` to the `.ts` file first
(`tsc` reports TS1149). S2 extended this file.

Exports: `SUN_POSITION`, `SUN_DIRECTION`, `SUN_COLOR`, `SUN_DISC`, `SUN_UV`, `SUN_XZ`, `HAZE`, `SKY`, `SKY_STOPS_H`, `CLOUD`, `FOG`,
`SKYLINE` (S2: seed, crown green, layer gaps, layer tints), `HEMISPHERE`, `hexToLinear`, `glslVec3`, `skyBase` (the TypeScript twin of
the GLSL `skyBase`), `directionFromUv`, `driftClouds`.
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
| Sun light / sun disc | `#ffe6b2` / `#ffeeaa` | The light is unchanged. The disc is a fixed on-screen gold, soft edged. |
| Cloud lit / shade | `#f4f4ee` / `#aebbc8` | |
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
- Cloud shader: a flat layer projected as `dir.xz / (h + .3)`, faded out before the horizon (no vertical curtain streaks; checked with a
  strong contrast stretch of the rows 3 to 10 degrees above the horizon). Five taps and no loops: shape, a blurred read and a blurred
  read shifted toward the sun for the lighting (lit rims toward the sun, cool shaded bases), the weather map, and an edge-roughness read.
  The edge ramp follows `fwidth`, so edges stay crisp when a cloud is magnified at the zenith.
- Drift: `driftClouds()` advances a uniform at `(.003, .001)` uv per second inside the dome's `useFrame`, only while playing and not under
  reduced motion; a long frame counts as .04 s; it never calls `invalidate()` (play already renders every frame).
  Measured on the production build (top 140 rows of the 1440x900 hero view, sky-only strips, 126,000 px): 5 s of play 62,747 px differ;
  reduced motion over 4 s 430 px differ, all by at most 2 levels (sub-pixel camera jitter at cloud edges, no translation); paused, then
  resized and restored, 0 px differ.
- `CLOUD.offset = (.18, .62)` was picked by a CPU twin of the cloud mask (a search over 2,500 offsets) so that the sun neighbourhood stays
  clear for the first 40 s of drift, the first view has a bank in the upper third with nothing over the middle of the skyline, and the
  look-up and level views keep 30 to 50 percent coverage. If the texture, scale, coverage or wind change, pick the offset again.
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
- Tests: `tests/atmosphere.test.ts` (16 tests): one sun, haze exact at and below eye level, ramp stops, bluer with height, warm lift
  toward the sun only, fog colour equals haze, GLSL strings built from the palette, display-referred dome pinned to the far plane,
  disc colour, cloud data deterministic, tileable and 32 to 48 percent coverage, drift holds still when paused or reduced.
  `pnpm test` runs 175 files and 2,158 tests, all green (one earlier full run under CPU load showed a single timing failure that did
  not repeat in two re-runs). Browser specs run on a scratch production build on port 3511:
  `recovery.spec.ts` and `flow-recovery.spec.ts` 16 of 16, `lab-switch.spec.ts`, `accessibility.spec.ts` and `classic-blast.spec.ts` pass
  (one `classic-blast` second-finger tap failed once under CPU contention from another build and passed on two re-runs of the file).

## What S2 changed

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
