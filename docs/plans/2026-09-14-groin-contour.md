# Localized groin contour correction

Goal: remove the unintended concavity in the existing offline Blender proof.
The original fit clamps front pelvis depth near 0.065 m while adjacent mesh
depth is near 0.12 m. Add a reversible local corrective shape key that blends
the depressed area into the surrounding fitted-suit contour. Preserve topology,
all other character components, the prior comparison passes and every game file.

- [x] Add and run a regression test on the saved proof; confirmed failure before the fix (missing correction key).
- [x] Apply the localized correction with `scripts/fidelity_proof/groin.py` and save `art/fidelity-proof/character.blend`.
- [x] Render identical before/after close-ups and refresh comparisons under `docs/art/fidelity-proof/groin-fix/`, keeping `pass-0/` through `pass-2/` unchanged.
- [x] Verify saved file and localized depth change (57 vertices), unchanged topology/runtime, 54 unit tests, typecheck, build and three browser/accessibility tests. Submit through task-lifecycle; its command output is completion authority.

Code changes are limited to the new correction/test scripts and output-folder
selection in `render.py`, `compare.py`, `verify.py`. Documentation records this
explicit user-requested local follow-up, not another broad character pass or
an assertion that the earlier likeness problems have been solved.
