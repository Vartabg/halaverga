# Independent review of Mount Hermon at first light

Gemini 3.8 Flash High reviewed design revision 1 against playtest commit `b586a10` in a fresh Antigravity plan session. The run succeeded in 24 seconds. Its reading list was the plan, project instructions and bounded excerpts of the backdrop, scene, perimeter mesh, terrain material, terrain art, geometry and water modules.

- The original far plane clips regional relief. Size the far plane from the full mesh bounds including play-space camera travel. The first relief row uses the exact same five-metre boundary samples as the playable geometry. Test both the position join and the full extent. Terrain and water use the altitude-dependent haze, while nearby props use the scene's ordinary fog.
- Keep the natural terrain material's albedo, lighting and tone mapping in linear space until display conversion. The previous `pow` in the masonry material estimates display saturation to protect authored gold accents. It is outside the natural terrain's color path.
- Track each ground map independently and give stone and snow their own natural base color. A missing map leaves its material readable while the other map can still load.
- Browser checks will exercise WebGL and both phone viewport layouts. Physical iPhone Safari performance remains a device check under the project's existing verification rules.

## Playtest observations

The first flight proof exposed bands on the northern ridge. The final bake has 12,150 elevation samples and 23,582 indexed triangles. Closer ring spacing preserves the north face around the summit. Variable subdivisions hold the perimeter join to the playable mesh. Rebaking from the source tiles produced identical data.

Desktop Chrome with ANGLE Metal, at the same 1440 × 900 arrival view, submitted 37 draws and 249,396 triangles per sampled frame, including shadow passes. The previous build submitted 35 draws and 219,280 triangles. The 393 × 852 portrait and 852 × 393 landscape checks use Chrome touch emulation. Physical iPhone Safari remains unverified.

Chrome exercised the Threshold and High Sanctuary fights, wing flight, camera framing, both phone layouts, context loss, and axe AA checks. Thirty-one cases passed on the first attempt and the High Sanctuary fight passed on retry. The existing 1.4-second hover timing assertion in `tests/composition.spec.ts` also failed twice on the unmodified baseline, with lean `0.699` against the `0.15` threshold. Each terrain map was blocked individually in a separate browser run. The other map loaded and flight continued in both runs.

The capture and route comparison use the combined playtest at `92aa4e2d`. The scenery branch applies the environment changes directly to main at `edfb283` and credits the elevation data in that build's Field guide.
That branch passed the entry and Field guide accessibility checks and the encounter entry checks on desktop and both phone layouts. Both single-map failure checks also passed.
