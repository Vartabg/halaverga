# Reference fidelity proof

Approved scope: an offline gray Blender study, not a replacement game character.

- [x] Verify official Blender Studio human base meshes v1.1.0 in Blender 4.0.2 and record license/source hash.
- [x] Lock the original concept, annotate front/profile/back landmarks and document inconsistent views.
- [x] Preserve the base topology and attempt full-body proportional fitting; concentrate detail work on head and upper torso. Visual match not achieved.
- [x] Render an initial construction and two correction passes. Show full-body comparisons, bust views and transparent silhouette overlays from actual geometry.
- [x] Reopen the final Blender file; verify packed references, source topology, consistent meshes across views and unchanged runtime files. Record mismatches for human judgment.
- [x] Run repository checks: typecheck, 54 unit tests, production build and 32 browser/accessibility tests. Submit isolated proof branch through task-lifecycle; command output is the completion authority.

New files are limited to `scripts/fidelity_proof/`, `art/fidelity-proof/`, `docs/art/fidelity-proof/`, and this plan. `public/models/suit.glb`, `src/`, the old authoring scripts and the active preview remain untouched.

No rig, final textures, image-generation enhancement, game export, runtime budget or deployment is part of this proof. A successful file audit is not a likeness verdict. The owner decides whether the visual proof succeeds.

Stopping rule reached: construction + two corrections. Author assessment is
that the approach has **not demonstrated the required quality**. The proof is
retained for inspection, not promoted to a finished game character. See
`docs/art/fidelity-proof/README.md` for the actual shortcomings.
