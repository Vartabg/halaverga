# Plan: the angel has weight

- **Date**: 2026-11-11. **Branch**: `codex/hermon-war`. **Source baseline**: `f069b8d`. **Plan revision**: 3 (after the independent plan review and the independent code review; record in `2026-11-11-flight-weight-review.md`).
- **Status**: built as a playable proof, waiting on Garo's feel check.

## What Garo said

After playing the build with solid standing stones (2026-11-11): "the flight mechanics make no sense".

Asked which of four measured behaviours he meant, he ticked three:

1. **Stops dead, no weight.** Let go at full speed and the angel stops within 1.6 m, then hangs in the air.
2. **Turns have no feel.** It goes wherever the view points at full speed, with no wide arc and no speed lost.
3. **Fight throws me off.** A strike flies the angel through the demon by itself and the view follows the falling demon, so he loses track of where he is heading.

He did not tick the fourth (the phone's hold-to-fly button), so the control layout is out of scope.

## Who it is for and what should happen

The player presses the same controls. What changes is what the angel does back: every change in its velocity should have a cause the player can see (wings, gravity, air, a bank, a blow), and nothing should move the angel on its own beyond the dive the player asked for. A strike's dash is the one deliberate exception to "nothing snaps": it starts and ends abruptly, like its hit-stop.

## Measured before (`src/game/momentumFlight.ts` at the baseline, 60 Hz)

| Case | Before |
|---|---|
| Level speed, thrust held | 21.5 m/s (32.7 with surge) |
| Let go at 21.5 m/s | stopped in 0.3 s and 1.6 m (24 g) |
| Let go after a 3 s dive (81 m/s) | stopped in 0.4 s and 6 m (90 g) |
| 180 degree turn at 1.5 rad/s | no speed lost, at any speed |
| Travel follows the view at up to | 2.8 rad/s, or 100 m/s2 sideways (10 g) |
| After the last cut of a sword string | launched along the view at 34 to 90 m/s, while the view follows the falling demon |
| A dive that is cancelled or misses | hands flight back at the dive's own 55 to 130 m/s |

The same model did have energy while thrust was held (a dive gains speed, a climb spends it). It all vanished on release.

## History that constrains this

- 2026-09-26: steering is rate control (hold off-centre and the view keeps turning). Not changed here.
- 2026-10-19: Garo asked for momentum he can feel, and approved a sword strike that moves the angel.
- 2026-10-20 (recorded by another agent in `docs/plans/2026-10-20-hover-aim.md`): release-to-coast was replaced by release-to-hover, with time-based damping, because continuous flight prevented aiming at and selecting demons. So **coasting on after release is rejected**, and now **a dead stop is rejected** too. This plan keeps "release ends in a hover" and **supersedes the damping**: the stop takes about five times longer at cruise. Brake (B, the Brake button, the click that stops a cruise) is the quick stop. That trade is Garo's to judge.
- `docs/DECISIONS.md`: the camera never rolls. Kept.

## Decisions

### D1. Release and Brake are a flare, not a freeze (`momentumFlight.ts`)

With no movement input, or with Brake, the angel decelerates along its travel by `base + air x speed^2` (spread wings: a floor plus air drag), in the existing fixed sub-steps.

| For level travel | base (m/s2) | air (1/m) | from 21.5 m/s | from 32.7 m/s | from 81 m/s |
|---|---|---|---|---|---|
| Release | 12 | 0.015 | 1.5 s, 15 m | 2.0 s, 28 m | 2.9 s, 74 m |
| Brake | 26 | 0.020 | 0.75 s, 8 m | 1.0 s, 15 m | 1.6 s, 45 m |

- It never accelerates, and it reaches exactly zero (no creeping).
- While it flares, its line levels out: the climb angle turns toward level under the pitch limit of D2, at no cost. Brake levels the same way. The levelling fades in with how level the travel already is: none within about 9 degrees of straight up or down (it stops on its line), all of it once half the speed is level. There is no switch between the two. A slow, steep release can stop before it has levelled.
- **A release while climbing or falling stops harder**, in proportion to how steep it is, up to the Brake numbers straight up or down. Letting go of Descend at 29 m/s stops in about 12 m (the first build's 24 m read as a fall that would not end).
- **Rise against a fall** (or Descend against a climb) that is close to straight up or down stops it on its line, wings and flare together, then goes the other way. Turned like any other direction it looped out sideways at up to 46 m/s along a world axis. Found by the code review.
- No gravity is added while idle (kept from 2026-10-20: nothing falls unasked), and a hover holds its height.
- Take-off keeps its height: with nothing held the forced lift is 0.24 s instead of 0.4 s, because its top now eases over 1.5 m instead of stopping dead (2.9 m in all, as before). With movement held it is unchanged.
- These numbers are a first tuning for Garo to judge, not a claim about bird flight.

### D2. A turn round has an arc and a cost; a pull-up does not (`momentumFlight.ts`, `steer`)

The travel's direction is turned toward the look direction in two parts, each with its own limit.

- **Heading (turning round)**: at most `turnG` = 36 m/s2 sideways (was 100) and 2.8 rad/s. So the tightest turn is 1.67 rad/s at 21.5 m/s, 1.10 at 32.7, 0.60 at 60 and 0.44 at 81 (a 180 m radius): fast flight draws a wide arc, slow flight turns on the spot as before.
- **Turning round costs speed**: `turnCost` = 0.3 m/s2 lost per m/s2 of sideways acceleration used. A held turn at the one-thumb rate (1.5 rad/s) settles near 16 m/s from 21.5, and near 22 from 32.7. Fly straight and the speed comes back.
- **Climb angle (pulling up, pushing over)**: the baseline limit, `pullG` = 100 m/s2 and 2.8 rad/s, and free. Gravity already charges for a climb and pays for a dive, so the dive-then-climb game of 2026-10-20 is unchanged.
- Sidestepping changes the heading, so it is a turn. Rise and Descend change the climb angle, so they are free.
- Going straight up or down the travel has no heading and takes the demand's; with neither, the view's stands in.
- The view still turns at the same rates from the same inputs. The body already rolls by the lateral acceleration of its real travel (`src/world/suitRoll.ts`, up to 46 degrees). The camera still never rolls.

### D3. A strike ends where it hit (`strike.ts`, `swordBlow.ts`, `Player.tsx`, `runtime.ts`, `CameraRig.tsx`)

- **No launch after the last cut.** After the casting blow the angel hangs over the blow for the same beat and is released there at exactly zero velocity. `finishStrike` loses its exit speed and direction; the hold is flagged `strike.last` (the camera reads that where it read `then`). With movement held, flight resumes from there under ordinary thrust.
- **A warden's finishing blow always stops at the demon**, whether or not movement is held. The carry that remains (a warden's armour throwing the angel back) can never be faster than its own speed.
- **A dive that never connects** hands flight straight back instead of carrying on.
- **A dash is not the angel's own speed.** `strikeStep` (new, in `strike.ts`; Player calls it where it called `strikeVelocity`) reads, while a strike runs, what flight may keep: the speed the dive came in with, never under `STRIKE.keep` (22, the ordinary cruise), and 22 for a step-in. On the first step after the strike ended, or was replaced by a new one, the velocity is cut to that, before a new dive launches from it. A strike that begins and ends without a physics step changes nothing and takes nothing.
- **While the angel is being flown, the view stays on its heading.** Player publishes the signal it already computes (`runtime.flown`: movement is asked for this step). The view follows a cast-down demon, and lingers where it struck, only from a hover. Asking for movement, or looking elsewhere, drops that cast's watch for good, and the camera planner is told on that frame (`release`) so its held heading cannot turn the pilot toward the demon. The decision is a pure function (`combatCamera.stepWatch`) with its own tests; `CameraRig` only calls it.
- Unchanged: the dive itself, the hit-stop, staying on the demon between cuts, the warden's rite, and the view turning to the chosen demon during the dive.

### Not in this change

- The phone's hold-to-fly button and any control layout.
- Camera roll, coasting on release, hover sink or bob, the angel colliding with megalith shafts.

## Data flow

`Player.tsx` (one physics step): `pilotVelocity` (flight) then `strikeStep` (takes the last dash back, then overrides while a strike runs) then the existing limiter, collision and bounds. No new state crosses React; `CameraRig` stays the only camera writer.

## Failure behaviour

- Zero or non-finite `dt` returns the velocity unchanged; zero speed takes the demand's direction; the flare and the turn limit are the same at 30, 60 and 120 Hz (fixed sub-steps; a path summed once a frame differs by the frame's length, about 1 percent).
- A longer stop meets terrain more often: the limiter and collision slide downstream are unchanged and still own that. `tests/limit-momentum.test.ts` flies this model at them: never inside rock, never at a standstill, at rest on release.
- **Inherited, not fixed here**: the limit tests had never flown the momentum flight of 2026-10-20. Pressed into the west hill at an angle, or into the slot between a hill and the perimeter, it is not turned to open air as the older flight was: it slides along the rock at 8 to 12 m/s (a steep climb is slow in this flight). Yesterday's model does the same to within 2 m/s.
- The limiter can keep its own closing speed for a step or two near a face, so a dash cancelled right at a wall is not cut to exactly its cap there.
- `strikeStep` is not called on foot or during a landing. A cap left waiting is applied on the next flying step, where the angel is slower than it, so it does nothing.

