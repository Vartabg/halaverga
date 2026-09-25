# Gesture Lab: Standard, Draw, Conduct and Brush

The Gesture Lab lets you switch between four control schemes while you play, on the iPhone and on the Mac, so you can compare them by flying. Standard stays the default. A lab scheme replaces the input only while it is selected. Movement, safety, the camera and the world stay the same in all four.

- **Standard**: the controls from before the lab. On the Mac that is the free-cursor trackpad restored in 52f3efa. On the phone it is the twin sticks.
- **Draw**: draw a line and the hero flies along it.
- **Conduct**: rest a finger (or the pointer) to steer, and stir to go faster.
- **Brush**: the hero cruises on its own. Swipes turn, soar and dive, and a circle around drones locks on.

With the blaster on, every lab scheme uses **Tap to Blast**: tap a drone to shoot it. There is no crosshair, because the finger does the aiming.

## Switching

| Where | How | Saved? |
|---|---|---|
| Header chip `Lab: Draw` (only in a lab scheme) | Tap or click it. The game pauses and Flight settings opens with the picker. | yes |
| Pause card | Use the **Control lab** radios under Resume. Arrow keys also work. | yes |
| Flight settings | The same radios, plus **Shots slow me down** (lab schemes only). | yes |
| URL | `?controls=standard`, `draw`, `conduct` or `brush` | no, this visit only |

- Any switch releases every held input: keys, the stick, a held blast and the lab's cruise. The controls then remount, so nothing carries over from the scheme you left. The browser test `lab-switch.spec.ts` checks this in the middle of a cruise and in the middle of a sustained blast.
- After a switch you can rate the scheme you just left from 1 to 5 on "How beautiful?" and "How in control?". Both questions can be skipped.
- If a lab part fails to load or crashes, the game goes back to Standard for this visit and tells you. Your saved choice stays as it was.

## Player guide

### Standard (default)

- **Mac**: click the open scene to lift and cruise. Move the pointer to steer, and hold it near an edge to keep turning. Two-finger scroll changes speed. Click again to brake and hover, and drag while hovering to look. With the blaster on, a click while hovering or on the ground fires, a drag looks, and W or Space starts flying. The keyboard (WASD, the arrows, R/F, Space, Shift, Escape, E) works as before.
- **Phone**: move with the left thumb, look with the right, and use Rise/Descend and Fire on the cluster. See [touch-controls.md](touch-controls.md).

### Draw the flight

| | Phone | Mac |
|---|---|---|
| Fly a path | Drag a line. The hero starts along it while you are still drawing, and the view holds still under your finger. From the ground the first line is a take-off: ink below the hero skims above the ground instead of diving into it. | Click empty sky, then move the pointer (no button held) to ink. A 650 ms rest or a second click ends the line. |
| Keep going | Draw again before the path ends. The new line starts where the hero is, without stopping. | Same. |
| Land | End the line on a flat roof or terrace. The hero lands there. | Same. |
| Brake | Tap with a second finger, or hold still 0.9 s before moving (a ring fills). | Right-click with nothing inked. |
| Cancel a line | Scrub back over its last part within 0.3 s. | Escape or right-click while inking. |
| Shoot | Tap a drone for a 3-shot burst. Hold on it for sustained fire. | Click a drone (while not inking). |
| Fallback | More controls: **Fly to where I tap**, **Brake**. | Same. |

Limits: a drawn line always moves away from the camera. You can make swoops, dives, carved curves and corkscrews, but not a true loop or a U-turn in one line. Chain lines after the view turns instead. A line into a wall is cut short, the game says "Path blocked", and an amber stub shows where it was cut for 1.5 s. Pressing Land (or Space) while a path is flying drops the path and lands.

### Conduct

