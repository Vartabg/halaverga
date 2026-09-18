# Reference-led explorer · 2026-09-14

The character is rebuilt in Blender from a generated front/profile/back concept and a matching facial projection reference. The long torso/short legs are corrected; shoulders, elbows, hips and knees now follow a roughly 7.66-head-tall silhouette. Hands and boots are modestly sized. Graphite fabric, fitted silver armor, muted copper seams and green insets replace the exaggerated rounded assembly.

## Deliverables and visual evidence

- [Editable Blender source](../art/halaverga-explorer.blend): 71 separate mesh objects, ten weighted joints, the packed concept/portrait and both packed atlases. Opening the saved file in Blender verified the retained objects, bones and images. The runtime export merges to eight material primitives.
- [Generated concept and exact prompt](art/explorer-reference-prompt.md), [generated portrait and exact prompt](art/explorer-face-prompt.md). These are design references, not evidence of the playable model's fidelity.
- [Actual exported model, front/profile/back](images/reference-hero-blender.png) and [face close-up](images/reference-hero-face.png), rendered by re-importing the game GLB into Blender.
- [Six actual playable-rig views](images/reference-hero-poses.png): front, profile, back, chase hover, power flight and banking. This system-Chrome harness uses the real rig and pose helpers and asserts both embedded PNGs decode.
- Live local in-app-browser inspection confirmed the explorer renders on the arrival terrace with the normal controls.

The first uncolored face read as a mannequin. A vertex-color projection then visibly smeared facial detail and was rejected. The final version projects the generated portrait onto a sculpted head using compact skin/hair atlases. It is a lightweight stylized interpretation, not a high-resolution cinematic character; fingers, side/rear head detail and hair remain simplified, and there is no facial animation.

## Verification

- `pnpm verify`: TypeScript, all 54 unit/physics/model tests and the production build passed.
- `PLAYTEST_URL=http://127.0.0.1:3367 pnpm test:browser`: all 32 browser/accessibility checks passed, including rapid turns, flight composition, both cameras, adaptive touch, trackpad, recovery, orientation and automated AA checks.
- New regression coverage checks limb ratios, head/boot scale, exported-vs-runtime joint positions, normalized skin weights, continuous body geometry, atlas/UV bindings and asset budgets. Shared loader-owned textures now also have a no-disposal regression.
- Node asset tests substitute texture metadata because Node does not decode browser images. Actual texture decoding is checked by the Chrome pose harness and the live game, not claimed from those unit tests.
- [Asset report](performance/reference-hero-asset.json): 749,448 bytes, 19,514 triangles, eight material batches and ten joints. Skin/hair atlases are 256×256 and 128×128 PNGs embedded in the GLB. Transfer/decoding increases from the earlier untextured asset; no separate texture HTTP requests are introduced. The tested ceiling is 850 KB / 20,000 triangles / eight batches.
- [93-second desktop sample](performance/reference-hero-mac-chrome.json), with [actual gameplay capture](images/reference-hero-flight.png): Apple M2 Max, headless system Chrome 152 / ANGLE Metal, 1440×1000, DPR 1, high quality, third person, Surge enabled. Across 5,563 active frames: median 16.7 ms, p95 17.5 ms, zero intervals over 50 ms and zero browser errors. Main-render peaks: 14 draw calls, 97,800 triangles, 13 geometries and seven textures. This measures desktop frame intervals, not GPU time or iPhone performance. No concurrent render/build/browser-test workload ran during the sample; the in-app game was paused. A brief Blender source-file metadata check ran during startup.

## Review boundaries

The only runtime source change is the joint-pivot map. Movement, collision, camera ownership, control semantics and recovery remain unchanged. Blender and runtime pivots are checked together. Assembly retains ownership of cloned geometry/materials/skeletons while source textures stay cached. No dependency, external service, credential or production deployment is added. The Blender source is excluded from deployment uploads.

The reviewed Research Vault 3D guidance informed single-camera ownership, resource lifecycle checks and separate desktop/device evidence; it does not supply Blender anatomy guidance. Physical iPhone Safari performance, VoiceOver, heat and subjective character approval remain unverified. Automated AA scans and desktop viewport tests do not close those gates.

## Portrait side fix · 2026-09-17

The bake mapped model +X to portrait image-right. The head faces +Y in Blender (−Z in three.js), so +X is the explorer's own right, which a front portrait shows on image-left. Both atlases were mirrored, putting the portrait's forelock over the explorer's left brow. `scripts/hero_color.py` now samples `.501-x*3.22`. The rebuild changes only the two atlas images; triangle sets, winding, batches, joints and atlas sizes match the previous export, and the GLB is 749,448 bytes. The Blender renders above, the packed `.blend` atlases and the asset report are regenerated (the report also refreshes the `suitGeometry.ts` hash, stale since `b4c76f9`). A three.js front close-up of the playable rig confirmed the corrected side against the old GLB. `pnpm verify` (61 tests), the pose review and all 34 browser/accessibility checks passed against a production preview; the desktop performance sample was not re-run.