## Tests

Rewritten because they encoded the rejected behaviour (each to the new contract, none loosened to pass):

| Test | Was | Now |
|---|---|---|
| `momentum-flight.test.ts` release | under 0.25 m/s in half a second; 7.2 m at most | still flying at half a second; exactly at rest inside 3.5 s; 40 to 90 m from an 85 m/s dive; never speeds up |
| `momentum-flight.test.ts` turn | a quarter turn at 48 m/s done in 0.8 s, speed kept | still under way at 0.8 s, and it has cost speed |
| `pilot-flight.test.ts` | one Brake step from 30 leaves under 29 | leaves 28 to 29.4 (a flare, harder than a release) |
| `warden-encounter.test.ts` | a released 60 m/s dive at rest in 1 s | at rest inside 3 s, never speeding up |
| `strike.test.ts`, `combat-flow.test.ts` | a missed dive carries on (phase 2) | hands back (phase 0) |
| `strike.test.ts` | a finishing blow carries on with flight held | stops at the demon; the carry never exceeds its own speed |
| `sword-string.test.ts` (two) | the last cut leaves at 80 to 90 m/s; reads `strike.then` | released at rest; the arrival speed goes into the demon's throw |
| Browser: `momentum-flight`, `momentum-touch`, `thumb-flight`, `hover-aim` specs | at rest a fixed 650 to 1100 ms after release | wait for rest (and `momentum-flight` checks it is still flying a quarter second after release) |
| `tests/flight-support.ts` `flyTo` | brakes at the mark | brakes its stopping distance before the mark |

