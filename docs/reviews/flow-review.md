# Independent Flow movement review

2026-09-19. Muse CLI, pinned `muse-spark-1.3-contributor`, read-only scope: Flow input, runtime, motion, player and capture hooks. Confirmed `run.model.configured` and `run.terminal.completed`; no delegated edits. Codex inspected findings against source and owns integration/testing.

| Finding | Disposition |
| --- | --- |
| Capture error switches Flow to free cursor | Improved. Flow keeps its selection and exposes retry plus an explicit free-cursor fallback. The review's P0 severity and asserted browser cooldown were not established by its read-only review. |
| Stale incomplete press after external stop | Hardened using a cancellation serial; resize already remounts the input surface. Added interrupted-press and pending-request regressions. |
| Metadata-absent first stroke is gated after capture | Intentional. Capture is a neutral entry; conservative fresh-input gating avoids carrying an old scroll tail into it. Tagged physical events remain immediate. Documented fallback limits. |
| Ignored horizontal/nonfinite events alter quiet timing | Fixed. These events do not alter stroke timing. Tagged inertia still postpones quiet deliberately. |
| Tagged backward event at zero can disarm restart guard | Fixed and regression-tested. |
| Context-menu suppression missing | Not a defect: Experience already suppresses the scene context menu, outside the review's file scope. |
| No identical keyboard hover-release shortcut | Existing Escape/pause, semantic controls and keyboard alternatives satisfy the agreed scope. A new shortcut is not necessary. |
| Safari gesturestart ordering | Physical ordering remains unvalidated. The gesturestart path now explicitly brakes Flow before releasing capture, including canceling a takeoff in progress. |

Real hardware comfort, actual Safari momentum behavior and macOS gesture ownership remain physical playtest items, not claims made by this review.
