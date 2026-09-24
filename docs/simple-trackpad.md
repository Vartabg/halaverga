# One finger + keyboard

2026-09-21. The player reported that two- and three-finger trackpad actions interfered with browser and window actions. The recommended controls now require only ordinary pointer movement, primary clicks and keys. This implements the keyboard alternative; physical comfort remains to be retested.

Open `/?trackpad=simple` or choose **One finger + keyboard** in Flight settings. New preferences default to this profile. Saved free-cursor, captured-cruise and Flow preferences remain intact, and the comparison URLs remain available.

| Action | Control |
| --- | --- |
| Lift into hover and look freely | Click the open scene |
| Look / steer, including while hovering | Slide one finger |
| Forward / backward | Hold W / S |
| Move sideways | Hold A / D |
| Rise / descend | Hold R / F |
| Return to hover | Release movement keys |
| Toggle Surge while moving | Shift |
| Lift / assisted landing | Space, or the Lift / Land button |
| Brake and free the pointer for buttons | Primary click |
| Pause and free the pointer | Escape |

Normal keyboard flight uses the existing 13 m/s target; Surge uses 34 m/s. Capturing the pointer no longer forces Surge in this profile. Looking works without holding a click. Without pointer lock, drag to look or use arrow keys; Space and WASD remain available. Essential movement also has the existing optional tap controls.

Vertical scrolling, horizontal scrolling and inertia have no flight effect in this profile. Pinch zoom remains native and clears movement/capture. OS gestures still belong to the OS; the application does not claim to intercept them. Apple documents two-finger page navigation and configurable three/four-finger desktop gestures in its [gesture reference](https://support.apple.com/en-us/102482). Pointer lock provides relative movement without cursor edges, not ownership of those gestures ([Pointer Lock specification](https://www.w3.org/TR/pointerlock-2/)).

Click braking clears every movement channel and cancels landing. A key still physically held after braking cannot restart movement through autorepeat; release and press it again. Escape, focus loss, resize and capture loss clear inputs, and engagement always requires a new completed scene click. Dragging or a canceled press never launches. Capture rejection leaves the profile neutral and explains the drag/keyboard fallback.

The camera remains under its existing single writer. Movement stays outside React state. The [reviewed Research Vault guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md) and accepted input claim CLM-3D-011 informed this separation; neither establishes trackpad comfort.

## Verification

- TypeScript, unit/physics suite, production build and first-load budget: passed (231 tests).
- Production-preview browser suite: all 63 checks passed, including eight new simple-control scenarios and automated WCAG AA scans of entry, field guide, settings, tap controls and the retained Flow introduction. System Chrome 153.0.8010.53 on macOS 26.6.2, headless with Metal; desktop viewport 1440×1000 plus the suite's touch/rotation emulation. Synthetic pointer, key and wheel events establish application behavior, not physical trackpad ergonomics.
- Physical Mac trackpad, Safari, iPhone Safari, VoiceOver and subjective comfort: not validated by desktop automation. Repeat one-finger steering, release-to-hover, stop/restart, climb/descend, strafe, Surge and landing on the player's hardware before calling the controls intuitive.
