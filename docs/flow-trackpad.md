# Flow trackpad preview

Update 2026-09-21: physical playtest feedback reported browser/window gesture conflicts. [One finger + keyboard](simple-trackpad.md) became the default for new preferences (reversed on 2026-09-24: the free cursor is the desktop default again, see [DECISIONS.md](DECISIONS.md)). Flow remains an explicit scroll experiment; existing saved profiles are preserved.

2026-09-19. Built on the approved athletic explorer and reclaimed boulevard (`fbccf22`). Opt-in: existing saved profiles and the free-cursor default remain supported.

- `/?trackpad=flow`: Flow, including the skippable first-use introduction.
- `/?trackpad=free`: original free-cursor comparison.
- `/?trackpad=captured`: original captured-cruise comparison.

A comparison URL selects the requested profile while loading the existing checkpoint and other preferences. Profile selection uses the application's normal settings/checkpoint persistence. The introduction can be reopened from Flight settings.

## The movement language

Click the scene to capture the pointer. From the ground the suit lifts into hover; in the air it recaptures without thrust. Slide one finger to look, including while stopped. The character turns with the view. Two-finger forward strokes increase the selected speed, backward strokes reduce it through zero. The selected speed persists when the hand rests. A primary press brakes and cancels landing; looking stays available even while the press is held. Holding prevents wheel and keyboard thrust, and release never restarts. A secondary/two-finger click frees the pointer for Land, settings, and help. Escape pauses. Re-engagement always requires a new completed scene click.

The introduction checks the physical forward stroke because macOS scrolling preferences change the reported direction. It offers 0.5–2× looking sensitivity and a guided look/glide/brake sequence. A normal click delivers the full experience; deep pressure, gesture-symbol recognition, and custom trackpad haptics are not required.

## Implementation decisions

- Capture (`idle`, `requesting`, `engaged`) and propulsion are separate. A cancellation serial invalidates incomplete presses, while pending capture is guarded by generation, profile, and capture state.
- Normalized throttle u maps to `34 * (0.25*u + 0.75*u*u)` m/s. Browser wheel units are normalized, changes use gain .00125, and a stroke is capped at 160 normalized pixels. These units are not measured physical finger travel.
- Flow alone has precise nonzero movement intent; existing touch and classic deadzones remain unchanged. The camera writer, physics collision handling, body animation system, and camera horizon remain authoritative and unchanged.
- Tagged momentum is ignored. After a brake or capture, missing-metadata input requires 250 ms quiet and at least 12 accumulated forward pixels. Inertia tails postpone that quiet interval. Horizontal/nonfinite samples cannot arm the stroke. A tagged physical event can resume immediately; backward input at zero cannot disarm the guard.
- The metadata-absent fallback is heuristic. It is not a finger-contact detector or proof of universal Safari behavior. Calibrate and validate on physical hardware before promoting Flow.
- Flow wind uses a restrained smooth speed envelope. Muting, reduced motion, native zoom, keyboard alternatives, and canvas recovery remain available. Gesture recording stays local and includes selected speed, actual speed, capture, held state and event trust metadata where supplied.

## Physical acceptance — pending

Use the same trackpad, browser, viewport, graphics, checkpoint, and route for each profile. Record Mac model, trackpad type, OS/browser version, natural-scroll setting and tap/secondary-click settings. Test Chrome and Safari separately. Desktop automation does not establish physical trackpad comfort or iPhone validation.

1. Inspect a rooftop while hovering; look through a full turn without dragging.
2. Glide slowly along the facade, then trace a broad bank, climb, and dive.
3. Repeat stop → look → resume twenty times, including a brisk scroll immediately before braking.
4. Rest the hand while cruising. Reposition fingers without issuing an action.
5. Use secondary click to access Land and settings; cancel a landing with a press.
6. Test pinch zoom, tab switching, resize, Escape, and rapid capture/release/retry.

Record unintended launches, corrective strokes, and ratings from 1–7 for effort, confidence in stopping, and calm control. Targets: zero unintended launches; confidence and calm control >=6; effort <=2. These are targets, not measured results. Leave Flow opt-in until the physical checks support promotion.

## Evidence informing the design

- [Control-display gain research](https://gery.casiez.net/publications/HCIjournal2008-casiez.pdf): precision, overshoot and repositioning tradeoffs; mouse pointing evidence, not proof of trackpad flight comfort.
- [Touchpad force study](https://www.yorku.ca/mack/IEA00.pdf): a small early study of changing force during pointing; not a universal pressure-to-intent mapping.
- [Motion versus force pseudo-haptics](https://arxiv.org/abs/2311.15546): supports testing visual response and perceived weight; does not establish calming effects here.
- [Pointer lock](https://www.w3.org/TR/pointerlock-2/) and [Chrome momentum metadata](https://developer.chrome.com/release-notes/151#media-sensors-and-input): implementation mechanisms; feature detection and browser testing remain necessary.
- [Apple Force Touch](https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/SafariJSProgTopics/RespondingtoForceTouchEventsfromJavaScript.html): platform-specific capability, outside the required controls.

See [verification](reviews/flow-verification.md) for checks actually performed.
