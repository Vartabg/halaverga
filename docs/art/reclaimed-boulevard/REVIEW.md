# Independent rendering review and disposition

Gemini 3.8 Flash High reviewed the supplied source/specification through the
Antigravity CLI. Conversation `92974aa2-e221-4fa3-aba5-ac673c28371f` returned SUCCESS,
exit 0, empty stderr, and no tool events. This was a **text-only code review**;
Gemini did not inspect images, execute the game or certify performance.

The raw response is retained in gemini-raw-review.md. Its severity labels are
unverified reviewer claims, not accepted defects. Codex checked the claims against
the installed library source, supplied assets and existing tests before acting.

## Changes made after review

- Give the new large highway sign a matching solid collider.
- Explicitly mark instance colors for upload. They were populated before the
  first GPU upload already; the flag makes the intended ownership clear.
- Encode the procedural sky lookup as half floats. The original lookup used
  nearest filtering, so the claimed mandatory float-linear failure was not
  established. Half floats reduce its storage and avoid that future restriction.

## Claims checked without changing the implementation

- **Rapier cast arguments:** installed `pipeline/world.d.ts:418` defines twelve
  arguments including `targetDistance` before `maxToi`. The existing camera call
  matches that signature. The proposed eleven-argument fix would break it.
- **Frame priority:** FlightPresentation uses priority -30, before CameraRig at
  -10. The review incorrectly assumed the presentation used priority zero.
- **Demand rendering:** the entry and pause states intentionally stop animation;
  starting/resuming the game restores invalidation. Browser checks cover this.
- **Disposal:** these are owned clones. Three's dispose events release GPU data;
  CPU attributes remain available for upload. No permanent disposed-state failure
  was demonstrated. Development captures and production context recovery pass.
- **Alpha shadows:** the installed WebGLShadowMap copies material.map,
  alphaMap and alphaTest into its depth material. Custom shadow shaders are not
  necessary for these standard leaf cards.
- **Backfaces:** all three imported tree materials explicitly carry
  `doubleSided: true` in the GLB. Cloning retains the setting.
- **Trees:** ground stems use coarse collision boxes; their x extents remain
  outside the open water route. Elevated tree bases sit inside the existing
  exterior-only building volumes. Branches, roots and leaves are decorative;
  the collision boxes are not exact meshes of the entire tree.
- **Vine layers:** all authored facade vines currently face +Z. The layer offset
  is valid for this data; other facade directions will need rotated offsets.
- **Sky clipping:** the shader explicitly assigns clip-space z=w. Enlarging the
  camera far plane or adding another gameplay-camera writer is unnecessary.
- **Leaf material/UVs:** prepare-assets.py separates the source by material
  before calling canopy_lod. glTF supplies per-vertex UVs and the import does not
  weld seam vertices. The exported canopy material is island_tree_01_leaves.
- **Arrival rails:** their non-solid decoration predates this environment change.
  This pass preserves the existing terrace movement behavior.

## Visual review

Codex inspected the actual arrival, flight-approach and portrait renders. The
first passes exposed an overly dark play overlay and a canopy simplification
that erased too many leaves. The final asset retains sampled whole leaves,
while small plants use cells from a baked nine-plant atlas. The overlay now
concentrates around the HUD margins during play.

This is a playable art-direction benchmark. The architectural kit and distant
skyline still need bespoke assets for a higher fidelity production environment.
Water uses an inexpensive sky/specular approximation, not planar building
reflections. The full district and physical iPhone Safari checks remain outside
this single-corridor proof.
