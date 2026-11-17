# Archangel design review

Kierkegaard completed a fresh-context review of the plan at base `849b2ad`, plan SHA-256 `a831539fdeb35ce3945866ebfc64a0ebd178eee2211609dc6b3b9bace4d66907`. The reviewer inspected the laptop entry frame, project instructions, shell, skirt, atlas, feather geometry and the runtime cloth deformation.

| Finding | Disposition |
| --- | --- |
| The folded wings can hide the shoulder cut and fastener. | Added matched chase frames and legibility checks for the indigo garment and banded plumage at laptop and phone sizes. |
| The cut changes where skin is hidden. The hem shader sees everything in the shared material. | Use the same shell coverage test for hidden skin and retain the material name. Check both edges and attached pieces through the actual poses. Place the guard on the free arm to clear the arm cannon. |
| Watchers share the feather generator, so checking their GLB alone misses color changes. | Opt in from the player wing. Compare coarse geometry color buffers against the base. |
| A dedicated metal material and fine weave would add work and GPU cost for details mostly visible up close. | Keep the palette material and use a bronze-colored swatch for the fastening. |

Laplace completed a fresh-context implementation review from `849b2ad`. It covered the asset build and manifest, both GLBs, player and Watcher wing callers, material deformation, and the built scene chunk. The review found that the shared chiton material could displace the guard by more than its clearance. Assigning the loose panels a dedicated atlas row restricts the cloth shader to those panels. The exported geometry test checks the row through the actual GLB loader.

## Verification

- The browser playtest pairs the character with the corrected terrace and entry framing from `849b2ad`. Matched Chrome captures cover 1440 × 900 desktop, 393 × 852 portrait and 852 × 393 landscape. The 17 browser checks passed, including takeoff and landing, a live strike string, wing clearance and accessibility. Phone sizes were emulated.
- The final archangel GLB is 1,290,000 bytes (+15,252 bytes), with four materials, 19,828 triangles and identical joint transforms, inverse bind matrices and clip samples. The Watcher GLB and both coarse wing buffers match the baseline. Only the vertex colors change on the player wings.
- The full gate caught a 0.244 mm displacement on an upper-back vertex with two sub-percent influences. The build test now uses the sum of those influences for its bound and checks that vertices with only fixed influences stay in place.
- The published character patch is based on main at `edfb283` for independent integration.
