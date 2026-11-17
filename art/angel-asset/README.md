# Angel asset

`public/models/angel.glb` (retired: see the end of this note) was built from four Quaternius CC0 packs by
`scripts/angel_asset/build.py`. Sources, hashes, licence and every change: `docs/art/angel-asset/PROVENANCE.md`. Options and
decision: `docs/plans/2026-10-20-character-assets.md`.

The packs (about 500 MB) are not committed. Download the free [Standard] zips listed in the provenance file, extract each
into one folder (each zip holds one top-level folder), then from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python scripts/angel_asset/build.py -- --packs <folder> --out <file.glb>
node scripts/review-angel-asset.mjs <file.glb> <review.png>
```

The build writes the GLB to `--out` and its report (bytes, sha256, triangles, materials, textures, clips) beside it as
`<file>.json`; `art/angel-asset/asset.json` is the report of the last angel.glb the game loaded. The review renders a GLB through
the game's own rig, wings, regalia and clip sampler (with no arguments it reviews archangel.glb).

Modules: `packs.py` (files and kept pieces), `rest.py` (the game rest stance), `assemble.py` (trim, reweight, skeleton,
join), `textures.py` (downscale and recolour), `retarget.py` (clips onto the 21 bones), `glbclips.py` (clips into the GLB).

Retired 2026-11-17 (docs/plans/2026-11-16-real-fight.md B9): the game now loads `public/models/archangel.glb` and
`public/models/watcher.glb` (scripts/real_bodies, art/real-bodies). The files this note describes were removed from the tree;
they remain in git history at 86482c2.
`scripts/angel_asset/` stays: `scripts/real_bodies/` imports its pack loader, rest pose, assembly names and retargeting.
