# Touch controls: one thumb (default), twin sticks (opt-in) and browser protection

> 2026-09-26, Garo: "bring back one-finger flight as the phone default, with shooting as tap-a-drone on top, and remove the friction and speed cap from flight." Controls version 6. The twin-stick scheme below stays available under Flight settings › Touch controls › Two thumbs; everything in the browser-protection sections applies to both. Post-mortem: [DECISIONS.md](DECISIONS.md), 2026-09-26.

2026-09-24, branch `codex/shooter`. Spec: "Industry-grade touch controls and browser protection: implementation spec (revision 2)".

Garo, after playing the Vercel preview on his iPhone: "Oh wow the game is terrible controls. Redo them so that they are at industry grade standards and movements/gestures dont exit the browser and/or pause the game unintentionally".

What this answers:

- Left thumb: a floating joystick that appears where the thumb lands, to fly.
- Right thumb: drag anywhere to look.
- Big Fire, Aim, Rise and Descend buttons within thumb reach, as in PUBG Mobile, Call of Duty: Mobile and Fortnite.
- Controls kept away from the screen edges.
- Safari's scroll and zoom gestures blocked during play.
- The game pauses only when the player actually leaves it.

Desktop controls (trackpad, mouse and keyboard) are unchanged.

## Schemes

| Scheme | Setting | What it does |
| --- | --- | --- |
| One thumb (classic, **the default** since 2026-09-26) | `touchScheme: 'classic'` | Main 7945430's adaptive thumbs, verbatim (`src/game/adaptiveThumbs.ts`, `thumbFlight.ts`, `useClassicThumbs.tsx`). Hold anywhere in the open scene 180 ms to lift and cruise (8 m/s); slide to aim: left/right turn and up/down climb/dive at 0.003 × 1.6 rad per px, no acceleration; drag farther for speed (`thumbThrottle`, 8 to 34 m/s over 24-120 px); hold within min(44, 0.1 × size) px of an edge to keep turning at 1.5 rad/s (linear to the edge; 4.2 s per 360 at the very edge, direct, no slew, the same under Reduce motion and with the blaster on) and pitching at 1 rad/s; release to hover. A quick tap never lifts. A second contact: left move / right look (sorted by x); lifting one re-bases the other as an inactive single thumb; a third contact blocks until all lift; rotation clears. **Shooting: tap a drone** (a quick tap, 250 ms and 10 px, inside the drone's effective radius: silhouette + 18 px, at least 28 px, also where it was 80 ms ago) fires the Lab's aimed 3-shot burst (`src/game/gesture/tapFire.ts` → `aimedShot.ts`); a hold that landed on a drone waits 250 ms instead of 180 before lifting, so the tap and the lift never collide (one tap definition everywhere beats 70 ms of lift latency on the drone's silhouette). Any second finger, on a drone or not, is a tap until it holds 250 ms or slides 10 px (`src/game/thumbGate.ts`): a quick lift blasts when it landed on a drone and does nothing when it did not, while the first thumb flies on untouched (the thumbs never see it, so a missed tap can no longer zero forward and edgeTurn); otherwise it joins the thumbs as main's second contact (move or look by x, at most 250 ms late; a finger on empty space joins where it landed, so its whole slide still looks), and never fires. A third contact still blocks. A rotation expires the contacts in the same event (the surface reads `idle` at once, as main's remount did). A tap on empty space does nothing. No Fire button, no Aim button, no auto-fire; the crosshair is hidden (`html[data-input=touch][data-touch-blast]`), and the hit marker sits at the tap. The drone screen history (`GestureTrack`) mounts for it on Standard. |
| Two thumbs (opt-in) | `touchScheme: 'twin'` | A touch's role is fixed at touch-down. In the stick zone it is the move stick. On a cluster button it is that button, and it also look-drags. Anywhere else inside the bands it is look. Everything below (layout, look, buttons, landing) is this scheme. |
| Tap controls | `tapControls` | The no-drag alternative (WCAG 2.5.1). The stick zone and ghost are off and the left side looks. The cluster keeps Rise (lift off, climb) and Descend (land), which need no drag; only Aim moves to the pad. The pad's Rise also lifts off on the ground. |

Settings live in Flight settings › Touch controls on any touch screen (`any-pointer: coarse`), with the blaster on or off. One thumb has none (one line says what it does). Two thumbs: Look sensitivity (0.5–2), Aim sensitivity (0.5–1.5, blaster on), Look acceleration (on by default since 2026-09-25), Edge turning (on by default), Invert look up and down, Left-handed (swap sides), Fly where I look, Control size (85–120 %) and Control opacity (40–100 %). The Auto-fire assist and the Aim-button switch show only with Two thumbs.

