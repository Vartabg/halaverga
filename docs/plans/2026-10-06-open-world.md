# Open world · 2026-10-06

Garo, before launch: "I want to ship this game but before doing that the open world environment needs to be built out properly." Shown
that the whole flyable box fits in one frame at the sky limit and the city around it is a backdrop behind an invisible wall, he chose
**open it up**: the backdrop city becomes a real one to fly through. Blender is allowed where it helps.

## New setting (Garo, 2026-10-06)

His words, in order:

- "it looks too normal, this has to look post apocalyptic yet we have a blue skies and blue waters"
- "yes its 80 years later but the aftermath will last centuries bc of how devastating it was"
- "yes exactly the environment doesnt capture the look, feel and mood of the devastation of this event, which is why it is apocalyptic"
- "the building still look like they're inhabitable and structure looks intact for all, how is it post apocalyptic if you still have
  buildings standing? this is why we need to have a different setting, one where there are ruins instead and a since there was no
  sunlight or water that was potable"

So the city is **ruins**, not damaged buildings: stumps, bare steel skeletons, fallen sections and rubble; nothing looks habitable.
There is **no sunlight**: a permanent ash overcast, no sun disc, flat dim light. The **water is poison**: dark, oily, chemical, with
slicks and scum. Plants are dead. Same timeline (catastrophe 2033, visit 2113).

## Steps (one preview link each)

1. **Ruins and aftermath light** on today's map: ash sky and light, poisoned water, falling ash, the skyline rebuilt as ruins, the
   near city cut down to ruins with matching colliders, dead plants.
2. **Open the map**: the ruin field becomes flyable (colliders, a bigger box, limits and drones moved with it) inside a new far ring.

## Step 2 as built

- The flyable box is now x -420..420, z -430..300, ceiling 150 (about five times the district box). The district, the boulevard
  and the arrival terrace are unchanged; the ridges east and west now look out over the drowned city instead of a wall.
- `src/world/fieldData.ts` lays out 112 ruins on a 52 m grid of blocks with 20 m canals (flight lanes), keeping the district, the
  north canal avenue (the start view) and a 45 m strip inside the box edges clear. Ruins come from `ruinShapes.ts` in exact mode (no
  slanted tops), so every collider matches its box. `RuinField.tsx` draws them in four quadrant meshes (lit, the city's concrete
  texture, empty burned windows) and creates the 877 colliders straight in Rapier; bare steel is in `FRAME_GROUPS` (the camera boom
  looks through it). The far ruin ring moved out with the box.
- Tests: the flight fuzz and stress approaches now sample the whole box; recorded limit pins against the old box faces move with
  their face; brake tolerance .1 m/s2 for 32-bit position noise at 420 m; one recorded pin in the tightest pocket of the district
  (#105) has a documented 0.6 s allowance; the edge browser test surges the longer distance.
