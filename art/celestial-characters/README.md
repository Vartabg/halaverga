# Celestial characters

Original character revision for the War in Heaven direction. This replaces the first
slice's primitive armour, extruded wing fans and icosahedron/cone adversary.

- `public/models/angel.glb`: fitted warrior, nine material batches, 78,000 triangles,
  2,256,012 bytes. The original 21 named bones and calibrated flight/aim heads are retained.
- `public/models/abyssal.glb`: original anatomical adversary, curved ridged horns,
  recessed mouth and teeth, talons, back scutes, a tail and tensioned curved membranes.
  23,827 triangles including eyes and both wings; 546,900 bytes. Runtime merges the
  keratin and membranes into four pooled body/armour/wing batches plus an eye batch.
- `characters.blend`: editable delivered geometry and the warrior's flight rig.
- `asset.json`: exported sizes, hashes and per-mesh counts.

The anatomy derives from the already approved, unchanged
`art/parker-anatomy/character.blend`. Its base is **Body Male – Realistic**, Dan Ulrich,
Blender Studio, CC0, documented in `docs/art/fidelity-proof/PROVENANCE.md` and
`docs/art/athletic-character/README.md`. No new downloaded mesh or texture is used.
The armour, regalia, hair, feathers, demon modifications and surface maps are original.
The old `public/models/suit.glb` remains as the archived anatomy/flight calibration fixture.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/celestial_characters/build.py
node scripts/review-celestial-characters.mjs
```

Factory startup avoids running the user's Blender add-ons. The exporter never writes
the approved source. Modules in `scripts/celestial_characters` hold the authored build;
rerunning the build replaces the exported geometry, so edit those modules for persistent
procedural changes. Direct edits to the delivered blend are reviewable, but must be
ported into the build before rerunning it.

The warrior has a visible face and eyes, but no expression rig. The adversary has pooled
wing articulation and procedural breathing/limb flex; it does not have an authored
skeletal attack library. Cloth has modeled pleats and subtle shader movement, without
simulation or cloth collision. These are current limits, not claims of finished AAA art.
