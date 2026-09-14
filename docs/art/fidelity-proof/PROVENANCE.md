# Source provenance

The proof is **not a character created entirely from scratch**. Its anatomical
mesh is Blender Studio's **Body Male – Realistic**, credited to **Dan Ulrich** in
the official Human Base Meshes asset bundle. Only that body's mesh, its existing
Multires data and its two eye meshes were imported. The fit is an editable shape
key; the original Basis, polygon connectivity and Multires levels remain.

- [Official Blender demo assets collection](https://www.blender.org/download/demo-files/)
- [Official archived human-base-mesh bundles](https://download.blender.org/demo/asset-bundles/human-base-meshes/)
- [Exact v1.1.0 archive used](https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.1.0.zip)
- Archive SHA-256: `e96e40522de71da9b57fd74a0282400f0e4e767ca88be7a98d14e6cb9be2a145`
- Inner `human_base_meshes_bundle.blend` SHA-256: `9ce89bcde023a4a92e89c3339f9a8d1dadeea4392a15cebf94caa4050275d657`

The source bundle's README identifies version 1.1, says its provided assets are
public domain under **CC0**, and requires Blender 3.2 or newer. The selected
asset was actually opened, imported, modified, saved and rendered in installed
**Blender 4.0.2**. The bundle also contains an unrelated Rain Rig license text;
that rig and its license datablock are not part of this proof.

The source base has 10,582 vertices and 10,590 polygons. A connectivity digest
captured before reshaping is compared against the reopened result, in addition
to the counts. This proves topology retention, not anatomical correctness or
artistic likeness. The added armor and sculptural hair meshes are separate,
editable geometry authored for this study. Hair's underlayer is extracted from
the fitted anatomical scalp; it is not a primitive replacement head.

## Concept lock

Only `docs/art/explorer-reference.png` is used: the original combined front,
profile, rear and head-close-up concept. Its SHA-256 is
`ba71e0666e45b2d265a240970eb8df59e4a314d67fae8ec9810c9515c9e2d336`.
The later `explorer-face-reference.png` is excluded.

`reference.json` records interpreted landmarks, crop boundaries, axes and view
disagreements. Full-body scale is 2 meters from pixel Y=941 (sole) to Y=17
(hair crown), so 924 source pixels equal 2 meters. This is a registration
convention, not a claim about the fictional character's height. Front/profile/
back cameras use that same pixel scale and ground line, not independently
rescaled silhouettes. The head close-up is perspective artwork; it cannot be
treated as an exact fourth orthographic projection.

The original image is packed into the Blender file. Three viewport-only UV
reference planes preserve the exact crops at the registered physical scale.
They are hidden by default and always excluded from renders. No proof geometry
uses an image material. Gray renders are actual Cycles outputs; comparison
sheets merely crop/place those outputs and alpha-composite blue silhouettes.
No AI image generation, retouching, relighting or image projection is used.

## Runtime boundary

The proof branch starts from `codex/reference-hero` at
`1b62b15a5ef81ebf8311c287f0ddcb795e03ef36`. No game files are changed. In
particular, the playable `public/models/suit.glb` retains SHA-256
`8e764a9ef4456226556f3f258b63e1f383eaa1b6b58a78ae5b5c04971223f837`.
There is no rigging, game export, API change, deployment or offline polygon cap.
