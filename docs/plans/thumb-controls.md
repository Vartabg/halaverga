# One-thumb flight and mobile Chrome gesture correction

The current user correction replaces the original split movement/look regions and separate mobile Surge button. The world, discovery, camera choices and desktop controls remain part of the first-flight study.

- [x] Use one touch anywhere in the open scene: hold to lift/cruise, slide to aim, increase speed gradually with drag distance, release to hover. A short tap must not launch.
- [x] Keep turning at the screen edge so a single contact can change heading without a second thumb.
- [x] Remove the Surge button and the two-region labels. Keep the contextual Lift/Land action and optional accessible tap controls.
- [x] Clear held input on cancellation, lost capture, pause, orientation change and a second contact. Preserve pinch zoom and field-guide text interaction.
- [x] Suppress text selection and long-press callouts across the game HUD and the spaces around buttons. Restore normal text interaction inside dialogs.
- [x] Verify acceleration, release braking, both perspectives, either thumb, quick taps, held button edges, rotation, cancellation, desktop and accessibility regressions.

Implementation keeps camera ownership in CameraRig and input/movement outside React state. The single-contact hold uses a 180ms threshold; an 8px drag activates immediately. Small aiming corrections stay at 8m/s; farther drags smoothly approach the existing 34m/s collision-tested cap. The speed curve has no toggle state.

Ship as a revision of the existing Vercel test project. The earlier immutable deployment remains available for comparison. Actual iPhone feel, native Chrome callout suppression and VoiceOver remain the device review gates recorded in TECH_DEBT.md.

Browser gesture implementation references: [user-select](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/user-select), [-webkit-touch-callout](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-touch-callout), and [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
