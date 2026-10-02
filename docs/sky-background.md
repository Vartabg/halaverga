# Sky and background (task `sky-background`)

Owner note (Garo, 2026-10-01): the sky and the background are ruining the demo. Fix them.

Scope: the sky dome, clouds, sun, horizon band, distant skyline and fog. Not flight, controls or UI.
Fiction (AGENTS.md): a fictional modern hillside city destroyed in 2033, visited in 2113. The target is a clear, hopeful, sunlit
afternoon over a flooded, overgrown, damaged city, not an apocalypse and not a flat grey haze.

Status: **S1 (sky dome, sun, clouds, sky colours and the coherence of water reflection, fog colour, hemisphere and environment) is
built.** S2 (horizon band, sea haze, distant skyline, fog range) is not. The old skyline boxes are still there, as pale ghosts: judge
S1 frames by the sky only.

## One source of truth: `src/world/atmospherePalette.ts`

Plain data and pure maths, no `three`, no DOM. Import it only from `src/world` modules reached through `Scene.tsx` (it must stay in the
lazy world chunk; `grep -rn atmospherePalette src/game src/ui` returns nothing). The file is **not** called `atmosphere.ts` because
`Atmosphere.tsx` sits beside it and a case-insensitive filesystem (macOS) resolves `./Atmosphere` to the `.ts` file first
(`tsc` reports TS1149). S2 extends this file.

Exports: `SUN_POSITION`, `SUN_DIRECTION`, `SUN_COLOR`, `SUN_DISC`, `SUN_UV`, `SUN_XZ`, `HAZE`, `SKY`, `SKY_STOPS_H`, `CLOUD`, `FOG`,
`HEMISPHERE`, `hexToLinear`, `glslVec3`, `skyBase` (the TypeScript twin of the GLSL `skyBase`), `directionFromUv`, `driftClouds`.
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
| Fog | HAZE, near 95, far 330 | Only the colour changed in S1 (was `#a9c0b8`). S2 changes the numbers. |

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
  sun glint is tone mapped and added on top; the far end fades to HAZE between 110 and 360 m (S2 replaces this with scene fog). The
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

## Honest limits

- Every frame here is headless desktop Chrome (ANGLE on Metal), at phone-shaped viewports for the phone sets. That is emulation, not
  iPhone validation. There is no Safari frame, no GPU timing, no thermal or shader-compile check on a phone, and OLED brightness changes
  how a pale sky reads.
- The iPhone safety rests on the design: five taps and no loops in the dome, a 256 texture, no `sin` hash, one dome call, and the dpr cap.
  The early-z gain of `renderOrder` and mobile precision are derived, not measured.
- The landing screen still sits under the CSS vignette (see below), so it is darker than the sky itself.

## Flags for Garo (decisions that are not this pass's to make)

1. The CSS vignette over the canvas (`src/ui/Experience.module.css:5-7`) darkens the landing sky and the top 12 percent in play. It is UI,
   so it was left alone. Proposed if you say yes: landing top stop `.67` to about `.35`, play top stop to an eased fade, and keep a dark
   scrim only behind the brand and the HUD text.
2. The sun stays behind the camera at the default heading. If you want the glow in the first view, move `SUN_POSITION` to about 30 to
   38 degrees elevation and 60 to 70 degrees off the view axis, then re-check the hero, cannon and FX.
3. The cooler hemisphere ground (`#647c7a`) is a scope-adjacent change. It is a one-line revert.
4. Real phone confirmation is still owed: open the playtest link on an iPhone in both orientations.
