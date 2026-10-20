# New angel, dive strike and compact wings

Integration base: `codex/angel-asset` at `1f5392b`, which already contains
`9731da9` (the dive strike) by ancestry. No duplicate merge or second player
movement writer is needed. The CC0 model, provenance and library animations
remain those recorded in `docs/art/angel-asset/PROVENANCE.md`.

Each complete wing skin and skeleton is scaled to 0.62 of its previous size,
about 38% less span excluding the unchanged shoulder spacing. Scaling happens
at each wing root, so the skin-derived collision envelope sees the same shape
as the renderer. The chest attachment itself remains unscaled.

During a sword dive the wings sweep back toward a 0.72 fold with a fast close
and slower reopening. Obstacle clearance can fold them further. Pause freezes
the fold, and reduced motion applies the essential pose directly. This is a
gameplay silhouette choice, not a biological claim about humanoid flight.

`tests/compact-wings.test.ts` measures actual skinned vertices, verifies the
span reduction and strike fold, and checks pause/reopening. The stone fixtures
in the clearance tests are brought closer to keep exercising folding with the
shorter wings. `tests/angel-strike-integration.spec.ts` loads the model, strikes
a live demon, checks dive speed and contact, and finishes banishment.

Physical iPhone Safari validation remains outstanding. Desktop/browser checks
cannot establish whether the phone feels responsive or looks good to Garo.

Verification on 2026-10-20: type check, 201 unit files / 2,435 tests,
production build and first-load/vote-build checks pass. The first-load script
reports 629.0 KB within its 629 KB limit. The combined live-demon browser test
passed, including the new-model load, dive speed above 40 m/s, contact and
banishment. See `dive.png` for its captured frame. No phone performance claim
is made.

All 25 selected Playwright gameplay, graphics recovery, wing clearance and
automated accessibility cases pass on system Chrome, including emulated
portrait and landscape touch layouts.