| | Phone | Mac |
|---|---|---|
| Steer | Rest a finger off centre. The further left or right, the faster the turn. Height follows the finger: above the centre band climbs, below it descends, and the band itself (12% of the screen height either side) flies level. Lifting the finger levels the view again. Nothing steers for the first 120 ms. | While cruising, point where you want to go. Turns are steady (at most 0.8 rad/s) and the centre 8% flies straight. Leaving the window stops steering and keeps the speed. |
| Speed | Stir in small circles. Faster stirring means more speed, and resting holds your speed. | The cruise rests at about 9 m/s (the Standard cruise). Stir the pointer for more. |
| Start / stop | Touch to start. Lift the finger to glide down to a hover. A second-finger tap brakes. | Click below the horizon to start (even over a drone), click empty space again to stop. Right-click also stops it. |
| Dash | Flick in any direction; the dash follows the flick. A quick straight release dashes a little less. | Flick the pointer. |
| Roll | A quick small circle (clockwise rolls right). | Same with the pointer. |
| Look | | Press and drag. |
| Shoot | Tap a drone. | Click a drone. It fires and does not toggle the cruise. |
| Fallback | Faster, Slower, Dash, Roll left, Roll right, Brake. | Same. |

Check on the phone: your finger may cover the hero near the centre of the screen.

### Brush strokes

| | Phone | Mac |
|---|---|---|
| Cruise | After Lift, the hero cruises ahead at 13 m/s and holds its height. Near a wall or the ground, a stroke that steers away (soar off the floor, turn away from the wall) still runs; one that pushes into it stops. | Same. |
| Turn | Swipe left or right. A longer swipe turns further, from 20 to 90 degrees. | Click, then sweep left or right. It acts during the sweep, with no second click. |
| Soar / Dive | Swipe up or down. A dive pulls out early enough to level off 8 m or more above the ground. A swipe down lands only when you fly low (under 5 m) over a landing spot, or when it ends on the landing spot. Standing, a swipe down lifts off. | Click, then sweep up or down. |
| Roll | Circle empty sky. | Same. |
| Lock on | Circle one to three drones. Each locked drone gets a 3-shot burst. | Same. |
| Guide | Hold still 0.25 s to see the guide paths. Keep holding to 0.9 s to brake. | Ink less than 60 px, then rest. |
| Shoot | Tap a drone. | Click a drone. |
| Fallback | Soar, Dive, Turn left, Turn right, Roll, Lock and burst nearest drone, Brake. | Same. |

A stroke the game does not recognise turns grey, and the hero nudges a little in that direction. A slow drag (over 0.4 s) is not a swipe.

### In every lab scheme

- The keyboard always wins: movement keys cancel any path or program.
- Lift/Land is always shown.
- Escape pauses unless you are inking. While inking, Escape cancels the ink.
- Strokes never pause the game.
- Auto-fire should stay off in a lab scheme (Tap to Blast replaces it). See Known findings: tapping Lift/Land currently turns it back on.
- Reduced motion turns off the trail and the spin. Offsets are scaled to 60% and the guides stand still.
- Tips: the first tip starts 1 s after flight begins and plays three times, then replays every 8 s until you do it. Doing the step moves on to the next tip. In Draw and Brush the tip hides while you are drawing. In portrait the tip moves clear of the Lift/Land button.
- Ink: Draw's screen ink hands over to the world ribbon after 150 ms, Conduct leaves a short comet tail (320 ms), and Brush keeps the whole stroke.

## Input table (spec 2.6)

| Input (phone) | Draw | Conduct | Brush |
|---|---|---|---|
| First touch on a drone | arms the ring. On a tap: 3-shot burst. Held 180 ms still: sustained fire. Moving past the slop: becomes a stroke | same | same |
| Tap on empty space | blaster on: one miss shot along the tap. Off: fly there | blaster on: miss shot | blaster on: miss shot |
| Drag | live path | conduct | stroke |
| Hold still 250 ms | guide | (resting steers) | guide, no brake |
| Hold still 900 ms before moving | brake | n/a | brake |
| Second finger on a drone / elsewhere | burst / brake and clear path | burst / brake | burst / brake and cancel |
| Third finger | ignored | ignored | ignored |

