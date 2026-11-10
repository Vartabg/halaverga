# Character assets: options and decision

2026-10-20. Garo called the code-built angel and demons "dolls" (2026-10-19) and approved outside assets: AI generators,
CC0 models, auto-rigging and motion capture, licences checked and recorded. This compares three ways to get properly made,
rigged and animated characters, and records the prototype built on branch `codex/angel-asset`.

## Constraints

- iPhone Safari is the target. The War in Heaven scene was 36 draw calls, 353k triangles, 40 geometries and 13 textures
  (Mac Chrome measurement at high quality, base commit 9731da9). Physical iPhone frame times have never been recorded.
- Angel GLB budget (tests/celestial-characters.test.ts): under 2.5 MB, at most 80,000 triangles, at most 9 batches.
- Landing first load at most 629 KB: character code must stay in the scene chunk.
- Everything that moves the angel writes the 21-bone skeleton in `src/world/suitSkeleton.ts`: identity rest, arms hanging
  about eight degrees out. Pose, flight clips, springs, the turn roll, the aim layer and the wings (`archangelWings.ts`, on
  the chest bone, with obstacle tucking) all depend on it.

## Options

| | A. Quaternius CC0 kit (built) | B. AI generator + auto-rig | C. Mixamo / AccuRIG + motion capture |
|---|---|---|---|
| What | Universal Base Characters head and hair, Modular Outfits clothes, Universal Animation Library 1 and 2 clips | Meshy, Tripo or Rodin model from a text or image brief, then its humanoid auto-rig | Rig any mesh, then Mixamo clips or our own capture (Rokoko Vision, DeepMotion, phone video) |
| Licence | CC0 1.0, stated in each zip's License.txt (copies in docs/art/angel-asset/PROVENANCE.md) | Meshy Free: CC BY 4.0 with credit to Meshy; paid plans: private, commercial. Tripo free-tier terms conflict between sources; treat as paid only | Mixamo: royalty-free in games, but raw character and animation files may not be redistributed, and a GLB in `public/` can be downloaded by anyone, so it is a grey area. AccuRIG needs an ActorCore account, motion licences separate. Rokoko free tier: 15 to 30 s of video a month, commercial terms not confirmed |
| Who can do it | Done here; no account, no purchase | Needs Garo's account (I may not create accounts or accept terms) | Needs Adobe or Rokoko accounts |
| Look | Stylised realism with painted textures; reads as a real game character at chase distance. The free outfits are a tunic and ranger leather, recoloured ivory and gold; no plate armour | Can match the brief (armour, face). Typical faults: one fused mesh, lighting baked into textures, rough joints that deform badly, wings must be generated off | Depends on the mesh; motion quality can be high (capture of Garo's own sword swing) |
| Phone cost | 28,456 triangles, 7 batches, 13 textures (at most 1024 px), 1.99 MB | 30k to 100k triangles and 2k textures before cleanup; needs decimation and texture downscale | Same as the mesh used |
| Rig fit | Same 65-bone humanoid across body, outfits and clips. Rebound to our 21 bones (fingers folded into the hand), clips retargeted | Mixamo-style humanoid; the same rebind and retarget scripts apply with a bone-name map | Same as B |

## Decision

Option A is built and is the recommended base: no licence risk, fully scripted (`scripts/angel_asset/build.py`), lighter
than the old angel (28k against 78k triangles, 1.99 MB against 2.26 MB) and every existing system still drives it.

- **Body:** the pack's superhero head with long hair and brows; tunic, trousers and sleeves from the free Peasant outfit
  recoloured ivory; bracers, both pauldrons and boots from the free Ranger outfit recoloured gold and made metallic.
- **Skeleton:** kept. Every pack armature is posed into our rest stance by one rule (`scripts/angel_asset/rest.py`), the
  meshes are baked there, and weights are summed onto the 21 bones. The flight clips, springs, aim layer and wings work
  unchanged.
- **Animation:** library clips retargeted by each bone's world rotation change from that rest stance, embedded in the GLB:
  idle and sword idle on the ground, a two-handed overhead cut for the sword strike, an open-hand push for rebuke and bind,
  an overhand throw for cast. `src/world/angelMotion.ts` raises the sword during the dive, holds it until contact, then
  plays the cut. In the air a move takes only the body from the waist up, so the legs keep the flight clips.
- **Flight:** stays the game's own clips. Neither library has flying motion.
- **Wings:** kept `archangelWings.ts`. Its obstacle tucking depends on its own rig, and no CC0 wing asset has that. The
  wings are now the flattest-looking part of the angel (plain feather cards).

Scene with the new angel, same measurement: 34 draw calls, 303k triangles, 38 geometries, 26 textures. Draw calls and
triangles drop; textures double: about 5.4 million texels, roughly 22 MB more GPU memory (29 MB with mipmaps). KTX2 (Basis)
compression would cut that by about three quarters and is the first thing to try if the iPhone struggles.

## Next, in order

1. Garo plays the preview on his phone against the current angel.
2. If the direction is right: the paid Source version of Modular Character Outfits ($20, his purchase) has gold and steel
   plate armour on the same rig, so it would drop into the same build.
3. For a one-of-a-kind hero instead: generate on Garo's paid Meshy account, armour on and wings off, and feed it through the
   same scripts.
4. Demons: same pipeline. The free Quaternius kits have no demon; this needs a check of other CC0 sources or option B.
5. Feather cards with an alpha texture for the wings, then KTX2 textures.

Not verified: physical iPhone Safari frame time, VoiceOver, and the strike against a live demon in a real browser session
(covered by unit tests only).
