# Trackpad gestures: evidence and limits

Research date: 2026-09-11, America/Chicago. Scope: Halaverga desktop browser flight; Mac trackpads first, with Chrome and Safari tested separately. This supports the [experiment plan](../plans/2026-09-11-trackpad-maneuvers.md). Proposed mappings are design hypotheses, not established ergonomic findings.

## Current application

Inspected baseline: `5485737` (`codex/sleek-suit`). No runtime changes accompany this research.

- `src/ui/useTrackpad.ts`: primary click engages cruise; pressing again stops it. Pointer movement steers during cruise; dragging while hovering looks around. Vertical wheel events change throttle. Control/Command-wheel and Safari `gesturestart` stop cruise and preserve native zoom.
- `src/game/trackpadFlight.ts`: normalized wheel delta changes throttle per event, capped to a 100-pixel contribution. Cruise requests span 3–34 m/s; restart uses 8 m/s.
- `src/game/Player.tsx`: edge steering continues every physics step from the most recent edge value. It does not know whether the user's finger is still on the trackpad.
- `src/game/runtime.ts`: trackpad currently contributes forward motion, not independent strafe or vertical input. Keyboard and accessible tap controls already demonstrate those movement axes.
- `src/world/Suit.tsx`: torso, head, two whole arms and two whole legs. Bent-elbow and bent-knee poses require additional articulation.

Two design risks follow from the code, but have not been reproduced with physical gestures in this research: momentum wheel events can continue changing throttle; a stationary cursor at an edge can keep turning after a finger lifts. Existing synthetic browser tests deliberately confirm the latter behavior. Changing it requires revising that contract explicitly.

## What the browser can expose

| Physical action | Useful browser signal | Assessment |
| --- | --- | --- |
| Slide one finger | Pointer movement, ordinarily a mouse-like pointer | Suitable for continuous steering. No reliable physical finger coordinates. |
| Click, or tap with tap-to-click enabled | Primary button sequence | Suitable for flight/hover. A light tap is dependent on the user's OS setting. |
| Press, move, release | Pointer/button sequence and capture | Suitable for an optional deliberate command; holding fatigue needs testing. |
| Double click | Click count and `dblclick` | Observable, but conflicts with immediate single-click braking if assigned another action. |
| Two-finger vertical movement | Wheel Y deltas | Suitable for throttle, with normalization and momentum handling. |
| Two-finger horizontal/diagonal movement | Wheel X/Y deltas, if delivered | Experimental: navigation gestures and axis mixing can conflict. |
| Two-finger click | Secondary button/context-menu events when configured | Optional contextual shortcut; browser menu must remain normal outside the scene. |
| Pinch | Chromium Control-wheel; WebKit has proprietary gesture events | Preserve browser zoom. It is not an extra reliable throttle axis. |
| Rotate two fingers | Some WebKit gesture-event implementations | Browser-specific research only; not a portable core control. |
| Force click | Proprietary WebKit force events on supported hardware | Optional Safari experiment, not a Chrome prerequisite. |
| Three/four-finger and edge swipes | Often consumed by macOS | Exclude from required play. |
| Lift a finger without clicking | No portable raw contact-end stream | Cannot promise phone-style release-to-hover. |
| Rest two fingers independently | No portable per-finger trackpad stream | Cannot reuse the phone's independent two-thumb controller. |

