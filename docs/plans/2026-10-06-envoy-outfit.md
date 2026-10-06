# Envoy outfit · 2026-10-06

Garo: "utilize blender and any other complimentary tools to design the outfit for the character. right now its basic cookie cutter."
Shown three AI concept sketches (A Ash Diver, B Salvage Pilot, C Meridian Envoy), he picked **C · Meridian Envoy**: bone-white ceramic
plates over a dark graphite undersuit, glowing teal seams, an open-face helmet, a slim back flight module with two short fins, sealed
boots with a teal sole edge, a glove on the left hand; the right forearm keeps the arm cannon.

## How it is built

- Procedural, in Blender, inside the existing build (`scripts/athletic_character/build.py`): the outfit pieces are cut from the
  character's own approved surfaces (undersuit and anatomy) in the source pose, lifted off the body and thickened, so they fit by
  construction, then bound by the same `rig.bind` weights as the body. Nothing is sculpted by hand, so a rebuild is exact.
- Two new materials: `plate` (bone white with graphite parts by vertex colour) and `glow` (teal emissive). The undersuit, anatomy and
  eyes, the rig, the arm cannon and its contract stay as they are.
- Face stays open (a blank helmet made the hero's facing unreadable from the chase camera before).
