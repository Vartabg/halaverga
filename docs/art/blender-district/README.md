# Meridian Blender district

The environment pass replaces the repeated procedural building envelopes and distant blocks with an original, Blender-authored modern ruin. The setting remains the fictional district destroyed in 2033 and visited in 2113.

## What changed

- Twenty damaged building envelopes: fractured concrete planes, recessed windows and interiors, torn panes, steel braces, uneven reinforcing rods, roof equipment and painted building identities.
- Detailed quay walls, retaining fixtures, street lamps, viaduct aggregate and exposed reinforcement, plus small terrace debris and expansion seams.
- A damaged skyline and split relay towers beyond the playable boundary, with distant hillside silhouettes.
- Warm directional sunlight, cool fill, layered storm clouds and more atmospheric depth.
- Wet asphalt shading, with a 512 × 512 planar canal reflection in full detail. The lighter setting retains single-pass analytic water. Reduced motion freezes water motion and removes the wake.
- The existing building collision envelopes and fallen slab colliders are retained. Runtime movement, camera control, landings and route dimensions are unchanged.
- Reload scene clears a rejected district model request as well as the suit request. Switching graphics quality releases the reflection target and its owned geometry/material.

## Assets and budgets

`meridian-district.blend` is the editable source for the new geometry. It contains the authored asset set, not the complete game scene; vegetation, roads, the player and lighting are assembled by the game. Material maps and weathering are configured in `BlenderDistrict.tsx`.

The shipped GLB is **6,151,008 bytes**, **269,296 triangles**, **53 meshes** and **8 materials**. See `asset.json` for per-mesh counts, file hashes and required extensions. The archive is compressed with Meshopt; the decoder comes from the installed Three.js package. Repeating UVs are deliberately retained, including coordinates outside 0–1. Geometry and textures from the loader cache remain shared; only cloned runtime materials are disposed by the district component.

Mesh batches cover groups of buildings to balance draw calls with frustum culling. These numbers describe the added district asset, not the complete scene or reflection/shadow pass cost. Full-detail telemetry now counts the reflection and main scene together; frame statistics from older versions may not have equivalent resource accounting.

All geometry is original and reproducible from the scripts. Existing concrete maps and vegetation are retained from the project's CC0 Poly Haven assets, with attribution and input hashes in [the existing provenance record](../reclaimed-boulevard/sources.json). No third-party game assets or reference-game meshes were used.

## Rebuild

From the worktree root:

```sh
sh scripts/district/rebuild.sh
```

This uses Blender 4.0.2 at the default macOS application path (override `BLENDER_BIN` if needed), writes an intermediate GLB in `/tmp`, exports the `.blend`, runs pinned `@gltf-transform/cli@4.2.1` compression and updates `asset.json`. It does not require Blender in the browser or add a runtime npm dependency.

The authoring modules use game coordinates (Y up); the mesh helper converts them to Blender coordinates, and glTF export converts them back. `architecture.py` documents the site dimensions matching the city collision envelopes. Keep those sites synchronized if the level layout changes.

## Review and limits

The [before/after viewer](../../../../public/docs/art/blender-district/index.html) contains actual game captures, including the viaduct approach and a portrait viewport. A desktop phone viewport is not a physical iPhone validation.

Rendering guidance followed the reviewed [Research Vault guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md): composition/material consistency first, bounded effects, shared resources and measured device claims. The trust audit passed.

Independent review services did not return reviews. Gemini 3.8 Flash timed out at two minutes and again at four minutes with an empty response. Muse Spark 1.3 Contributor returned HTTP 402, billing verification failed. No review approval is claimed. No account or billing settings were changed.

See `VERIFICATION.md` for checks, measured performance and remaining device validation.