## Layout (`src/game/touchLayout.ts`)

**Coordinate box.** Layout uses the visual viewport: `{x: offsetLeft, y: offsetTop, w: width, h: height}`, falling back to `{0, 0, innerWidth, innerHeight}`. The overlay and cluster sit in a fixed container over that box, and routing subtracts its origin.

**Bands** (where a touch may start). Only a 12 px strip at each physical edge is ignored; the bottom strip is the home-indicator inset less 8 (never under 12). Safe-area insets do not widen the side strips: ignoring a touch in JS never stops an iOS edge gesture, it only cost reach (review 2026-09-24: thumbs resting at (70, 300) or (790, 250) on an iPhone 15 in landscape did nothing). Insets come from a hidden probe padded with `env(safe-area-inset-*)`.

| Band | Value |
| --- | --- |
| left | 12 |
| right | w − 12 |
| top | header bottom − box.y + 8 (fallback max(44, insetTop + 44) + 8). The header is measured, so the lab bar's second row (portrait, up to 839 px wide) moves this band down by itself |
| bottom | h − max(12, insets.bottom − 8) |

**Anchor** (the corner the cluster is measured from): landscape (w − 12, h − max(12, insets.bottom)), ignoring the side inset, because the Dynamic Island or notch is vertically centred and the corner is free; portrait (w − 12 − insets.right, h − max(12, insets.bottom)). In landscape, a hit circle that would reach into the side inset within 70 px + r of mid-height (beside the island) moves the whole cluster inward, so gaps hold.

**Buttons.** Each centre is an offset (dx′, dy′) from the anchor: x = anchor.r − dx′·k, y = anchor.b − dy′·k. Hit radius r·k, visual diameter vis·k. Every table has dx′ ≥ r and dy′ ≥ r, and every gap is at least 12 table px. Left-handed mirrors x and swaps the left and right insets.

Landscape normal (stick R = 64k). On an iPhone 15 in landscape (insets 0/59/21/59) Fire's centre is 118 px from the right edge and 109 px from the bottom; every centre is within 215 px of the anchor. Descend sits in the corner, like crouch/prone in mobile shooters.

| Button | dx′ | dy′ | vis | hit r |
| --- | --- | --- | --- | --- |
| Fire | 106 | 88 | 80 | 48 |
| Rise | 90 | 190 | 68 | 40 |
| Aim | 200 | 60 | 60 | 36 |
| Descend | 34 | 34 | 56 | 30 |

Landscape compact, used when the normal fit gives k < 0.85 (stick R = 64k):

| Button | dx′ | dy′ | vis | hit r |
| --- | --- | --- | --- | --- |
| Fire | 88 | 76 | 76 | 46 |
| Rise | 188 | 114 | 60 | 36 |
| Aim | 280 | 74 | 52 | 32 |
| Descend | 188 | 34 | 52 | 32 |

Portrait, a two-column arc on the corner (stick R = 56k): Fire at the corner, Descend to its left, Rise above-left, Aim above. Every centre is within 220 px of the anchor, so Fire and Aim are both under the thumb (the old single column put Aim 348 px up).

| Button | dx′ | dy′ | vis | hit r |
| --- | --- | --- | --- | --- |
| Fire | 70 | 84 | 76 | 46 |
| Descend | 168 | 50 | 56 | 34 |
| Rise | 144 | 160 | 64 | 38 |
| Aim | 62 | 200 | 56 | 34 |

Visibility: blaster off hides Fire and Aim, and Rise takes Fire's offsets with its own radius. `aimButton` off or tap controls on hides Aim. Tap controls remove the stick zone and ghost.

**Look pad.** Look starts anywhere in the bands that is not a button or the stick zone. The layout also names a look-only region for the tests: landscape, between the stick zone and the cluster; portrait, above both (the upper part of the screen).

**Fit pass** (`computeLayout`):