| Input (Mac) | Draw | Conduct | Brush |
|---|---|---|---|
| Click a drone (not inking) | burst. Held 180 ms: sustained fire | same | same |
| Click empty space | start ink. While inking: commit | toggle the cruise (stopped: a click below the horizon starts it even over a drone) | start ink. While inking: commit |
| Press, drag, release | stroke committed on release | look | stroke committed on release |
| Hover | inks | steers while cruising | inks. A swipe commits at once |
| Rest 650 ms after 60 px of ink or more | commit | n/a | commit |
| Escape / right-click | cancel the ink (Escape with nothing inked pauses; right-click brakes) | right-click stops the cruise; Escape pauses | same as Draw |

On a phone, strokes that start in the 12 px side strips, the header band or the bottom 28 px (plus the safe areas) are ignored. That keeps them clear of Safari's back swipe and the home indicator.

## Tuning

Every threshold is in [`src/game/gesture/tuning.ts`](../src/game/gesture/tuning.ts), grouped by spec section. The few values the landing page needs are in [`tuningCore.ts`](../src/game/gesture/tuningCore.ts), and tuning.ts re-exports them. The first ones to tune on the iPhone are:

- the tap slop and the hold times (`TAP_SLOP_TOUCH`, `HOLD_MS`, `BRAKE_HOLD_MS`, `SUSTAIN_MS`);
- the swipe and flick limits (`SWIPE_*`, `FLICK_*`);
- the 1-euro filter (`EURO_MIN_CUTOFF`, `EURO_BETA`). Tune it in two steps: set the min cutoff with the finger still, then set beta with the finger moving;
- Draw depth and speed (`DRAW_D0`, `DRAW_M_PER_PX`, `FOLLOW_BASE`);
- Conduct gain and tempo (`STEER_GAIN`, `STIR_FULL_MMS`, `THROTTLE_FLOOR`);
- Brush turn and soar sizes (`TURN_*`, `SOAR_*`);
- the start filter (`EDGE_STRIP`, `BOTTOM_BAND`).

## Local measurements

Flight settings → **Control lab measurements** shows a side-by-side table for the lab schemes. It stays on this device (localStorage `halaverga.lab.v1`) and is never sent anywhere. The table covers:

- minutes played;
- gestures attempted, recognised and rejected, and how long recognition took;
- taps, hits, kills and overheats;
- Draw landings;
- clearance contacts; mean and max speed; p50/p95 frame times;
- pointer cancels, edge rejects and bottom-band rejects;
- your ratings.

The Standard column stays empty, because Standard is the baseline you rate. The downloads give the measurements and the last 50 raw strokes as JSON, and **Clear lab measurements** resets them. Two things are not recorded yet: why a Draw path was abandoned, and unexpected pauses.

## Design rationale and research

- **Why a lab and not a decision.** Four schemes playable live let the choice come from playing, not from describing. Standard stays the default and is not changed, so the comparison stays fair.
- **One pipeline.** A gesture only produces an intent, turn rates, a desired velocity or offset, a lift or land request, or an aimed shot. Every result then goes through the same flight safety (soft bounds, anticipation, collision) as keyboard and sticks. That is why a drawn line into a wall still stops at the wall. CameraRig stays the only camera writer, and camera roll stays 0: rolls turn the body only.
- **Ink you can trust.** Touch samples are smoothed with the 1-euro filter (Casiez, Roussel and Vogel, "1€ Filter", CHI 2012), which removes jitter at low speed without adding lag at high speed. Strokes are simplified with Ramer–Douglas–Peucker (Ramer 1972; Douglas and Peucker 1973) and resampled as centripetal Catmull-Rom curves (Yuksel, Schaefer and Keyser, Computer-Aided Design 2011), which do not form cusps or self-intersections.
- **Following a drawn path.** Pure pursuit (Coulter, CMU-RI-TR-92-01, 1992) with a look-ahead of max(3 m, 0.35 v). Speed is capped at sqrt(33.6 r) on curves, so turns stay flyable. The hero starts along the ink while you draw, so there is no commit delay.
- **Guides that teach while you gesture.** Holding still shows the possible strokes as labelled paths that fade as your stroke diverges. This follows OctoPocus (Bau and Mackay, "OctoPocus: A Dynamic Guide for Learning Gesture-Based Command Sets", UIST 2008).
- **Tapping moving drones with a finger.** A finger contact is larger and less precise than a cursor (Holz and Baudisch, "Understanding Touch", CHI 2011; Bi, Li and Zhai, "FFitts Law", CHI 2013). The pick radius is therefore the drone's projected size plus 18 px, at least 28 px. The pick also tests where the drone was 80 ms earlier, to allow for reaction time.
- **Accessibility.**
  - Every gesture has a 44 px button under More controls.
  - A stroke can be cancelled before it takes effect (WCAG 2.5.2 Pointer Cancellation).
  - The chip's visible text starts its accessible name (2.5.3 Label in Name).
  - Flashes stay under the existing flash gate (2.3.1).
  - Announcements go through the polite live region, and the ink canvas is hidden from assistive technology.
