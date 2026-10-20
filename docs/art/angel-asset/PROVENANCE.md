# Angel asset provenance

`public/models/angel.glb` (since 2026-10-20) is assembled from four free packs by Quaternius, all CC0 1.0 (public domain
dedication, https://creativecommons.org/publicdomain/zero/1.0/). CC0 needs no credit; Quaternius is credited here anyway.
Downloaded 2026-10-20 from quaternius.itch.io with Garo's approval in chat. Each zip's licence file reads:
"License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication ... Models by @Quaternius".

| Pack (free Standard zip) | Page | Zip sha256 | Used |
|---|---|---|---|
| Universal Base Characters [Standard] (128,968,391 B) | https://quaternius.itch.io/universal-base-characters | fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40 | Superhero_Male head, eyes and brows; Hair_Long (rigged to head) |
| Modular Character Outfits - Fantasy [Standard] (308 MB) | https://quaternius.itch.io/modular-character-outfits-fantasy | c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70 | Male_Peasant body, legs, arms (with hands); Male_Ranger bracers, pauldron, boots |
| Universal Animation Library [Standard] (15,904,933 B) | https://quaternius.itch.io/universal-animation-library | cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724 | Idle_Loop, Sword_Idle, Sword_Attack, Spell_Simple_Shoot; finger poses for the rest hands |
| Universal Animation Library 2 [Standard] (18,735,003 B) | https://quaternius.itch.io/universal-animation-library-2 | 4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68 | OverhandThrow |

Changes made by `scripts/angel_asset` (the packs themselves are not committed):

- Every armature posed from its T-pose into the game's rest stance, meshes baked there, scaled to the old angel's pelvis
  height (x1.108) and turned to face -Z.
- The superhero body cut down to head, neck and the strip of chest the tunic collar shows, sunk 1.5 cm under the tunic.
- Hair moved 5 cm up onto this head (it is fitted to a shorter base body).
- Ranger pauldron mirrored for the right shoulder; boots decimated to 4,000 triangles.
- Weights summed from 65 bones onto the game's 21 (fingers into the hand; spine_01 and spine_02 into spine).
- Textures downscaled from 4096 px to 256 to 1024 px JPEG; Peasant cloth recoloured ivory, Ranger leather and metal
  recoloured gold with full metalness; hair and brows tinted chestnut (the packs tint them with vertex colours, which are
  dropped).
- Clips retargeted onto the 21 bones and written into the GLB as glTF animations.

The flaming sword, halo, wings and all motion code are original to this project.
