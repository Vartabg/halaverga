# Design note: the sword string

- **Date**: 2026-11-09. **Branch**: `codex/hermon-war`. **Status**: playable; direction accepted by Garo; code reviewed independently (below). Feel on a real iPhone not yet reported.

## What Garo said

After playing the merged Hermon fight (2026-11-09):

- "ok its better but the sword strikes need improvement and sequencing that rivals the videogames with similar weapons"
- "the battle sequences arent videogame like"

Earlier, still standing (2026-10-19): the benchmark is feeling the mechanics and the momentum; a strike may move the angel; get the feel right before the art.

## Who it is for and what should happen

The player, on a phone or a desktop, should be able to press a short rhythm on one demon and see a sequence of different sword blows land with rising weight, ending in a finishing blow, and then be back in flight at speed. The action-to-result relationship: each press is one cut, each cut looks and feels different from the last, the demon visibly reacts to each, and the third ends it.

## What was there

One move. A press dived the angel at a demon, one cut landed, and the demon was bound and cast down automatically. A "chain" was the same dive again at the next demon. One slash animation, one random-angle arc, a 45 ms hit-stop.

## Options compared (by what the player does)

1. **String on one demon (built).** Press three times on the same demon: cross cut, rising cut, casting blow. The angel stays on the demon between cuts and gets its arrival speed back on the last. Looking at another demon and pressing breaks off to it.
2. **Fly-through passes (not built).** No string. Each pass through a demon is one cut, and the cut depends on how you arrive: diving gives a downward blow, climbing a launcher, level a cross cut. The sequence comes from the flying.
3. **Drawn cuts (not built).** On the phone the direction of the swipe across the demon chooses the cut. The stroke recogniser from October (`combatStroke.ts`) already tells tap, swipe, circle and flick apart.

Option 1 was built first because it answers the request most directly with the least new input to learn: the controls are unchanged (tap, click or C), only what a repeated press does. Options 2 and 3 can sit on top of it later; neither is ruled out.

## What the proof does

| Cut | Before it lands | When it lands | On screen |
|---|---|---|---|
| 1 Cross cut | the dive, as before | 55 ms hit-stop; the demon is shoved along the blow and held; the angel stops on it | level crescent, amber |
| 2 Rising cut | a 0.17 s step-in | 80 ms hit-stop; the demon is lifted about 2.5 m and hangs; the angel rises above it | climbing crescent, larger, paler |
| 3 Casting blow | a 0.24 s step-in from above | 140 ms hit-stop, the hardest camera jolt; the demon is bound and cast down; the angel leaves the way it looks at the speed its opener arrived with | upright crescent, largest, near white |

- The next cut stays open for 1.15 s. A press during a cut is remembered (the existing one-press buffer).
- A demon left alone for 2.6 s shakes its wounds off.
- The ring on the target names the next cut: STRIKE, CUT 2, FINISH.
- Sound: the first two cuts ring lighter and climb in pitch; the last keeps the full blow.
- Body: the one library sword clip (Quaternius `Sword_Attack`, CC0) plays at a different speed for each cut, with a chest wind-up and swing-through that differs per cut.
- Wardens keep their armour duel; their two armour hits draw as cuts 1 and 2 and their exposed blow as the casting blow.
- Numbers live in one table: `src/game/swordString.ts` (`CUTS`, `STRING`).

## Second pass (after "Yes, keep going")

From the chase camera the arms are hidden by the wings, so the cuts are now told with the whole body, the demon and the ground:

- **The body moves with each cut**: a full twirl about the spine on the cross cut, a lean back on the rising cut, a forward flip into the casting blow. The whole model turns about the chest, so the wings turn with it. Visual only (the camera and physics never read it); off for reduced motion and on the ground.
- **The demon carries each wound differently**: knocked askew by the cross cut, thrown onto its back by the rising cut, straightened when it recovers.
- **The casting blow drives the demon into the mountain**: it falls in half a second to the ground or the gorge water below it and ends there, where the existing kill burst is seen, with a ring thrown out flat on the ground and a small shake. Before, it sank 24 m or more below wherever it was and the burst happened under the world.
- **A beat on the finish**: the angel hangs over the blow for 0.2 s before it is released at speed.
- **The blade burns wider** through each wind-up.

## Independent code review (2026-11-09)

One reviewer in a fresh conversation, read-only, given the two sword commits, this note and the project rules, with no planning history. It ran nothing. Every finding was checked against the code before a disposition.

| # | Finding | Disposition |
|---|---|---|
| 1 | A buffered press with no chosen demon was replayed as an explicit target, so it skipped the string and could dive at another demon. | Fixed: replayed as "no chosen demon"; tested. |
| 2 | Wounds last 2.6 s but the string's window 1.15 s; a press in the gap was a zero-wind-up dive that landed the same frame. | Fixed: inside 12 m every cut after the first is a step-in with its wind-up (`stepInTime`); tested. |
| 3 | Within 6 m a press always continued on the wounded demon, so the look-away break-off failed, and the target ring could name another demon than the press hit. | Fixed: `pressTarget` is the one rule (string, unless the crosshair is on another demon); the ring calls it; tested. |
| 4 | A rebuked wounded demon lost its hold, and one thrown down kept its wounds for good. | Fixed: stays held; `throwDown` ends the string; tested. |
| 5 | A demon cut during its fly-in jumped along its path on recovery. | Fixed: the fly-in clock waits while it is held; tested. |
| 6 | A fast second press restarted the twirl mid-turn. | Fixed: the next cut's body move queues behind the one in progress; tested. |
| 7 | A demon finished after the angel had gone elsewhere left at the floor speed whatever the dive. | Fixed: the dive's own speed is used; tested. |
| 8 | Gesture Lab Draw strokes steer by velocity, so they could not break a hold. | Fixed in `Player.tsx`. Not exercised in a browser with Draw on. |
| 9 | Each step-in re-engaged the combat camera (the boom pumped per cut) and a step-in from above left the pilot pitched down. | Fixed in `CameraRig.tsx`: a string is one engagement, and step-ins are framed nearly level. Measured while mashing: weight stays 1.00 through the string, pilot pitch within 0.06 rad. |
| 10 | Step-in speed was uncapped. | Fixed: capped at the dive's top speed; tested. |
| 11 | Flashes: the gate is per demon and allows exactly three a second; arcs and rings are not gated. | Not changed. The demon's flash is at the WCAG 2.3.1 limit, not over it; the arcs are thin strokes, far under the general-flash area. Not measured with a flash analyser: a known limit. |

Test gaps the reviewer named (no buffered or untargeted presses, break-off only tested from 40 m) are closed by the tests added with fixes 1 to 3.

## Accepted, rejected, undecided

- **Accepted by Garo**: the three-cut string as the direction ("Yes, keep going", 2026-11-09, after playing it). This accepts the direction, not every number in it.
- **Rejected by Garo**: the single dive-and-cut fight ("arent videogame like").
- **Undecided**: three cuts or more; whether the string should need timing or accept mashing; options 2 and 3; whether wardens should take strings too; new sword animations.

## Known limits

- There is one sword animation in the free packs on this machine (Universal Animation Library 1 has a single `Sword_Attack`). Distinct body motion per cut would need more clips: a download, or a purchase, both Garo's call.
- A fight to eight now takes about three times as many landed cuts as before. Not tuned.
- Not checked on a physical iPhone. Checked: unit tests, and the fight's browser tests on desktop and at 393x852 and 852x393.