- **Phone safety.** Stroke starts are filtered away from the screen edges and the home-indicator band, and a pointercancel (iOS taking the touch) drops the stroke with no command.

## Browser tests (system Chrome emulation)

| Spec | What it checks |
|---|---|
| `lab-switch.spec.ts` | Standard is the default; `?controls=` is not saved; the chip pauses and opens the picker; radios work by keyboard and save; the rating is optional; a switch mid-cruise or mid-blast leaves no stuck movement or fire |
| `lab-draw.spec.ts` (phone) | live follow with the view held; "Path blocked", and the real wall stops the hero outside it; landing on the arrival terrace; chained strokes never stop the hero |
| `lab-conduct.spec.ts` | Mac: an empty click toggles the cruise with no shot, hover steers, a drone click fires without toggling. Phone: a resting finger steers, and lifting it glides to a hover |
| `lab-brush.spec.ts` (phone) | a swipe up climbs 5 m or more (measured 6.1 m); a lasso from a hover locks and fires; a 250 ms hold shows the guide without braking, and 900 ms brakes |
| `lab-desktop.spec.ts` | click-to-ink in Draw and Brush; the rest commit; Escape cancel; no phone UI, pause or pointer lock at 1440 and 325 px; the renderer budget |
| `lab-touch-guard.spec.ts` | edge-strip and bottom-band starts are ignored; no navigation or pause; pointercancel leaves no movement in all three schemes |
| `lab-look-source.spec.ts` | touches on the lab surface never arm auto-fire, even with the view centre on a drone |
| `accessibility.spec.ts` | axe AA scans of the lab UI on the Mac and the phone; chip by keyboard; radios; fallback buttons of 44 px or more; the status note; the live region |

Emulation is not iPhone validation. These specs prove the wiring and the visible behaviour, not how a scheme feels. CDP touch events take tens of milliseconds each, so fast strokes in the specs use few samples.

## Playtest fixes (2026-09-24, Chrome CDP emulation)

These came from an emulated playtest of all four schemes (phone 852 x 393 and 393 x 852 touch, Mac 1440 x 900 mouse). Each fix has a node unit test (`tests/lab-playtest-draw.test.ts`, `tests/lab-playtest-schemes.test.ts`). None has been felt on the iPhone or a real trackpad yet.

