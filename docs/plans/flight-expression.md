# First trackpad comparison and hero poses

Build the first increment of the approved [gesture plan](2026-09-11-trackpad-maneuvers.md): bounded scroll input with momentum rejection, free/captured cruise comparison, and articulated hero poses. Preserve phone controls and physical movement/camera ownership.

- [x] Normalize scroll strokes, reject momentum, clear old tails, expose direction/speed preferences and local recording.
- [x] Add captured trackpad cruise with click-to-brake/unlock, failure fallback and cancellation; compare recent/sustained edge input in free mode.
- [x] Articulate elbows/knees, add hover/power/bank/climb/dive/braking/landing poses and a classic-pose comparison.
- [x] Test input cancellation, capture races, gesture replay, joint bounds, frame independence, actual asset and browser/accessibility regressions.
- [x] Inspect actual poses, record a desktop performance sample and document physical-test gaps.

Delivery follows verification through lifecycle commit/push and publication of the existing Vercel playtest. The lifecycle result and immutable deployment identify the delivered version; physical validation remains open.

Files: input/runtime/store and settings/guide; `scripts/build-suit.py`, suit geometry/rig/pose components; focused tests and review evidence. Keep modules below 200 lines. Later precision translation, loops, or gesture recognition remain outside this increment.
