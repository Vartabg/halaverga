# The crossing at Hermon

Design revision 2 · November 18, 2026 · based on edfb283

Garo said no moment in the existing game has made him want another go. In a desktop playtest the existing assisted sword reached eight cast-downs without deliberate steering. Mount Hermon at dawn, an unnamed winged angel, the Watchers and assisted flight are established choices. Garo previously rejected the camera taking his heading away. The question of what makes a whole flight worth repeating remains open.

A precision flight line would give a pilot a turn to master. A counter duel would give a fighter an opponent to read. This experiment gives someone who enjoys swooping through a gorge a visible reason to choose where to fly. Two travelers need to cross the Cloven Arch. A Watcher is heading there under its own power. The crossing and the people are game fiction.

## Trial

An opt-in page at `/crossing` starts the angel on wing south of the arch. Forward travel is assisted. Steer continuously across the gorge and in altitude with arrows or WASD, or by dragging one thumb. The first interception is low and off to one side. A dive buys speed and costs altitude if the player misses. Staying high gives a later opening on the opposite side. Once close and in clear sight, strike with Space, C, a tap or the release of a steering drag. The sword assists the last stretch to visible contact. The Watcher breaks off after a hit and the two travelers walk across. If it reaches the crossing, the travelers retreat. Both endings have an immediate replay. The player's response to this experiment will inform the direction of the main encounter.

Reuse the mountain geometry, sky, characters and wing motion from the existing game, and its momentum model where appropriate. A stable, upright chase camera keeps the moving Watcher and crossing legible on a phone. Keep the HUD to the actionable controls and the outcome. Give the opening and recovery screens keyboard focus, text instructions, reduced-motion behavior and a persistent way to pause the action. Keep the trial session in memory. Use a Canvas boundary and a recoverable context-loss state.

New files live in `src/app/crossing/`, `src/crossing/`, `tests/crossing*` and this plan and review. The route owns its simulation object. Its only camera writer reads world positions. React consumes discrete phase and reach changes. Aim assistance for this encounter begins at short range, so the player earns their approach. The original concept review identified a 70 m lock on the main game and an arch only 69.9 m from the old takeoff marker.

## Checks

- Follow each approach at ordinary input speed. Record the time and location where a strike connects. Repeated strike with neutral steering must reach the late outcome.
- Advance identical inputs at different frame rates. A missed press cannot connect later without a fresh input. Pausing, backgrounding, rotating a phone and replaying clear held input. Finishing and replaying both outcomes starts a clean flight.
- See the travelers cross or retreat. A key pilot and a single-thumb pilot can each reach a real ending through the rendered page. Inspect laptop and phone portrait/landscape and check accessible names, focus, contrast and live feedback.
- Run the complete project typecheck, unit suite, production build, landing budget, and browser/accessibility checks. Describe hardware coverage honestly. A working prototype establishes that the choice is available. The reason to keep it would be a player voluntarily trying another approach.
