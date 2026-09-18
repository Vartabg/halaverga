# Fitted suit review

The redesign changes the actual playable mesh. It replaces box-shaped limbs, the oversized helmet and external pack with anatomical lofts, slim panels over graphite fabric, a continuous swept visor, tapered boots and a segmented spine. Most visual information is in silhouette, surface curvature and a small palette. All geometry is authored in `scripts/build-suit.py` and `scripts/suit_mesh.py`; no purchased or generated concept art is presented as the game asset.

The GLB retains six explicit articulation groups. Runtime meshes batch by group and material, preserving metallic/roughness properties and emission instead of collapsing everything into one toon material. The physically based material workflow and additional shader cost follow the [Three.js material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html). Existing sun/sky lights supply the lighting; this revision adds no texture maps, environment capture, bloom or postprocessing.

## Review and corrections

- Close-up front/profile/rear views exposed nonplanar panels crossing the underlayer and inconsistent side-wall winding. The panels now have shallow raised centers, consistently oriented closed surfaces, a small clearance over the fabric and smooth edge normals. Ray tests against representative chest, arm, thigh and shin surfaces verify that the visible front layer is armor.
- Fine inlays are projected onto the final armor triangles in the offline authoring script, preventing light strips from sinking under the reshaped panels. This projection does not run in the browser.
- The visual root disables automatic R3F disposal because its effect owns assembly geometry and cloned materials. The shared loader asset is retained. Repeated assembly/disposal and failure tests check that source buffers/materials remain untouched.
- Hard-constraint review found no API, credential, dependency or Canvas ownership changes. Flight behavior, camera ownership, collider dimensions, input handling and HTML controls are retained. Changed source files remain below 200 lines; no allocation or state update was added to the animation loop.
- Asset budgets are explicit: below 600 KB, below 20,000 triangles and at most 30 material/part batches. These are local asset constraints, not claims of measured phone performance. The earlier frame reports remain historical. The new short desktop sample records its own source hashes and workload.

`images/suit-study.png` renders the actual GLB under studio lighting. In-game inspection uses the existing city lighting and both full/lighter rendering modes. Physical iPhone graphics performance, VoiceOver and subjective suit/flight review remain open in `TECH_DEBT.md`.

Reviewed local baseline: [3D web guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md), status **reviewed**. Its material, resource ownership and evidence rules were applied; it explicitly does not cover Blender authoring or character rigging.
