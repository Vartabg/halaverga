# Fitted reconnaissance suit

Replace the primitive suit with an original, slim anatomical silhouette: tapered limbs, a fitted waist, sculpted ceramic panels over graphite fabric, a wraparound visor and a flush segmented power spine. Preserve the six-part animation contract and fit its pivot positions to the new anatomy. Keep the player collider, camera, input behavior and city palette, without adding interface controls.

- [x] Rebuild `scripts/build-suit.py` with reusable mesh helpers in `scripts/suit_mesh.py`; export `public/models/suit.glb` with explicit articulation metadata and material finishes.
- [x] Update `src/world/suitGeometry.ts` and `src/world/Suit.tsx` to batch by articulation/material while retaining roughness and emission, with owned-resource cleanup. Add asset/assembly regression checks in `tests/suit.test.ts`.
- [x] Inspect the actual browser model from front, rear and in flight, including narrow and reduced-quality views. Run movement, composition, recovery and accessibility regressions. Record a bounded desktop rendering sample and its actual scope.
- [x] Update `docs/verification.md`, record the actual model study and prepare the dedicated playtest deployment.

Delivery gates: the task-lifecycle command runs the full browser suite, secret scans, commit and push. Then deploy the existing Vercel playtest, verify the hosted model and stop the local preview. Completion is recorded by the tool results. Physical iPhone performance and subjective fit remain playtest gates.
