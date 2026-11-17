# Real bodies: provenance

`public/models/archangel.glb` and `public/models/watcher.glb` are built by `scripts/real_bodies/build.py`
(docs/plans/2026-11-16-real-fight.md B5, B8, B9): MakeHuman bodies generated headless with MPFB 2, dressed by the build, put on the
game's 21-bone rig with the angel asset method (`scripts/angel_asset/`, imported unchanged), and given Quaternius clips under the
game's clip names. `art/real-bodies/asset.json` pins each file's bytes, sha256, meshes, materials, textures, triangles, clip sources
and per-cut `raised` / `impact` marks. Every shipped asset is CC0 or made here; no in-game credit is needed.

## Rebuild

The downloads below were fetched once and are not committed; the build fetches nothing. Extract the MakeHuman packs into one
folder (`ASSETS`, each pack's own folder holding `x/`; the MPFB zip at `ASSETS/mpfb/`), and the two Universal Animation Library
zips into another (`PACKS`). Then, with a scratch folder outside the repository:

```sh
OUT=<scratch> ASSETS=<makehuman packs> PACKS=<ual packs> scripts/real_bodies/run.sh
cp <scratch>/out/archangel.glb <scratch>/out/watcher.glb public/models/
cp <scratch>/out/asset.json art/real-bodies/asset.json
```

`run.sh` installs MPFB into `$OUT/bl_user` (`BLENDER_USER_RESOURCES`), so nothing is written to the user's Blender folders. It needs
Blender 4.2 or newer (MPFB 2 requires it); `RENDER=0` skips the review stills.

## Downloads

| Download | URL | Bytes | sha256 | Use and licence |
|---|---|---|---|---|
| makehuman_system_assets (`makehuman_system_assets_cc0.zip`) | https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip | 280,737,770 | `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107` | Used: skins, body proxy, eyes, brows, lashes. CC0 (file headers and pack note). |
| hair01 (`hair01_cc0.zip`) | https://files.makehumancommunity.org/asset_packs/hair01/hair01_cc0.zip | 227,775,853 | `49445d69848a313ec41a9970f6a0fe4bcf925c9f1c6ef40a76f119c2e07940c9` | Used: faydaen_hair_1 (archangel), cortu_short_messy_hair (Watcher). CC0. |
| mpfb (`add-on-mpfb-v2.0.18.zip`) | https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip?repository=%2Fapi%2Fv1%2Fextensions%2F&blender_version_min=4.2.0 | 45,956,992 | `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad` | Tool. Its code is GPL-3.0-or-later (`blender_manifest.toml`) and is not shipped. Its data shapes and rigs the bodies and is CC0 per the MPFB repository's `LICENSE.ASSETS.md` (the plan's source; that file is not inside the add-on zip and could not be re-read here without network). Inside the zip, `data/3dobjs/base.obj` says "explicitly released as CC0" and `weights.game_engine.json` says `"license": "CC0"`. |
| ual2 (`universal_animation_library_2standard.zip`) | https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip | 10,257,419 | `ec0e40d6d78fe9aaad59e322f40865a8675c22f0745e291622e54520391a9217` | Used: OverhandThrow, NinjaJump_Idle_Loop, Sword_Regular_A, _A_Rec, _B, _B_Rec, _C, Sword_Block, Sword_Dash_RM, Hit_Knockback. CC0, Quaternius (License.txt). |
| Universal Animation Library [Standard] | https://quaternius.itch.io/universal-animation-library | 15,904,933 | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` | Used: Idle_Loop, Sword_Idle, Spell_Simple_Shoot, Hit_Chest, Hit_Head, Death01, and the finger poses for the rest hands (Sword_Idle grip, Idle_Loop relaxed). CC0, Quaternius (License.txt). Same file as `docs/art/angel-asset/PROVENANCE.md`; not in this download's manifest. |
| blender42 (`blender-4.2.23-macos-arm64.dmg`) | https://download.blender.org/release/Blender4.2/blender-4.2.23-macos-arm64.dmg | 308,239,340 | `8b6bc5fafd4773e94bb863ca19ba1c9a54d096eecbbc4375eae7dbc3b49fab40` | Tool, not shipped: Blender 4.2.23 LTS (GPL). |
| eyebrows01 (`eyebrows01_cc0.zip`) | https://files2.makehumancommunity.org/asset_packs/eyebrows01/eyebrows01_cc0.zip | 11,477,790 | `5425891dce613bef85c7117f7843cd49d57d1fb28127e76d77d2a2eaccb4fe78` | Not used (the system pack's brows are used). |
| eyelashes01 (`eyelashes01_cc0.zip`) | https://files2.makehumancommunity.org/asset_packs/eyelashes01/eyelashes01_cc0.zip | 3,493,692 | `b7b5eb97cfb930d93e8c067885801443bcab2dcbbe6c2c2cfff7ad87992077e8` | Not used (the system pack's lashes are used). |
| suits01 (`suits01_cc0.zip`) | https://files2.makehumancommunity.org/asset_packs/suits01/suits01_cc0.zip | 42,624,017 | `2b1d8676f3863b188e9eea98c1d8f234543d54c440e791d92b819f8ee1861f19` | Not used. |
| dress01 (`dress01_cc0.zip`) | https://files.makehumancommunity.org/asset_packs/dress01/dress01_cc0.zip | 46,598,791 | `f49ba54a3c93acd3c3307cc5a96cfc65daf8abfed9212a7e580791d821c9e93a` | Not used. Its `wdg_mycenaean_tunic` file says AGPL3 while the pack says CC0; dropped for the ambiguity. |
| shoes02 (`shoes02_ccby.zip`) | https://files.makehumancommunity.org/asset_packs/shoes02/shoes02_ccby.zip | 105,745,850 | `1b544d87dd8b3d3a9c8317e4f059be456491be979cbc9984fc53f403046f5061` | Not shipped. Its sandals (`elvs_caesar_sandals1`) are CC-BY; the build makes its own sandals instead, so no credit is owed. |

