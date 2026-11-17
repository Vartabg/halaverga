# Demon pipeline

See `docs/art/demon-asset/README.md` for licensing, runtime integration and rebuild commands.
`asset.json` records the exported model. `wing-source.glb` is the previous original enemy (commit 1f5392b),
retained as the immutable wing and eye-cue input so the new build can be repeated safely.

Bestiary Standard ZIP SHA256 (itch upload 18998851):
`94dbeed196b6ead9776c2ed0cfa02de818730886a25a507fb9d6c379bbbc4645`.
The source ZIP and 4K textures are not included.

Retired 2026-11-17 (docs/plans/2026-11-16-real-fight.md B9): the game now loads `public/models/archangel.glb` and
`public/models/watcher.glb` (scripts/real_bodies, art/real-bodies). The files this note describes were removed from the tree;
they remain in git history at 86482c2.