1. kPref = max(60/76, clamp(min(w, h)/390, 0.85, 1) × clamp(size, 0.85, 1.2)); the 60/76 floor (about 0.79) keeps Fire at 68 px or more at Control size 85 %.
2. k = min(kPref, availH / reach, width cap), where availH = anchor bottom − top band, reach = max(dy′ + r) over visible buttons (230 landscape normal, 150 compact, 234 portrait) and the width cap is (availW − 12 − min(120, 0.4w)) / max(dx′ + r), so the stick zone keeps its minimum width.
3. Landscape with k < 0.85 switches to the compact table and recomputes k; compact is kept only when it gives a larger k than normal.
4. A fit that forces k < 0.74 is floored at 0.74 and marked `cramped` (the kPref floor alone never marks it); the pause card then says "Screen too short for touch controls. Zoom out or turn the phone."

Floors: every hit diameter ≥ 44 px, Fire ≥ 68 px, every gap ≥ 8 px. Worked checks (insets 0/59/21/59): 852×393 at size 1.2 gives k = 1.2; 852×300 at size 1.2 is height-capped at k = 0.935 with Rise's top on the top band; 667×320 k = 0.85 (normal); 568×262 compact at 0.85.

**Stick zone** (none with tap controls): from the left band (12 px) to min(0.45w landscape or 0.50w portrait, the leftmost visible hit edge − 12); top max(top band, 0.30h landscape or 0.45h portrait); bottom band. The base centres on the touch point, so a thumb near the edge gets no throw at touch-down. At least min(120, 0.4w) wide and 100 tall. Mirrored when left-handed.

**Ghost ring** (opacity 0.25 × control opacity, hidden while the stick is held), from (left band, anchor bottom): landscape (+130k, −96k); compact (+100k, −76k); portrait (+96k, −150k).

Pause stays in the header, above the top band. On touch, the Municipal record button moves top-left, under the header and above the stick zone, and the altitude readout leaves the stick zone: top right under the header in landscape, left below the hint bands in portrait.

## Stick (`src/game/twinStick.ts`)

- The base centres on the touch-down point, so the first input is zero.
- m = min(d, R)/R; dead zone 0.12, rescaled: s = (m − 0.12)/0.88; output = s^1.5. Forward = −dy/d · output, strafe = dx/d · output, relative to camera yaw. No axial snapping.
- Past R the base follows the finger (base += (p − base)(1 − lead/d)), clamped inside the zone. lead is R, except within 35° of straight up, where it is 2R so the sprint zone stays put. The knob is drawn at base + throw clamped to R, so it matches the input exactly.
- Full stick: 13 m/s flying, 5 m/s walking. A thumb on the rim is full normal speed and never boosts (review 2026-09-24: the old 0.9-of-R rule boosted almost every forward drag).
- Boost (34 m/s) is a deliberate push, like sprint on mobile shooters: the finger 1.5R or more above the base (the sprint zone, marked by a chevron above the ring while flying), within 35° of up, for 120 ms. It holds until release, output below 0.7 or past 50°.
- Cruise: a double tap in the stick zone (each tap ≤ 200 ms and ≤ 12 px; the second within 300 ms and 32 px) while flying holds forward = 1. Stick travel past the dead zone, Descend, a released input or a cleared input cancels it.
- The stick never lifts off the ground. The Rise button reads "Lift off" there.

## Look (`src/game/touchLook.ts`)

