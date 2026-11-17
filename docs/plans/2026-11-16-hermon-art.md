# Hermon background redone with art

Date: 2026-11-16. Branch `codex/hermon-art`, based on `codex/hermon-counters` at ca905a4.

## What Garo said and chose

After playing the counters preview: "the background looks so ass, needs to be redone using arts". Offered three ways, he chose
"Both, mixed": a painted sky and distant range, with real rock and snow textures on the near ground. The approved setting is
unchanged (AGENTS.md): Mount Hermon at dawn in the days of Jared; first light on snow, stars still fading overhead, dawn mist over
the plain below, clear summit air.

## Today (all procedural, no art files)

Sky: `src/world/Sky.tsx` + `skyShader.ts` (gradient, sun glow, hashed stars, noise clouds from a code-made 256² texture, which in
captured frames read as a blotchy camouflage pattern). Distant range: `Skyline.tsx` (vertex-coloured geometry). Massif: toon
material with a 4-texel ramp (`paintInk.ts`) on vertex colours, flat low-poly faces. Fog `Scene.tsx:93` (50 to 580 m), colours in
`atmospherePalette.ts`. Environment light: `EnvironmentLight.tsx`, a code-made equirect through PMREM.

## Decisions

A1. Painted sky and distant range from one 360° backdrop. Source: one CC0 HDRI from Poly Haven of mountains at sunrise or first
light, clear or lightly clouded, ideally with haze in the low ground. It is painted offline with Blender 4.0.2's compositor
(Kuwahara filter, anisotropic if available, plus a grade to the dawn palette) and saved as an equirect JPEG, 4096x2048, under
`public/textures/sky/`. "Painted" here means a painterly filter over a real photograph, not a hand painting; say so in the report.
Only the processed JPEG is committed, with a provenance note (`docs/art/hermon-sky/PROVENANCE.md`: asset name, page, licence,
download date, processing steps). The raw HDRI stays out of the repo.

A2. The backdrop replaces the sky shader's gradient, sun disc and noise clouds as `scene.background` (equirect), loaded in the scene
(after Begin), never on the landing page. The procedural `Skyline` range is removed where the backdrop's own mountains take its
place; keep whatever geometry the flight limits or collisions read. The backdrop is rotated so its sun sits at `SUN_POSITION`'s
azimuth, so the light on the snow and the painted sun agree. A sparse star layer may stay near the zenith if the backdrop's zenith is
dark enough to show it (setting: stars still fading).

A3. Fog and environment light follow the backdrop: fog colour set from the backdrop's average horizon colour on the sun-facing and
away sides (so near terrain fades into the painted haze, not into a different colour); the environment map may be the same image
through PMREM, replacing the code-made one, if it reads better.

A4. Real rock and snow on the near ground. Two CC0 Poly Haven texture sets at 1k (diffuse + normal; roughness only if it helps):
one snow, one rock that suits limestone (Hermon is limestone). Applied to the massif with triplanar mapping (no UV work), blended by
slope (rock on steep faces, snow on flat ground) and height, keeping the existing vertex colour as a broad tint so the authored
light and zones survive. The toon ramp goes or is softened so the textures read. Same for the standing stones and terraces only if
it is a one-line material swap; otherwise leave them.

A5. Downloads: Poly Haven files only, by their public API (`api.polyhaven.com`), CC0 confirmed on each asset's page. Record each
file's name, size and URL in the provenance note. Total under about 40 MB downloaded; under about 4 MB committed.

A6. Budget and phones. Nothing new on the landing page (`scripts/check-first-load.mjs`, 629 KB). The backdrop is one 4096x2048 JPEG;
textures 1k. If a phone-sized check (390x844 Chrome emulation) shows a frame-rate drop or a load stall, ship a 2048x1024 backdrop.
Every Canvas keeps its error boundary and context-loss handling.

A7. Out of scope: the fight, the angel, the demons, the flight model, any merge to main, any production deploy.

## What can go wrong

- The backdrop's mountains disagree with the massif's shape or scale (a second Hermon on the horizon). Pick an HDRI whose horizon is
  a distant range seen from high up, and check frames looking every way.
- Seams: the equirect's left/right edge and the poles. Check frames looking north, south and straight up.
- Text-pinned tests read `Scene.tsx`, `Sky.tsx`, palette lines and mounts (`hermon-war-mounts.test.ts`, palette tests, sky tests).
  Update them to the new mounts; a test that guards the setting (no retired city/ash wording or colours) must keep passing.
- Fog far 580 m with a backdrop at infinity: the far terrain edge can show a hard line against the sky. Check the horizon line.

## Acceptance checks

1. `pnpm verify` passes.
2. Captured frames at 1280x800 and 390x844 (portrait and landscape): arrival view, looking toward the sun, away from it, up, and a
   fight with demons against the sky. Before and after side by side.
3. Browser specs: accessibility, celestial-battle, simple-hints, and any sky or palette spec.
4. Not checked: a physical iPhone.
