# Trackpad comparison and articulated flight review

This increment implements the first comparison from the gesture plan: free-cursor and captured cruise, bounded scroll handling, and expressive suit poses. It does not introduce physical rolls, automatic orbits, loops, or a new collision path.

## Controls

Flight settings offers A · Free cursor and B · Captured steering. Both use the same movement controller and speed setting. A is the default. B locks the flight surface after a deliberate click and begins cruise only after capture is granted. A primary press brakes and releases the pointer; unexpected capture loss pauses. A failed capture returns to free steering. Pending grants are invalidated by cancellation, pause, resize and unmount.

Free-cursor edge turning now fades over 120–280 ms after pointer events stop. The former sustained behavior remains a clearly labeled comparison option. This timeout is not physical finger-lift detection. Captured steering has no edge-turn input. Neither mode changes the one/two-thumb controls.

Vertical wheel input is normalized, with a 160-pixel accepted budget per stroke, a 180 ms quiet interval and immediate direction reversal. Large versus partitioned events produce the same bounded change. Verified momentum events are ignored. Older browsers use a conservative quiet-window gate after stopping; physical Safari tuning remains open. Reverse direction and a 3–34 m/s starting-speed control are saved locally; the default remains 8 m/s.

An opt-in local recorder stores the latest 6,000 input records and exports JSON. It includes the browser, settings, available momentum signal, input deltas and resulting speed/throttle. It is not remote analytics or proof that a gesture was performed physically.

## Character and camera

The authored suit now contains ten articulated parts: torso, helmet, upper arms, forearms, thighs and lower legs. Rounded overlapping joint seals support bending. Parent groups keep forearms and shins attached. Materials and geometry are owned by each assembled rig; the loader's source model is untouched.

The leading-fist power pose, bent trailing arm, directional banks, asymmetric hover and brake poses blend from resolved flight presentation. Climb/dive posture follows actual velocity. Hover and landing return the feet beneath the body. Water skimming uses the existing clearance behavior; no new wake or water physics is added. One camera writer retains the stable horizon. Classic poses remain selectable, and reduced motion softens the added articulation.

The [actual pose study](images/flight-poses.png) is rendered with the runtime rig and joint-pose helper. Reproduce it using `node scripts/review-flight-poses.mjs` with the managed production preview on port 3366. This is a model study, not a screenshot of terrain gameplay.

The [asset report](performance/flight-expression-asset.json) records 262,772 bytes, 12,402 triangles, 39 material/part batches and ten parts. The additional joints raise the batch ceiling from 30 to 40; triangle/byte/proportion limits remain enforced. Prior performance reports describe their own source hashes.

## Review passes

1. Hard constraints: no API, credential, dependency, scene, collider or camera-owner changes. Canvas error handling is retained. Lifecycle staged/history scans are required before push.
2. Behavior: input tests cover momentum, event partitioning, reverse direction, edge fade, capture failure, delayed grants, click-to-release and resume. Asset tests cover joint attachment, outward visible plates, fit, budgets and cache-safe disposal. The persistence test initially reset storage on every page reload; its fixture now seeds only empty storage.
3. Quality: new modules remain under 200 lines. Per-frame joint state stays outside React; pose helpers allocate no groups inside the frame loop. Native form controls, recorded physical-review gaps, cleanup and explicit cancellation remain part of delivery.

## Verification

- Type checking, 47 unit/physics/model checks and production build pass.
- All 30 full-suite browser/accessibility cases pass, followed by one additional passing local-recorder/captured-zoom case (31 cases total). Coverage includes phone portrait/landscape, two-thumb handoffs, cancellation, graphics recovery, landing, first/third-person captured steering, capture failure/races, persisted preferences and automated accessibility scans.
- The [93-second desktop rendering sample](performance/flight-expression-mac-chrome.json) on Apple M2 Max / headless system Chrome 152, 1440 × 1000, DPR 1, high quality, third person and Surge recorded 5,565 frames: median 16.7 ms, p95 17.4 ms, no stalls over 50 ms and no browser errors. Peak rendering was 45 draw calls and 90,688 triangles. It uses scripted keyboard flight to exercise the shared pose/rendering path; it does not validate physical trackpad gestures or certify the five-minute iPhone target.
- Physical Mac trackpad comfort, trusted momentum behavior, Safari capture, VoiceOver and iPhone performance remain open in [TECH_DEBT.md](TECH_DEBT.md).
