# Mount Hermon encounters

Design review revision 1, based on `edfb2838`, with [review dispositions](2026-11-17-hermon-encounters-review.md). Garo asked to address the angel, wings, sword, combat, Watcher categories, and movement through the open world.

## Playable scope

The player takes wing from the Threshold, learns to read and answer a Watcher, then chooses where to fly next. The low approach follows the Cloven Arch into Watcher Gorge. Reaching the High Sanctuary involves climbing above the eastern rock shoulder and braking before the patrol. A player may take these routes in either order and continue exploring after victory.

Accepted direction comes from the Hermon and Real Fight plans. Keep Mount Hermon at dawn, the approved ivory-and-gold archangel, compact feather wings, blade contact, the three-cut string, and the two warden counter patterns. The city and chasm settings are retired. Patrol sites and the distribution of enemies are playtest choices. The roster describes fictional gameplay roles within Halaverga. The Field guide keeps its source quotations and distinguishes them from these roles.

The three sites give the existing massif something to play through. Keeping a single combat area would preserve the first fight but make climbing optional scenery. A sequence with hard gates would teach each move in order but would take away the choice to follow the ridge or explore the flats. This pass uses the same eight enemies across three sites, with the nearest unfinished site offered as guidance.

## Implementation

- Keep patrol indices and the two warden home loops. The Threshold has four lesser enemies, the gorge has the Rift Lancer and Cinder Cantor, and the High Sanctuary has two lesser enemies moved from the gorge approach. Each patrol specifies its site and role, and the site data holds a safe airborne approach point. Keep altitude differences small within each site for portrait combat. Fit the two new loops to the actual fixed colliders and the existing landing route.
- The scouts circle and dodge. Dart Watchers retain the visible wind-up, a dodgeable dart and the shield response. The Rift Lancer closes in and uses rush or cleave. The Cinder Cantor makes space and uses volley or splitfire. Preserve the existing warden sweep and sight checks. Give scouts a lighter silhouette by hiding the cuirass and sword, and give the shared wing renderer role-specific tints and stroke rates. Keep the standard body dimensions and draw-call structure.
- Keep a seal bit per patrol index in the existing enemy field. The casting finisher records the seal once. A sealed enemy finishes its existing death transition and stays gone for that encounter. Compute victory from all eight seals. On retry the UI requests a reset and Player returns to the Threshold. Shooter consumes the encounter request before its normal step, replacing its cached patrol simulation and resetting banishment, battle and counter state. Practicing flight and optional legacy shot simulation retain their existing controls and unsealed enemy fly-in.
- Reuse one line of the existing battle card for the nearest unfinished site's label and direction. The High Sanctuary cue tells the player to climb first when below its approach altitude. Player position and current view inform that cue. It issues no steering or camera requests. Add the roles and both approaches to the existing Field guide and update the map.
- At gameplay distance, make the angel's body readable between the wings. Give the ivory chiton a narrow warm-gold woven sash, give the feather rows more depth against snow, and keep a metal blade visible under the flame at rest. Retain the hand mount and the measured blade length. Fold during the travelling dive and let the wings open into the cut and braking. Validate at the same camera and viewport as main.
- Keep the dawn palette and existing rock and snow textures. Let the slopes show through in wind-scoured patches on the ascent, and soften the bright outlines on the mountain so the two characters read against it.

The initial proof is one seal, departure from its site, and flight to the High Sanctuary where the two moved patrols can be engaged.

## Verification

- Simulate every patrol loop and sweep both flight approaches against production collision geometry and the existing landing corridor. Check all patrol roles and membership, both routes' clearance, exact seal progress, no respawn of a sealed Watcher after the usual delay, and restoration on regroup.
- Use the normal browser entry and real flight and combat input to verify a landed sword string, a climb to the sanctuary, the changed patrol silhouettes, pause and both phone viewport orientations. Re-run existing warden, counter, movement and accessibility checks. Record physical iPhone Safari as pending unless tested on hardware.
- Run `pnpm verify` including the existing 629 KB landing budget. Keep new behavior behind the existing gameplay boundaries. Preserve Canvas error handling, reduced motion, one camera writer and the under-200-line module limit.