- Coalesced pointer deltas are summed; `touchLook` calls `look()`, so CameraRig stays the only camera writer.
- 1:1 relative, no smoothing, no slop, no inertia. 0.0052 rad/px (0.298°/px); pitch at 0.8×. The degree value is a design choice, not a published number.
- Gain = (0.0052/0.003) × Look sensitivity × (1 + (Aim sensitivity − 1) × ADS blend) × acceleration. Invert look flips pitch.
- **Look acceleration (on by default since 2026-09-25, `lookAccel`).** Yaw acceleration g(v) = 1 + 1.75 × smoothstep((v − 0.35)/1.25), with v the finger speed in px/ms; pitch uses 1 + (g − 1) × 0.4. Below 0.35 px/ms g is exactly 1, so slow aiming is unchanged (30 px at 0.1 px/ms is still 8.9°). A fast 350 px swipe in 200 ms turns about 270° (was 104°); a 250 px portrait swipe in 180 ms about 190° (node math, min-jerk swipe at 60 Hz). On narrow screens the extra part of the yaw gain (never the fine-aim gain of 1, and never pitch) scales by 700 px / screen width, at most 1.8x: 1.78x on a 393 px portrait phone, 1x in landscape and on tablets. So a fast 157 px portrait swipe in 100 ms turns about 190° (was about 120° in the review's emulation), and a 300 ms swipe of the same length about 55° (was 47°): one ordinary swipe is still under half a circle in portrait; the edge hold is the full turn (review 2026-09-25, node math; needs the iPhone). **Look acceleration is off while Reduce motion is on** (g = 1, the Fixed Speed gain), and the setting says so.
- **Edge turning (on by default, `edgeRest`, `src/game/lookEdgeRest.ts`).** The look side has two rest bands, so a thumb can keep turning left or right. The outer physical edge (56 px, full strength in the last 16 px) turns toward that edge. The second band turns the other way: in landscape it is a thin 32 px strip on the stick-zone line (full in the last 10 px; past the line counts fully); in portrait, where the look pad spans the full width above the stick zone, it is the opposite physical edge (56 px). Until the 2026-09-25 review the portrait second band sat on the stick-zone line, mid-pad, so an ordinary quick flick left that stopped in the left half of the pad started a non-stop spin; in landscape the old 56 px strip caught flicks that stopped 40 px short of the line. A band arms only when the thumb enters it moving toward that edge at 0.6 px/ms or faster and then stays in it for 80 ms; moving back out by more than 8 px disarms it. While armed, a still thumb keeps turning at 3.5 rad/s (2.5 under Reduce motion), eased in over 0.15 s. A slow aim that ends near an edge never arms, and a flick that stops mid-pad is outside every band. **The 360 on the phone is "swipe to the edge and hold".** Turn it off in Touch controls › Edge turning. Tap controls have no stick zone, so only the outer band exists there.
- Saves from before controls version 5 get Look acceleration and sustained edges switched on, and gain Edge turning on. A version 5 save keeps its own choices. Saves from before version 6 move to One thumb (the twin default of versions 3-5 cannot be told apart from a choice); a Two thumbs choice saved at 6 or later persists.
- Applied travel adds to `runtime.stick.lookTravel`, which the hints read.

## Buttons

All buttons act on `pointerdown` with pointer capture and release only on their own pointer's `pointerup`, `pointercancel` or `lostpointercapture`. A contact whose `touchEpoch` changed is dead until it lifts. Every button's drag looks from the first move. Pressed state: `data-held`, a fill swap and 1.08 scale (no scale with reduced motion). Keyboard and switch activation (`click` with `detail 0`): Fire shoots once, Aim toggles, Rise lifts or nudges up for 400 ms, Descend lands or nudges down for 400 ms.

| Button | Behaviour |
| --- | --- |
| Fire | Bullet glyph. Hold to fire; always visible with the blaster on (Two thumbs only). Auto-fire stays on by default as an assist, and a press overrides it at once. Heat ring via `--heat`; `data-locked` during an overheat lock. |
| Aim | Scope glyph. Toggles on release only for travel ≤ 12 px, a press under 400 ms and a release inside the hit circle. `aria-pressed`. On by default (controls version 3). |
| Rise | On the ground a press lifts off ("Lift off"); held, it climbs at 13 m/s ("Rise"). It never sets lift while flying. |
| Descend | Held, it descends at 0.7 × 13 = 9.1 m/s and cancels cruise. A tap under 250 ms while `canLand` and not near the ground lands on the aimed target. Reads "Land" near the ground or when `canLand`, and "No landing" (dimmed, amber label) when the descent is blocked with nowhere to land. |

Rise and Descend held together hover.

Labels: a small caps label (Fire, Aim, Lift off or Rise, Descend or Land) sits under each button until that button is first used in the page load; a blocked Descend always shows its label. The label text is part of the accessible name (WCAG 2.5.3). Keyboard and switch pulses of Rise and Descend each have their own 400 ms timer (a shared timer left Rise stuck on after Rise then Descend).

## Landing and level flight (`src/game/touchFlight.ts`)

- **Probe.** Every physics step while flying with Descend held (and no landing goal yet), a ray is cast straight down from the suit, length FOOT + 2.5 m. A hit with normal.y > 0.75 that `canLand` accepts sets the landing goal and starts the existing assisted landing; Descend's vertical is then dropped so the landing is not cancelled as movement.
- **Fallback.** Flying with Descend held while grounded on landable ground lands at once.
- **Blocked descent.** When the clearance assist stops a held Descend (tree canopy, a sloped roof, a railing) for 0.4 s, `touchBlockedStep` searches rings of 2.5, 4 and 5.5 m around the suit (8 directions, rays down 14 m) and lands on the first landable spot with a clear straight path. With none, Descend reads "No landing" and the flight hint says "NO LANDING BELOW · MOVE TO OPEN GROUND" until Descend is released, the descent resumes, or the suit moves 3 m and a new search finds one.
- At 9.1 m/s the suit moves 0.15 m per step, so the 2.5 m window cannot be skipped. The Land label uses the same probe on the existing 0.15 s tick.
- **Level flight.** Twin touch flies level by default: stick forward is horizontal and Rise and Descend set altitude. "Fly where I look (climb by aiming up)" restores pitch-coupled flight. Desktop and One thumb keep pitch coupling unchanged (the one thumb climbs by sliding up).

## Multi-touch

- Dynamics review S1 (2026-09-28): before, a quick tap that missed every drone joined the thumbs at once and `AdaptiveThumbs.start()` and `end()` both called `neutral()` on the held thumb: forward 0.48 to 0, edgeTurn 0.74 to 0, speed 13 m/s to 0 in 2 s, until the thumb slid 8 px (a miss rate of 3.8-9.9% of taps at rest, 33.9-68.5% at 34 m/s). Every second finger is now pending, so the held thumb's flight state stays bit-identical on 100% of quick missed taps (`tests/thumb-gate.test.ts`, a 120-case grid; speed at 2 s 16.2 m/s toward the 0.48 cruise, was 0). Cost: a deliberate two-thumb user waits up to about 33 ms (slide) or 250 ms (still hold) for dual mode; check both orientations on the phone. A joined second thumb that lifts without real use (that thumb never slid past the 8 px deadzone; the held thumb's own steering does not count) now resumes the held thumb at its spot instead of leaving it dead; after real two-thumb use, and after a second finger that slid in (a tap that drifts past 10 px), main's hover stays until the thumb slides 8 px. Two thumbs that land together wait for the second finger to resolve before the first lifts, so there is no 70 ms launch blip; a lift after 250 ms is a hold even when the pointerup arrives ahead of the timer. Known cost, to judge on the phone: a move-stick push made inside the 250 ms window before the join is partly lost (the join re-bases the stick).

