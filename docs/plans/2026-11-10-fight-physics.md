# Design note: physics in the fight, the rush of flight, the sword

- **Date**: 2026-11-10. **Branch**: `codex/hermon-war`. **Status**: playable proof, waiting on Garo's feel check.

## What Garo said

After playing the three-cut sword string (2026-11-10):

> ok looks better, we need to add the physics to the fight scenes and some level of realism to give the effect of flying in space that thrill and rush, right now it just has no game engine mechanics and any sense of realism as to what the flight+attack+look of the sword and its battles look like

Read as three asks: real physics in the fight, a sense of speed in flight, and a sword whose look and motion are believable. "Flying in space" means flying through the air of the approved setting (Mount Hermon at dawn), not outer space: Garo confirmed it when asked ("Air on Hermon", 2026-11-10).

## Who it is for and what should happen

The player presses the same controls as before. What changes is what the world does back: a struck demon should move the way a struck body moves, fast flight should look and feel fast, and the sword should look like a sword being swung.

## What was there

- A hit demon was scripted: a decaying drift between cuts, and a fixed half-second lowering to the ground on the last cut. Nothing collided with anything.
- Speed had one cue: the view widened by up to 10 degrees.
- The sword was a box with a second, larger box around it for the flame. A cut was drawn as a flat crescent placed on the demon.

## What the proof does

**Physics (`src/game/thrown.ts`).** A demon the sword strikes is a projectile.

- Each cut gives it a velocity: knocked along the blow, launched upward, or driven forward and down. Gravity (the world's own 22 m/s2), air drag and the mountain do the rest.
- It collides with the terrain through the same height sampler the mountain is built from: it bounces off slopes with loss, stops against cliff faces, and strikes the gorge water. A hard strike spends most of itself in the ground.
- Momentum carries: the faster the angel arrived, the harder every cut of that string throws (0.75 to 1.35 times).
- Between cuts a wounded demon is under a third of gravity, so it hangs for the next cut (the usual juggle rule in action games).
- A thrown demon shoves any demon in its path, once per throw, and loses part of its speed.
- The last cut no longer lowers the demon: it is thrown the way the player is looking, strikes where the physics puts it, lies there 0.38 s and is gone. The view follows it most of the way down without turning the pilot, and comes back.
- Each impact draws a ring on the surface it struck (flat on ground, upright on a cliff), sized by its speed, with a thud and a shake by speed and distance.
- Wardens keep their rite (bound, then lowered).

**Rush (`src/world/FlightRush.tsx`, `rushData.ts`, `cameraFx.ts`).**

- Air streaks past along the line of flight from 14 m/s, full at 62. They stand still in the air; the angel passes through them.
- Vapour trails off the wingtips at speed, sooner in a hard turn or pull-up.
- The view opens up to 6 degrees more above 100 m/s (dives and strikes), and shakes slightly from 45 m/s. Cruising field of view is unchanged.
- None of it under reduced motion.

**Sword (`src/world/swordBlade.ts`, `FlamingSword.tsx`, `ribbon.ts`).**

- A tapered, diamond-section longsword with guard, grip and pommel, 1.22 m of blade.
- Fire is a shader that climbs the blade and flares on a cut.
- The blade leaves a trail of its real path: its edge from guard to point, sampled every frame against the angel's own position, so a twirl or a flip draws the arc the blade actually made. A straight dive draws none.

## Independent code review (2026-11-10)

One reviewer in a fresh conversation, read-only, given the commit, this note and the project rules, with no planning history. It ran nothing. Each finding was checked against the code.

| # | Finding | Disposition |
|---|---|---|
| 1 | The landing clock started on any hard contact, so a demon thrown into a cliff face was killed in mid-air 0.38 s later; on the ground it died mid-bounce. | Fixed: only ground or water counts as landing, and a landed demon keeps 40 percent of its speed, so it lies there. Tested against the summit wall. |
| 2 | The view followed the impact point even after the angel had flown past it, so it could swing round to look backward. | Fixed: it follows only while the point is ahead of the pilot (`aheadOf`). Tested as a function; not measured in a browser at top speed. |
| 3 | A demon cast by the old rite keys reused a stale landing clock and was finished the instant it started. | Fixed and tested. |
| 4 | Trails took one sample per frame, so on a 120 Hz screen the wingtip vapour was cut at half its life. | Fixed: both trails sample on a fixed step and keep their head on the blade or wingtip between samples. |
| 5 | Friction was applied per contact step, not per second: frame-rate dependent, and a resting body crept. | Fixed: a real impact loses a fixed share, a resting contact rubs per second. Tested at 30 and 120 Hz. |
| 6 | Impact rings are not flash-gated; a throw through several demons plus the landing could give five bright onsets in a second. | Reduced: a shove between demons now draws a dim ring and no shake. Not measured with a flash analyser: a known limit, as with the sword arcs. |
| 7 | A body that started inside the ground with no sideways speed froze until the timeout. | Fixed and tested. |
| 8 | The blade was widest at the wrong end and its section was a flat bar, not a diamond. | Fixed and tested on the geometry. |
| 9 | Chains and the view read last frame's position for a falling demon. | Fixed in both places. |
| 10 | Per-frame array allocation in the suit; the hit shake stacked on the speed shake; the flame was dimmed twice. | Fixed; the speed shake's ceiling is lowered from 0.34 to 0.24. |
| 11 | The physics property test allowed 1.6 m under the surface; nothing covered rest, the wall kill, the timeout or slot reuse. | Tightened to zero; tests added for each except the timeout alone. |

## Accepted, rejected, undecided

- **Accepted by Garo**: the three-cut string as the direction (2026-11-09); "looks better" (2026-11-10); the setting stays the air over Hermon ("Air on Hermon", 2026-11-10).
- **Rejected by Garo**: fights with "no game engine mechanics" and no "sense of realism" in flight, attack and the sword's look.
- **Undecided**: everything in this note. Whether hits should throw demons this far; whether wardens should be physical too; how strong the streaks should be; whether the angel should take knock-back.

## Known limits

- Collisions are with the terrain and water only. Standing stones, the rock arch and the village are not collided with, and the height sampler is smooth where the drawn mountain is faceted, so a demon can rest a little above or below a facet.
- No ragdoll: a thrown demon tumbles as a rigid body with its existing hit and fall poses.
- No dust, splash or debris particles on impact yet; the ring, the existing burst, sound and shake carry it.
- One sword animation (unchanged from the last note).
- Draw calls: up to four more (streaks, two vapour trails, sword trail), each only while visible.
- Not checked on a physical iPhone. Checked: 2,594 unit tests, and 31 browser tests (accessibility, flight, fight) on desktop and emulated phone sizes.
