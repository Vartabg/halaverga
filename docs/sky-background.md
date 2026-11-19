# Mount Hermon sky and background

Mount Hermon is set at dawn with broken snow on exposed limestone, clear summit air and thicker mist in the low gorge. The late-winter sun sits low in the east-southeast. See the [visual brief](plans/2026-11-17-hermon-natural-dawn.md) and [data and art provenance](art/hermon-sky/PROVENANCE.md).

- `src/world/atmospherePalette.ts` sets the sun direction, sky colors, fog and exposure. `skyShader.ts` shares the display-linear sky and haze with the dome, terrain and water. The sun direction also drives the lighting and environment map. The dome draws at the camera's far depth.
- `src/world/edgeRingData.ts` joins a visual mesh of sampled regional elevations to the playable terrain. Its first row uses the same interpolated border heights as the outer meshes. The isolated ring has no flight collisions.
- `src/world/naturalTerrain.ts` shades frost and limestone across the whole landscape. `TerrainLayer.tsx` loads the two shared maps independently. Height and slope determine where the snow collects.
- `src/world/Atmosphere.tsx` keeps the water surface local to the gorge. It uses the same sun and horizon colors as the sky. Mist depends on the distance and height along the view.
