# Angel asset

`public/models/angel.glb` is built from four Quaternius CC0 packs by `scripts/angel_asset/build.py`. Sources, hashes,
licence and every change: `docs/art/angel-asset/PROVENANCE.md`. Options and decision: `docs/plans/2026-10-20-character-assets.md`.

The packs (about 500 MB) are not committed. Download the free [Standard] zips listed in the provenance file, extract each
into one folder (each zip holds one top-level folder), then from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python scripts/angel_asset/build.py -- --packs <folder>
node scripts/review-angel-asset.mjs
```

The build rewrites `public/models/angel.glb` and `art/angel-asset/asset.json` (bytes, sha256, triangles, materials,
textures, clips). The review renders the GLB through the game's own rig, wings, regalia and clip sampler into
`docs/art/angel-asset/review.png`.

Modules: `packs.py` (files and kept pieces), `rest.py` (the game rest stance), `assemble.py` (trim, reweight, skeleton,
join), `textures.py` (downscale and recolour), `retarget.py` (clips onto the 21 bones), `glbclips.py` (clips into the GLB).

`scripts/celestial_characters/build.py` still writes the old procedural angel to the same path; run it only to rebuild
`abyssal.glb`, then restore the angel with this build.
