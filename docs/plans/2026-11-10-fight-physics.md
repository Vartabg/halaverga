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

**Dust, chips and spray where a thrown demon strikes (`src/world/fxSlam.ts`, added after Garo said "Yes, build it" to it, 2026-11-10).**

- On the ground: a cloud of pale stone dust that stays about two seconds, a fast burst of darker earth, a plume thrown up, a skirt of eight puffs thrown outward, eight chips of rock and a few embers.
- On a cliff face: a smaller cloud pushed off the rock, four puffs and four chips.
- In the gorge water: a column of spray, a low crown, eight jets thrown outward and three widening rings. No rock.
- Size follows how hard it struck (0.8 to 1.4, full at 30 m/s). A shove between two demons raises nothing and now has its own quiet sound.
- Sparks now fly where the blade connects, more with each cut of the string.
- Reduced motion: one still cloud (two on water), no chips, no rings.
- No new draw calls: it uses the existing five effect pools.

Two things found on screen while building it, both by looking at captured frames, not by tests:

1. A puff centred on the ground or the water had the half that carries its body cut away by the surface, so only a faint rim showed. Every puff now stands on the surface and climbs as it grows (`SLAM.sit`).
2. The shared soft disc is mostly faint edge, so clouds read as haze. The sprite shader now takes an alpha above 1 as a density that fills the middle in solid. Effects that already existed use 1 or less and draw as before.

Seen in a desktop browser: the splash in the gorge, and the ground recipe drawn at the same spot through a temporary switch that was removed before commit. Not seen: dust on the pale slopes, a cliff strike, or any of it on a phone.

Independent review of the dust and spray (2026-11-10): one reviewer in a fresh conversation, read-only, given the uncommitted diff and the project rules. It ran nothing. It found no crash, no bad number, no fault in the event reading and no change to any effect that existed before. Each finding was checked against the code.

| # | Finding | Disposition |
|---|---|---|
| 1 | Sword sparks were born at the demon's centre and thrown away from the camera, so most stayed inside or behind the body. | Fixed: they leave the side of the demon that faces the angel, toward the angel. Seen in a browser as small points at the cut. |
| 2 | Water beside a bank drew as ground (dust and rock on the water), because the bank tilts the surface normal; a level shore just above the water line drew a splash on dry land. | Fixed: the surface is told apart by the height of the mountain under the strike, not by the normal. Tested for both cases. |
| 3 | Rock chips used the demons' metal colours, and chips that fell through the ground made water rings under the mountain, using up the ring pool. | Fixed: chips take the stone and earth colours, live under a second, and ring only if they reach water in that time. Left as is: chips fly every way, so about half of a cliff's chips go into the rock; six are thrown there. |
| 4 | Tests matched source text only, covered a level surface only, and did not cover the shader change. | Added: the cliff case (clouds stand off the face, the skirt leaves it and spreads along it), the bank and shore cases, stone chips, and the shader's two spliced lines. The effect files are now in the no-`Math.random` and 200-line guards. The reading of events in `ImpactFx.tsx` is still pinned by text only. |
| 5 | Clouds draw in slot order with no depth sort, so a later far cloud can paint over a nearer earlier one. | Not fixed: a known limit, rare in a sword fight (strikes are near each other and seconds apart). |

**Standing stones and the rock arch are solid to a thrown demon (`src/game/obstacles.ts`, `src/world/archData.ts`; Garo said "Yes, build it", 2026-11-10).**

- A thrown demon now strikes the megaliths and the arch across the gorge: it stops at the face, is thrown back or turned aside, and dust and chips come off the rock. Dropped on top of one, it lands there.
- The collider is the drawn stone. The call that builds each megalith records it, and the mountain hands the list to the game when it mounts. The arch's mesh and its collider read one set of numbers.
- A stone is treated as a round shaft that narrows toward the top, fitted to 92 percent of the circle its corners stand on; the arch as a swept ellipse with rounded ends. The drawn rock is faceted and chipped, so a contact can be up to about a third of a metre off the visible face.
- For thrown demons only. The angel still flies through the shafts: colliders there change the flight-escape routes that the `limit-escape` tests record, so that is its own task.
- The gorge under the arch stays open.

Found by its own tests while building: a body resting on top of a shaft kept answering as "touching the shaft", so the crown stone standing on that shaft was never looked at and the body was left inside it. A ball already moved out to a surface no longer counts as inside it.

Independent review of the collisions (2026-11-10, one reviewer, fresh conversation, read-only; it replayed the code in memory). The terrain path is bit-identical to before with no stones. Its findings, each checked: (1) with other random seeds a body could end a step inside rock in the notch between two stones or under the arch at its bank: fixed, a wedged body stays where the step began, and the test now runs eight seeds (40 more passed once by hand); (2) the collider was fatter than the drawn stone: fitted to 92 percent; (3) the arch's west end threw a sliding body up a 1.5 m step: its ends are rounded; (4) a body that began inside a shaft was thrown out in one frame: it is now let out at its own speed; (5) square shoulders on a stone's head and level sides on a leaning stone: the rim is round and the side leans. The browser gate (31 tests: accessibility, flight, fight) passed before these review fixes and again after them, on the build of commit 06a6d94.

Seen in a desktop browser through a temporary throw switch (removed before commit), before the review fixes: a demon stopping at the west megalith with the ring and dust on the stone, and a demon striking the arch, then falling into the water below. Not seen: a landing on top of a stone, or any of it on a phone.

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
- **Asked for by Garo**: dust and splashes on impact, then solid standing stones and arch for thrown demons ("Yes, build it" to each, 2026-11-10). He has not judged either.
- **Undecided**: everything in this note. Whether hits should throw demons this far; whether wardens should be physical too; how strong the streaks should be; whether the angel should take knock-back.

## Known limits

- Thrown demons collide with the terrain, the water, the megaliths and the arch. Not with the village houses, the cedars or the small plinth and crown blocks. The angel does not collide with the megalith shafts. The height sampler is smooth where the drawn mountain is faceted, so a demon can rest a little above or below a facet.
- No ragdoll: a thrown demon tumbles as a rigid body with its existing hit and fall poses.
- The dust and spray are soft discs, not simulated: they do not light, cast shadow or flow round rocks. Clouds are not depth-sorted against each other.
- One sword animation (unchanged from the last note).
- Draw calls: up to four more (streaks, two vapour trails, sword trail), each only while visible.
- Not checked on a physical iPhone. Checked: 2,613 unit tests, and the browser gate set (accessibility, flight, fight) on desktop and emulated phone sizes.
