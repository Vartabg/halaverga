# Athletic anatomy in the playable character

The anatomy approved in the preceding review now replaces `public/models/suit.glb`.
The developed shoulders, tapered waist, torso depth, and anatomical limbs are present
in the actual third-person flight character. This stage retains the approved graphite
undersuit and neutral head, hands, and feet. Face identity, hair, boots, gloves, armor,
and final texture work remain later art stages; this is not a finished AAA character.

![Actual game rig in front, side, rear and flight poses](poses.png)

## Asset and rig

- **41,200 triangles**, three material batches, 21 bones, at most four influences per vertex.
- **1.46 MB GLB**, embedded geometry and scalar PBR materials; no external textures or animation tracks.
- The 1.85 m approved anatomy is uniformly scaled to the game's 1.98 m character height.
  Arms are lowered fourteen degrees into the relaxed animation rest stance. The trunk
  and legs retain their approved proportions. Invisible inner cloth geometry is omitted.
- Bone names, parent relationships, index order, and neutral animation axes stay compatible
  with the flight clips. The loader reads authored joint positions instead of forcing
  the new body onto the previous mannequin's pivots. The legacy rigid fallback remains.
- The browser budget is explicitly revised from 20,000 to 42,000 triangles and from
  850 KB to 1.6 MB. Batch count falls from eight to three. This buys anatomical contour
  fidelity; performance measurements are recorded separately, not inferred from counts.

## Editable source and rebuilding

`art/athletic-character/character.blend` contains the runtime rig and reduced surfaces,
plus the hidden approved master, its original topology and shape keys, and the original
derived cloth and exposed surfaces. It is independent of the previous review worktree.
The original approval source SHA-256 is recorded in `asset.json`; it identifies the
preceding proof, not a hash of the current editable file.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/athletic_character/build.py
SUIT_REVIEW_OUTPUT=docs/art/athletic-character/poses.png node scripts/review-athletic-poses.mjs
SUIT_FLIGHT_OUTPUT=docs/art/athletic-character/motion.png node scripts/review-flight-motion.mjs
pnpm verify
```

The exporter uses the retained, unreduced approved surfaces on rebuild. The master’s
anatomy and garment shape keys are editable; after master edits regenerate the cloth
and exposed surfaces before export, or edit those original surfaces directly. Runtime
surface edits are replaced by the exporter. The proof-specific `review-flight-poses`
script expects the previous character's two face/hair atlases; use the anatomy review
command above for this asset. Motion strips use the shared runtime review script.

Base anatomy: **Body Male – Realistic**, Dan Ulrich, Blender Studio, **CC0**, from
[Blender's Human Base Meshes](https://www.blender.org/download/demo-files/).
The adult Peter Parker reference supplied physique direction only; no Marvel game
mesh, texture, face likeness, or costume was imported.

## Validation

See `verification.md` for test results, gameplay captures, measurements, and limits.
`asset.json` records the actual exported asset hash and mesh counts.
