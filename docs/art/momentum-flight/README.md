# Momentum flight — 2026-10-20

Base: `3fe9c67` (new CC0 angel, dive strike and compact wings).

## The change in feel

The standard flight branch no longer interpolates every velocity component
back to a fixed 13/34 m/s target. It now rotates the travel direction while
preserving speed, then integrates thrust, gravity along travel and drag.
Looking down banks height as speed; looking up spends it on a climb. At low
speed the powered wings keep the climb forgiving. R/Rise is a powered ascent.

Ordinary release coasts. B and the Brake button deliberately decelerate to
hover, and a fresh movement input starts flying again. Pointer cancellation,
rotation and the existing trackpad stop gesture still brake. Pause, checkpoint
restoration and graphics recovery do not resume a stale attack.

A sword launch starts with the incoming velocity and eases toward the target
over .14 seconds. Its carry has an exit-speed floor derived from the launch (up to 90 m/s),
then hands that velocity back to the momentum solver. A finishing blow hovers for binding if movement is
released, or carries through if the pilot keeps flying. A clean rebuke followed by a strike now knocks the demon down in one pass,
so the carry cannot leave a nearly defeated target behind the camera.
The brief hit freeze is configured at 45 ms (quantized by the physics step); reduced motion omits it and speed-driven camera widening.

The existing CameraRig remains the only camera writer. Speed FOV is unchanged
through 34 m/s and smoothly widens to an extra 10 degrees by 72 m/s. Physics,
collision sweeps, floor/ceiling slides and the character controller remain
in their existing order. Precision aim and Gesture Lab paths retain their
explicit movement contracts.

## Controlled before/after movement evidence

`tests/momentum-flight.test.ts` runs the same 30 m/s entry with the old and
new solvers. With the old target solver, level and dive both settle near
34 m/s. With momentum, the two-second dive reaches 58.47 m/s and loses 54.65 m
of height. The two-second pull-up then gains 36.55 m while slowing to 32.04 m/s.
These are arcade tuning measurements, not biological flight claims.

The browser case flies the actual Rapier world: powered climb, brake, dive,
pull-up, coast, then Brake to hover. It also records screenshots. Dedicated
touch cases cover release-to-glide and Brake in portrait and landscape.

## Validation limits

Desktop Chrome with phone-sized viewports is not physical iPhone Safari.
Passing tests proves the measured mechanics and recovery paths, not that the
result meets the user's subjective standard of fun. Physical touch latency,
Safari thermals, VoiceOver and sustained phone frame time remain unverified.

Research baseline: Research Vault's reviewed `04-product-3d-web/guidance/
CURRENT_GUIDANCE.md` and accepted claim CLM-3D-001 (one camera writer).
The camera-navigation recipe is provisional and was used only as a continuity
reference, not transplanted into the game.

## Check results

- Type check, production build, first-load and vote-build gates pass. Landing
  first load remains within 629 KB.
- Final full unit run: 203 files / 2,447 tests pass.
- Expanded browser run: 51 passed, one pre-existing skipped case, and two
  failures (free-cursor stopping and the old automatic-brake expectation).
  Both were addressed. A final 13-case run against the final build passes:
  actual sword contact and banishment, energy flight, desktop stop at both
  widths, portrait/landscape touch glide + brake, recovery and wing clearance.
- Browser energy sample: 104.90 m start altitude, 47.52 m/s on the dive,
  climbing segment from 60.11 to 47.04 m/s while gaining height.
- `dive.png`, `climb.png`, `portrait.png` and `landscape.png` are real browser
  captures. They show composition, not a proof of subjective motion quality.

Frame sample: `performance.json` records Chrome 155.0.8059.85 / ANGLE Metal
on Mac14,6, macOS 27.0.1 (power state not recorded). The 17 s desktop sample
has p50 16.7 ms / p95 17.8 ms and one frame over 50 ms. The 18 s landscape
viewport with 4x CPU throttling has p50 16.7 ms / p95 17.8 ms and five frames
over 50 ms. These are short desktop samples, not an iPhone benchmark or a
before/after frame-rate improvement claim.