The UAL2 used here is the opengameart.org zip above, not the itch.io zip the angel asset lists; same pack, different archive.

## Assets in each GLB

| Body | Role | Asset file (under `ASSETS`) | Its file says | Author |
|---|---|---|---|---|
| both | proxy | `makehuman_system_assets/x/proxymeshes/male_muscle_13290/male_muscle_13290.proxy` | CC0 (header notice) | makehuman_system |
| both | eyes | `makehuman_system_assets/x/eyes/low-poly/low-poly.mhclo`, material `eyes/materials/brown.mhmat` | CC0 (header notice) | makehuman_system |
| both | eyebrows | `makehuman_system_assets/x/eyebrows/eyebrow001/eyebrow001.mhclo` | CC0 (header notice) | makehuman_system |
| both | eyelashes | `makehuman_system_assets/x/eyelashes/eyelashes01/eyelashes01.mhclo` | CC0 (header notice) | makehuman_system |
| archangel | skin | `makehuman_system_assets/x/skins/young_caucasian_male/young_caucasian_male.mhmat` | CC0 (header notice) | makehuman_system |
| archangel | hair | `hair01/x/hair/faydaen_hair_1/faydaen_hair_1.mhclo` (http://www.makehumancommunity.org/node/2667) | CC0 | Faydaen |
| watcher | skin | `makehuman_system_assets/x/skins/middleage_caucasian_male/middleage_caucasian_male.mhmat` | CC0 (header notice) | makehuman_system |
| watcher | hair | `hair01/x/hair/cortu_short_messy_hair/cortu_short_messy_hair.mhclo` (http://www.makehumancommunity.org/node/2809) | CC0 (comment) | Cortu |

The build shapes original clothes from each body's surface. `garments.py` and `skirt.py` build the chitons. `archangel_cloth.py`
adds the archangel's diagonal cut and binding, staggered hems, clasp and forearm wrap. `sandals.py` builds a sole and three straps
per foot. `armour.py` makes the Watcher's cuirass (the separate `plate` mesh), bracers and greaves (`bronze`) and leather pteruges.
`materials.py` generates the 64 × 16 chiton palette texture. The archangel's panels sample a dedicated UV row for runtime flutter.

## Changes made to the sources

- Bodies: MPFB macros (gender, age, muscle, weight, proportions; height found by bisection: archangel 1.88 m, Watcher 2.00 m),
  proxy male_muscle_13290, arms posed into the game rest stance, baked, weights summed onto the 21 game bones, body decimated to
  14,000 triangles. The chest bone is raised to the wing-root height (0.40 m above the pelvis on the archangel, 0.426 m on the
  Watcher).
- Materials (at most 6 per body; 4 on the archangel, 5 on the Watcher): skin; one alpha-masked `face` atlas (512 px) holding the
  eyes, brows and lashes, so the lashes cost no draw; hair (its own material, because its cards tile their map); the chiton palette
  shared by cloth, trim, leather and sandals; flat bronze on the Watcher. Skin maps are the system pack's light skins graded to an
  olive tone and downscaled to 1024 px; hair maps tinted and downscaled to 512 px. On the Watcher the hair cards hanging over the
  eyes are cut at the brow line.
- Clips: sampled onto the 21 bones (`retarget.py`), pelvis translation scaled to each body's leg length, horizontal travel
  removed (height left as the source), renamed to the game's names (`clips.py`). The library has no `Sword_Regular_C_Rec`, so
  `Sword_Regular_C` is cut at the sword hand's first slowest frame after its peak (frame 26): `cut2` is the stroke (0.867 s) and
  the archangel keeps the rest as `cut2Rec` (1.133 s); the Watcher drops it.
- Cut marks: per cut, `impact` is the frame where hand_r moves fastest and `raised` its slowest frame before that (the top of the
  windup), measured in the game rig from the sampled clip and written to `asset.json` (`cuts`).
