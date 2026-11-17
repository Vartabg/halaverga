# Mount Hermon at first light

Revision 1, based on playtest `b586a10`. Garo rejected the sky, colors and regional likeness after viewing the Hermon playtest. The earlier painted-backdrop choice has been superseded by that feedback. Dawn, snow, clear summit air, low mist, the Watchers' descent and the playable Hermon routes are established direction. Late winter with a mostly clear sky is an art choice for this build.

## Appearance

At the Threshold, the player should see pale, weathered limestone and patchy snow framing cool open sky. Climb above the gorge and turn east to see the risen sun and the relief of the real region. Westward the rocks descend into low blue-gray haze. The reserve's landscape account and field surveys document sparse cover and exposed limestone at upper elevations. The photographic references guide color and form.

- [Mount Hermon Nature Reserve landscape account and photo survey](https://mounthermonreserve.org/archives/769)
- [Mount Hermon Nature Reserve field photograph and botanical survey](https://mounthermonreserve.org/archives/673)
- [Western Hermon altitude and geology field study](https://www.mdpi.com/2076-3417/16/16/8220)

Regrading the painted photograph would leave a foreign mountain fixed in the sky. A full geographic rebuild would move the routes, terraces and collision volumes the playtest uses. Use one clear-sky model, natural stone and snow shading, and the region's measured terrain outside the flight boundary. The game is set on an authored summit and gorge inside that relief.

## Design

- One late-winter sunrise direction in world coordinates, close to 108° azimuth and 5.5° elevation. Use it for the solar disc, pale gold glow, directional light, reflections and water. Bring cool blue into the zenith and a much shallower warm band to the east. Keep the upper sky mostly open with fading stars and sparse cirrus. Replace the painted JPG and its loader with the camera-relative atmospheric dome already supported by the scene. The sky draws as background and the same gradient lights the existing PMREM. Tone mapping and display conversion run once in their respective materials.
- Replace the existing visual-only perimeter ring with sampled regional relief joined to the same five-metre boundary vertices. An offline bake samples two public Mapzen Skadi tiles on the outward row grid. It writes compact signed-elevation data with tile and datum provenance. The first rows blend from the playtest's rim to the real profile. Elevation and north/east orientation remain coherent throughout the field. One indexed mesh of about 23,600 triangles covers the distant terrain. Increase sampling around the summit ridge and widen the spacing with distance. Render it and the playable chunks with matching shading and height-dependent haze. Set the camera’s far plane beyond the complete mesh. The ring has no physics registration.
- Reuse the existing limestone and snow maps. Use smooth shading on the broad slopes, partial flat normals on steep rock and the arch, fine rock texture and irregular snow patches. Use a neutral limestone color with a little ochre and gray. Place bloom-free, cool fill in the shadows and pale gold on faces toward the low sun. Keep the cedars low on the benches and break their silhouettes into uneven boughs. Scatter low scree and cushion plants across exposed slopes. The water plane fits the authored play area. Clear distance haze and a denser low layer connect the landforms from high and low viewpoints.
- Keep the playable meshes' positions, indices, obstacles and Rapier queries. Missing terrain textures retain the natural base colors. Runtime uses the checked-in elevation samples with no remote elevation request. Keep original references and two CC0 ground maps documented, and credit the source of the elevation data in the Field guide.

## Verification

1. Capture the prior sky and then the first visual proof at the same arrival camera. Check the new scene north across the gorge, east toward the sun, and above the ridge in desktop, portrait and landscape views. Inspect seams and horizon from altitude.
2. Test shared solar direction, cool/warm sky separation, stronger low haze, relief joins, finite indexed geometry within the far plane, texture fallback and collision geometry identity. Run the first-load budget check and the production build.
3. Exercise the existing flight controls and fights, the High Sanctuary route, error/context-loss recovery and accessibility in Chrome. Compare representative draw counts and triangle counts, with device and viewport identified. A physical iPhone is a separate verification.