One owner per pointer for that finger's whole life. Up to 5 contacts at once (stick, a look or Fire drag, Fire, Rise, Descend); iPhone reports 5 touches. Extra contacts are ignored and never block. A second look-zone finger is ignored; look drags from buttons add together. A sixth finger makes iOS cancel every contact: each control releases on its own `pointercancel`, with no pause.

## Browser protection and pausing

**Pointer mode** (`src/game/pointerMode.ts`). The last pointer type decides: touch or pen means touch mode, mouse means mouse mode. Before any pointer, `(pointer: coarse)` decides. `html[data-input]` mirrors it. An iPad with a trackpad is desktop while the trackpad drives and touch the moment a finger lands.

**During play only** (`html[data-playing]`): the page is fixed with overflow hidden, play surfaces get `touch-action: none` and no selection, callout or tap highlight, and document listeners block `touchmove` outside play controls, Safari's `gesturestart`/`gesturechange`/`gestureend` (preventDefault only, never touching input), and `contextmenu`/`selectstart`. There is no `touchstart` handler anywhere, so taps on Pause and other buttons always work. `overscroll-behavior: none` is always on. The viewport has no `maximum-scale` or `user-scalable` limit, so the paused page and the guide still pinch-zoom.

**Pause rules.**

| Event | Desktop mode | Touch mode |
| --- | --- | --- |
| Window blur | Pause (unchanged) | Release keyboard keys only; fingers keep their controls (iOS sends pointercancel when the system takes touches, and focus moving into an iframe such as a preview toolbar is not an interruption) |
| Resize, orientation change | Unchanged | Orientation flip: release held input, keep playing; toolbar resize: nothing |
| Visual viewport resize or scroll | — | Recompute the layout; if zoomed (scale > 1.01) while playing, pause with the zoom note |
| Hidden tab or app switch | Pause | Pause |
| `pagehide` | Pause and save | Same |
| `pageshow` from the back-forward cache | Paused | Same |
| Every contact cancelled | — | Each control releases itself; no pause |

Releasing held input clears keys, thumbs, the stick, tap, surge, lift and a manual touch Fire, and bumps `touchEpoch`. It keeps velocity, aim latch, trackpad state and the landing.

**Edge back swipe.** Current iOS cannot block it. Instead: in touch mode, when a back swipe has somewhere to go (history.length > 1 or a referring page), one history sentinel turns a back swipe into a "Leave the game?" card ("Your progress is saved." · Keep playing / Leave); and the game saves on `pagehide`. Keep playing re-arms the sentinel. A fresh tab from a QR code or Messages gets no sentinel, so an edge swipe stays the no-op it already was instead of pausing. A back swipe while Flight settings or the Field guide is open raises no prompt; closing the dialog resumes and re-arms, and any resume clears a pending prompt. Next 16 copies its router state into our entry, so going back is a same-URL traverse; a browser test checks the game does not reload. On iPhone this is not validated.

