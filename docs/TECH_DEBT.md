# Release gates requiring physical review

These are explicit limitations of the playtest candidate, not completed checks.

| Gap | Affected users | Owner | Mitigation | Target |
|---|---|---|---|---|
| Physical iPhone 15-or-newer Safari performance, heat, one-thumb ergonomics, long-press selection suppression and actual orientation changes | Mobile players | Garo as device tester; Codex handles fixes | Low graphics tier, touch/browser regression tests, downloadable timing report | First on-device review after delivery; before public launch. Date depends on device-test availability. |
| VoiceOver and physical iPhone Safari zoom/contrast checks | Screen-reader and low-vision users | Codex with device tester | Native HTML guide and dialogs, keyboard controls, reduced camera motion, automated AA scans | First accessibility device review; before public launch. |
| Subjective comfort, visual quality and enjoyment | All players | Garo and Codex | Small replayable route, camera/quality choices, easy pause and reset | First playtest feedback cycle. |
| Active flight uses `touch-action: none` to distinguish independent movement/look fingers from browser pinch. In-flight native zoom requires pausing first. Physical Safari handoff, zoom after pause, finger crossing and accidental-contact ergonomics remain unverified. | Mobile players, including players needing magnification | Codex with Garo as device tester | Native pinch in paused UI/guide; no viewport zoom restriction; keyboard and single-tap alternatives; automated real Chrome touch sequences | First Safari review after this revision; before public launch. |

The release date is not set. Do not describe this preview as fully accessibility-certified or iPhone-performance-validated.