The current Pointer Events work and the working group's raw-trackpad discussion do not establish a portable per-contact trackpad API. Keep the user's explicit control-mode selection; do not infer hardware from fractional deltas or `pointerType` alone. [Pointer Events](https://www.w3.org/TR/pointerevents3/), [raw trackpad discussion](https://github.com/w3c/pointerevents/issues/206), [device distinction discussion](https://github.com/w3c/pointerevents/issues/596).

Apple documents configurable click, scroll, zoom and system gestures. In particular, horizontal two-finger swipes can navigate pages, while larger finger combinations invoke desktop/app functions. Our exclusion of these as core game commands is a product decision based on those conflicts. [Apple gesture reference](https://support.apple.com/en-gb/102482).

## A recent improvement: momentum detection

Chrome 151 introduced `WheelEvent.momentum`, identifying events synthesized for scrolling inertia. The current Pointer Events editor's draft includes it. Feature-detect it and discard `momentum === true` for flight commands; do not merely add another hand-tuned decay threshold. [Chrome 151 release notes](https://developer.chrome.com/release-notes/151#media-sensors-and-input), [current draft](https://w3c.github.io/pointerevents/#dom-wheelevent-momentum).

Local capability probe on 2026-09-12T00:35:36.740Z:

| Environment/property | Result |
| --- | --- |
| System Chrome | 152.0.7977.83 |
| macOS | 26.6.2 |
| Runtime | Playwright launching installed system Chrome, headless |
| `'momentum' in WheelEvent.prototype` | true |
| `new WheelEvent('wheel', { momentum: true }).momentum` | true |
| `requestPointerLock` on `Element.prototype` | present |
| `GestureEvent` global | absent |
| `webkitForce` on `MouseEvent.prototype` | absent |
| Physical trackpad event recording | not performed |

This verifies API exposure and synthetic construction, not trusted hardware behavior or comfort. Safari support was not measured; an open WebKit standards-position issue is not proof of shipping support or absence. [WebKit discussion](https://github.com/WebKit/standards-positions/issues/688).

Without a verified momentum signal, timing/decay classification remains heuristic. Use capped changes, explicit click-to-brake, a fresh-input gate after interruptions, and a non-wheel speed control. Never treat absent momentum metadata as proof that fingers are down. Momentum tagging also does not provide a general finger-lift event for one-finger steering.

The older split Wheel Events document explicitly says it is an outdated snapshot. Use the current editor's draft for the evolving interface; check actual browsers before depending on it. Wheel units and deltas reflect platform settings, not physical finger distance. [Current wheel interface](https://w3c.github.io/pointerevents/#wheelevent-interface).

## Browser ownership and escape

- Pointer capture retains drag routing; it does not remove screen edges. Pointer lock supplies relative movement without a screen boundary. Captured cruise is therefore a useful comparison, provided a primary click immediately brakes and releases capture, with Escape remaining available. Handle rejection and never auto-relock. [Pointer Lock 2.0](https://www.w3.org/TR/pointerlock-2/).
- Chromium's pinch-to-Control-wheel conversion is documented in its implementation history. Preserve the modifier exclusion already in the app. The historical source explains the mechanism, not current support on every platform. [Chromium change](https://chromium.googlesource.com/chromium/src/+/621b3fe4c2e9821e396163f2e1cdfa2b3ffa320f%5E%21).
- Apple's archived Force Touch documentation describes pressure-related events, not a portable way to program arbitrary trackpad haptic patterns. Do not promise custom web haptics. [Apple Force Touch documentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/SafariJSProgTopics/RespondingtoForceTouchEventsfromJavaScript.html).
- Scoped wheel cancellation and `overscroll-behavior` can help contain scrolling. Neither is a claim to own all OS gestures. Test navigation with real history entries and each browser. Never use fullscreen, a PWA, or pointer capture as evidence that OS gestures are disabled. [Chrome overscroll guidance](https://developer.chrome.com/blog/overscroll-behavior).

## Gesture design evidence

Apple's guidance favors clear, discoverable custom gestures, immediate feedback and familiar alternatives. It specifically allows specialized interactions for games, but calls for real-use testing. This supports a small core vocabulary and optional practice for advanced moves. It does not establish that a particular Halaverga mapping is enjoyable. [Apple gesture design](https://developer.apple.com/design/human-interface-guidelines/gestures/).

For future drawn symbols, the $1 recognizer is a compact research-backed starting point for a prototype. Recognition accuracy depends on the selected shapes and users; the published results cannot be claimed for trackpad flight. Start with direction and duration thresholds; only evaluate template recognition after an explicitly armed stroke proves useful. Direction/rotation invariance can erase distinctions such as left/right or clockwise/counterclockwise, so preserve them when meaningful. [$1 research and implementation](https://depts.washington.edu/acelab/proj/dollar/index.html).

Essential actions need simple pointer alternatives to dragging/path gestures, plus the project's keyboard and semantic access. Commit launch/landing/optional commands on release with cancellation. Braking can begin immediately as a reversible protective response. [WCAG dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements), [pointer cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation).

## Local guidance and confidence

Research Vault trust audit passed; the focused retrieval returned no matching gesture claims. [Current 3D guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md) is **reviewed** and remains the architectural baseline: one camera writer, cancellable transitions, per-frame state outside React, honest device measurements. It does not cover character rigging or establish trackpad ergonomics.

Confidence: high in inspected application behavior and the recorded Chrome capability probe; source-supported but browser-dependent for gesture APIs; unvalidated for proposed gesture comfort, maneuver recognition and physical response latency.