**Zoom guard.** Begin and Resume refuse to start while the page is zoomed (scale > 1.01). They try a one-frame zoom reset and show "Pinch out to normal size, then tap Resume." Whether the reset works on iOS is not validated; the note is the fallback.

**Wake lock.** Requested at Begin and Resume, released on pause, and re-requested when the page is visible again while playing.

**Home Screen tip.** The home indicator, Control Center and Notification Center cannot be blocked. In touch mode outside a Home Screen app, the pause card shows "Tip: Share › Add to Home Screen for full screen." until Got it. A web manifest (`display: standalone`) and Apple web-app metadata make the Home Screen app open full screen. Portrait also shows "Best played sideways."

**Not used on iPhone:** haptics, Fullscreen API and orientation lock (unsupported there).

## Hints (`src/ui/hintSteps.ts`)

Two thumbs: "Left thumb: move" → "Right thumb: look" → "Tap Lift off to fly" → "Aim at drones · Fire to shoot" (auto-fire off: "Hold Fire to shoot"; blaster off: "Hold Descend to land"). The steps finish on a stick move, 0.2 rad of touch look (or a hit), a Rise or Descend press (or lift-off), and a hit or 5 shots (blaster off: a landing). Only the third and fourth steps time out, after 20 s shown (never saved). One thumb (the default, blaster on): one 6 s line per page load, "Drag to fly · tap a drone", then main's "ONE THUMB TO FLY · TWO TO MOVE + LOOK" on the ground. The version-3 migration restarts touch hint progress.

## Screen diagnostics

Flight settings › Screen diagnostics (touch screens only) shows inner size, visual size, scale, offset top, safe insets, Home Screen app and touch mode as plain text, read when opened and on Refresh, so the real iPhone values can be read on the device.

## Device checks: NOT VALIDATED

Automated checks are emulation only (system Chrome CDP touch; Playwright WebKit only for `gesturestart`, when already installed). Emulation is not iPhone validation. Until Garo checks on his iPhone, in both orientations:

- a left-edge back swipe during a stick drag shows the Leave card and does not exit;
- a portrait stick drag near Safari's bottom bar does not switch tabs or open the tab overview;
- a home swipe and return comes back paused;
- a Control Center or Notification Center pull releases input without pausing;
- a two-thumb pinch in play does not zoom; a pinch on the pause card does zoom;
- zooming on the pause card, then tapping Resume, resets the zoom or shows the zoom note;
- showing or hiding the toolbar mid-drag keeps the stick;
- rotating mid-drag keeps playing with the controls re-anchored;
- a 3 s Fire hold shows no loupe or callout;
- 5 fingers held keep them all; a sixth finger cancels cleanly without a pause;
- holding Descend lands;
- level flight feel;
- tapping the edge of Pause;
- two minutes of cruise with no auto-lock;
- Add to Home Screen opens full screen;
- the Screen diagnostics values;
- thumb reach and sizes (Fire about 118 px from the right edge in landscape; the portrait arc);
- the sprint zone: a rim hold stays at normal speed, a push into the chevron boosts;
- holding Descend over trees lands beside them or reads "No landing";
- the first-use labels are readable and go away after each button's first use;
- a fresh tab (opened from a QR code) edge swipe does nothing; a tab opened from a link shows the Leave card;
- default look speed feels right (0.298°/px; Look sensitivity goes 0.5–2);
- a full 360 in flight: a fast swipe that ends in a rest band keeps turning, to the right (outer band) and to the left (the stick-line strip in landscape, the left edge in portrait), in both orientations (node math: 0.73-0.75 s landscape, 1.15 s portrait; the emulated review measured portrait about 0.5 s slower); and a quick flick that stops mid-pad and rests never spins;
- a slow aim near the edge never starts an edge turn; Edge turning off stops it;
- the one-thumb scheme: a thumb resting about 25 px from the edge turns all the way round in about 2 s (node math 1.80 s);
- the lab bar at the top does not crowd the look pad or the cluster in either orientation.

Recommendation, pending Garo's OK (a project setting): turn the Vercel Toolbar off for Preview. Automated preview runs send `x-vercel-skip-toolbar: 1`.