- Draw: the first stroke from the ground no longer cuts itself off at once ("Path blocked" with the hero hovering). Ink below a standing hero is floored above the ground, the take-off is not swept, and the grounded tip teaches a rising curve. A blocked line keeps an amber stub on show.
- Draw: pressing Land or Space while a path flies drops it (no false "Path blocked", no slide across the roof after touchdown), and a path velocity never drives a grounded suit.
- Draw: the ribbon no longer draws a screen-filling wedge during or after a rooftop landing (the whole ribbon fades once the path is no longer followed, long segments split, points at the lens fade, and the landing retarget keeps its spacing).
- Tips now advance: every scheme reports its steps, and a tap on a drone reports "tap a drone".
- Conduct: pitch is position control around a centre band, so a resting finger no longer drifts to the sky or into the ground; lifting levels the view. On the Mac the turn is steady, the cruise rests at the Standard speed, and a pointer leaving the window stops steering.
- Conduct: flicks read (the release speed skips the still pointer-up sample and reads an ease-out flick's peak), dash along their real angle, and a quick straight release dashes too.
- Brush: the cruise holds its height, dives pull out at 8 m or more, a stroke that steers away from nearby geometry still runs, and a swipe down only lands when low or when it ends on the landing spot. Standing, it never starts a landing.
- Aimed bursts: the chest gets the wide aimed reach in Brush and Draw too, and aims at the tapped drone's height while cruising. A lasso burst puts the hit marker on the locked drone.
- The ribbon and the trail draw in one pass each; the in-flight draw-call budget (+2) is enforced again.
- On touch, a window blur no longer drops a lab stroke or cruise (as in Standard); iOS cancels the pointers itself.
- Desktop hover ink commits after a 650 ms rest (was 350 ms).

What emulation cannot judge, and the iPhone and trackpad must: stir tempo (`STIR_FULL_MMS`), flick speed (`FLICK_SPEED` and the release measure), Brush swipe speed, the Conduct pitch band on a short landscape screen (`PITCH_DEAD`, `PITCH_REACH`), the desktop Conduct turn rate and cruise floor (`DESK_YAW_MAX`, `DESK_FLOOR`), and the 650 ms rest on a trackpad.

## Device checklist (record honestly)

Nothing below has been done yet. Fill it in after playing on the devices.

| Check | iPhone 15, portrait | iPhone 15, landscape | Mac trackpad |
|---|---|---|---|
| Switch all four live (chip, pause card, settings) | not done | not done | not done |
| Frame time p50 / p95 per scheme (lab table) | not done | not done | not done |
| Finger hides the hero (Conduct near centre, Draw start) | not done | not done | n/a |
| Ink latency: ink keeps up with the finger, the hero starts without delay | not done | not done | not done |
| Home-indicator swipe-up starts rejected (bottom-band count rises, no stroke) | not done | not done | n/a |
| Safari back swipe from the left edge: no stroke, no navigation | not done | not done | n/a |
| Tap to Blast hits the drone you tap (moving drones, screen edges) | not done | not done | not done |
| Draw rooftop landing, chained strokes, "Path blocked" | not done | not done | not done |
| Brush swipes recognised at your natural speed (not greyed) | not done | not done | not done |
| Conduct stir tempo and steering feel | not done | not done | not done |
| Conduct pitch: a resting finger holds level; the band feels right | not done | not done | not done |
| Flick to dash fires on a natural thumb flick (any angle) | not done | not done | not done |
| Brush swipe speed, dive pull-out height, cruise holds height | not done | not done | not done |
| Draw first stroke from the ground flies; 650 ms rest on the trackpad | not done | not done | not done |
| Tip placement (portrait clear of Lift/Land) and tips advance | not done | not done | not done |

## Known findings (U10, 2026-09-24)

- **Tapping Lift/Land turns auto-fire back on in a lab scheme** (touch devices). Lift/Land is not in `OWN_LOOK_SELECTOR`, so the capture-phase tag in `useShooterInput` sets `lookSource` to `'touch'`. Auto-fire (on by default) then fires at any drone near the view centre until the finger next touches the lab surface. The spec `lab-look-source.spec.ts` "tapping Lift…" reproduces it: 0 → 3 shots. It is marked `test.fail` until fixed.
- **A lasso drawn on the ground locks less reliably.** On the terrace, the first stroke lifts the hero, so the view moves up while the circle is still being drawn. In emulation that lasso failed to lock in 6 of about 16 tries: no lock and no shot, with the same drone and the same 50 px circle. From a hover it locked 6 of 6 times, including circles drawn in about 1 s. The spec now lassos from a hover. Check this on the iPhone. If it happens there too, suspect how the drone screen history (GestureTrack) follows a camera that is moving.
- **On touch screens, Flight settings no longer opens on the blaster section.** U9 put the lab picker (LabPanel) at the top of Flight settings, which pushes Auto-fire below the fold on a landscape phone (checkbox bottom at 640 px on a 393 px screen). The existing spec `simple-controls-touch.spec.ts` "Auto-fire is on by default…" now fails for this reason. The lead has to choose where the picker goes, for example after the touch blaster and touch settings on coarse pointers, or only at the top while a lab scheme is on.
