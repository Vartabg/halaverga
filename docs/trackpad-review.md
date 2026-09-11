# Trackpad input review · 2026-09-11

The requested desktop experience must work without a keyboard. A regular click engages forward cruise; a second click brakes. Pointer movement steers, with continued turns at the scene edge. A click-and-drag while stationary only looks, allowing the player to aim at a landing surface. Vertical scrolling adjusts cruise speed. Trackpad is the saved default; captured mouse plus keyboard remains an explicit alternative.

## Input contract

Browsers expose pointer categories such as mouse, pen and touch, rather than reliable physical trackpad finger identities. This implementation uses the pointer and wheel events available to desktop pages; it does not claim phone-style independent fingers on the trackpad. [MDN PointerEvent.pointerType](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType)

The wheel listener is non-passive and limited to the active scene. It normalizes pixel/line/page deltas, caps each event's contribution, ignores horizontal-dominant input for throttle, and leaves Control/Command wheel events uncancelled. Safari gesture-start events also stop cruise without cancelling native zoom. Native wheel scrolling is unaffected in dialogs. Browser/OS scroll direction and inertia still need a physical trackpad playtest. [MDN wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)

## Source review

1. Hard constraints: no API, credential, dependency, network, asset or Canvas ownership changes. The existing error boundary and graphics recovery remain in place. The lifecycle command supplies staged and full-history secret gates before push.
2. Behavior: both input methods feed the same motion controller; existing clearance and landing validation remain authoritative. Cruise restarts at 8 m/s and scroll requests remain between 3 and 34 m/s. Moving onto HUD controls stops cruise before a Land request can be cancelled by stale forward intent. Pause, resize, touch handover, zoom and pointer cancellation clear it. Normal pointer-capture release after a click is distinguished from cancellation, so cruise stays engaged.
3. Quality: one camera writer, transient input in refs/runtime, no pointer-move or wheel React state updates, scoped listener cleanup, saved desktop preference but unsaved flight activation, and caught mouse-capture promise failures. Changed source modules remain below 200 lines. New browser cases use system Chrome and never the bundled test browser.

The first landing regression aimed at a tilted debris edge after forward travel. The cursor sequence was adjusted to look farther down at the flat terrace, preserving the same surface-validation rules as touch and keyboard. Physical trackpad comfort, Safari gestures and VoiceOver remain open in `TECH_DEBT.md`. Earlier performance reports belong to their recorded source hashes.
