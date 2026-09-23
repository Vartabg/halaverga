# One finger + keyboard

2026-09-21. The player reported that two- and three-finger trackpad actions interfered with browser and window actions. The recommended controls now require only ordinary pointer movement, primary clicks and keys. This implements the keyboard alternative; physical comfort remains to be retested.

Open `/?trackpad=simple` or choose **One finger + keyboard** in Flight settings. New preferences default to this profile. Saved captured-cruise and Flow preferences remain intact; an old free-cursor save is migrated once (see below). The comparison URLs remain available.

| Action | Control |
| --- | --- |
| Lift into hover and look freely | Click the open scene (with the blaster on the click only frees the view; keys lift) |
| Look / steer, including while hovering | Slide one finger |
| Forward / backward | Hold W / S |
| Move sideways | Hold A / D |
| Rise / descend | Hold R / F |
| Return to hover | Release movement keys |
| Toggle Surge while moving | Shift |
| Lift / assisted landing | Space, or the Lift / Land button |
| Brake and free the pointer for buttons (blaster off) | Primary click |
| Fire (blaster on; hold for automatic fire) | Primary click once the pointer is captured |
| Aim (blaster on) | Hold Q (or toggle, per Flight settings) |
| Pause and free the pointer | Escape |

## With the suit blaster (2026-09-23)

The player asked to look freely while stopped and to shoot with the trackpad, the way the phone works: one thumb moves, the other aims and shoots. The keys fly and the finger looks and shoots:

**Slide to look · Click to fire (hold for auto) · Hold Q to aim · WASD fly · Space lift/land · Esc pause**

- A scene click while the pointer is free only captures it: it never fires and never lifts. After a landing, a pause, Settings, the Field guide, a resize or focus loss, one click restores free looking on the ground; WASD, R/F or Space lift. Looking needs no held button.
- Until that capture the blaster hint reads CLICK THE SCENE TO START · THEN SLIDE TO LOOK · CLICK TO FIRE; the full line above gets its own 6 s from the first capture. It wraps instead of clipping in narrow windows. If capture is rejected, the failure message adds "Hold C to fire", because a click cannot fire without the lock.
- Once captured, a primary click fires (source `click`), holding keeps automatic fire and releasing stops it. The click no longer brakes or frees the pointer; releasing the movement keys hovers, and Escape pauses and frees the pointer.
- R/F rise and descend and Shift toggles Surge as before. Aim assist uses the trackpad look source. No control needs a second finger.
- Escape, focus loss, a hidden page, resize, rotation and capture loss clear held fire and aim; keyboard auto-repeat never starts either.
- With the blaster off (`?shooter=0` or the setting), everything in the table above behaves exactly as first written: the captured click brakes and frees the pointer.
- Saved preferences now carry `controlsVersion` 2. A save from before it that still holds `free`, the old default, opens in this profile once; captured and Flow stay, and choosing free again is kept. PR #12 builds write no version, so a free chosen on purpose on a PR #12 preview also moves once (blaster on or off); it was never on main, and choosing free again sticks.
- Routing is pure in `src/ui/shooterKeys.ts`: `simplePrimaryPress` routes a press (ignore, fire, brake, engage), and `swallowsPress`, the capture-phase gate in `useShooterInput`, stops exactly the fire route before the flight surface sees it, so a press never both fires and brakes. Both hooks read one `readEnv`. Unit-tested in `tests/simple-click.test.ts`; browser checks are in `tests/shooter-desktop.spec.ts` and `tests/simple-trackpad.spec.ts` for both blaster states. Physical trackpad comfort is still unverified.

Normal keyboard flight uses the existing 13 m/s target; Surge uses 34 m/s. Capturing the pointer no longer forces Surge in this profile. Looking works without holding a click. Without pointer lock, drag to look or use arrow keys; Space and WASD remain available. Essential movement also has the existing optional tap controls.

Vertical scrolling, horizontal scrolling and inertia have no flight effect in this profile. Pinch zoom remains native and clears movement/capture. OS gestures still belong to the OS; the application does not claim to intercept them. Apple documents two-finger page navigation and configurable three/four-finger desktop gestures in its [gesture reference](https://support.apple.com/en-us/102482). Pointer lock provides relative movement without cursor edges, not ownership of those gestures ([Pointer Lock specification](https://www.w3.org/TR/pointerlock-2/)).

Click braking clears every movement channel and cancels landing. A key still physically held after braking cannot restart movement through autorepeat; release and press it again. Escape, focus loss, resize and capture loss clear inputs, and engagement always requires a new completed scene click. Dragging or a canceled press never launches. Capture rejection leaves the profile neutral and explains the drag/keyboard fallback.

The camera remains under its existing single writer. Movement stays outside React state. The [reviewed Research Vault guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md) and accepted input claim CLM-3D-011 informed this separation; neither establishes trackpad comfort.

## Verification

- TypeScript, unit/physics suite, production build and first-load budget: passed (231 tests).
- Production-preview browser suite: all 63 checks passed, including eight new simple-control scenarios and automated WCAG AA scans of entry, field guide, settings, tap controls and the retained Flow introduction. System Chrome 153.0.8010.53 on macOS 26.6.2, headless with Metal; desktop viewport 1440×1000 plus the suite's touch/rotation emulation. Synthetic pointer, key and wheel events establish application behavior, not physical trackpad ergonomics.
- Physical Mac trackpad, Safari, iPhone Safari, VoiceOver and subjective comfort: not validated by desktop automation. Repeat one-finger steering, release-to-hover, stop/restart, climb/descend, strafe, Surge and landing on the player's hardware before calling the controls intuitive.