Added:

- `tests/flight-weight.test.ts`: the D1 table at three speeds and three frame rates, levelling with no cliff, a release straight down, Rise against a fall, the turn rate at five speeds, a free pull-up, speed in a held turn and its return, the dash cap for a cancel, a miss, a replaced dive and a step-in, the watch traces (a whole cast from a hover, a key mid-cast, a tapped key, a look away, the next cast, a demon behind) and the planner's release.
- `tests/limit-momentum.test.ts` and a `momentum` switch on the limit harness: this flight through every wall, the floor, the sky and five rock faces.
- `tests/angel-strike-integration.spec.ts` (browser): after a whole string with nothing held, the angel is at rest within 6 m.
- Stop timeouts raised from 1.5 s to 5 s in `classic-blast`, `recovery` and `play-guard` specs (outside the gate).

Still text-pinned, not behaviour-tested: the two lines in `Player.tsx` that publish `runtime.flown` and call `strikeStep`, and the rig's call of `stepWatch` (a React component in a physics world).

At risk and not run: `tests/adaptive-thumbs.spec.ts` (an older one-thumb contract that already failed on this branch's parent).

## Acceptance checks

1. Unit: the tables in D1 and D2 hold within 12 percent; idle speed never rises; a dash never hands back more than its cap.
2. Browser (desktop Chrome, production build): hold W without surge, release, and the angel carries 12 to 20 m and hovers; a held arrow-key turn shows a lower speed than level flight; after a full sword string with nothing held the angel is at rest; with W held it leaves at ordinary thrust; the view (the camera planner's own heading, not the settled pose) follows the falling demon from a hover and returns.
3. `pnpm verify`; the browser gate: `accessibility`, `flight`, `wing-flight`, `banish`, `angel-strike-integration`, `combat-flow`, `celestial-battle`, `gorge-encounter`, `warden-panel`, `hover-aim`, `momentum-flight`, `momentum-touch` specs; no module over 200 lines.
4. Recorded honestly: not checked on a physical iPhone.

## Accepted, rejected, undecided

- **Rejected by Garo**: the dead stop with no weight, turns with no feel, strikes that throw him off (2026-11-11). Coasting on after release (2026-10-20, as recorded by another agent).
- **Accepted by Garo**: rate-control steering (2026-09-26); a strike that moves the angel to the demon (2026-10-19).
- **Undecided**: every number here; whether the longer stop gets in the way of picking demons; whether release should carry further; whether hover should sink or bob; whether the camera should lean in a turn; the phone Fly button.
