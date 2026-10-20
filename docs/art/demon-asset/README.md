# Sculpted demon prototype — 2026-10-20

The enemy body in `public/models/abyssal.glb` now comes from Quaternius's **Bestiary – Dungeon Monsters Kit [Standard]**, Imp.
Source: https://quaternius.itch.io/bestiary-dungeon-monsters-kit . Downloaded 2026-10-20, itch upload 18998851.

**Licence: QAL v1.0 (2026-08-28), not CC0.** The included licence is retained as `LICENSE-Bestiary.txt`.
https://quaternius.com/license.html permits copying/modifying the model, incorporating it in a game and distributing that
completed game, commercially or otherwise, with no attribution required. It prohibits distributing the asset itself as a
standalone model/pack/template, including modified assets. The source ZIP and full-resolution maps are outside this repository;
the exported model is incorporated into Halaverga, not offered as an asset pack. Model authorship: Quaternius.

The five clips come from the same **CC0 1.0 Universal Animation Libraries 1 and 2** as the angel. Licence copies and ZIP hashes:
`../angel-asset/PROVENANCE.md`. Clips: Idle_Loop, NinjaJump_Idle_Loop, Spell_Simple_Shoot, Hit_Chest, Death01.

Changes: remove the mace and chains; lower the arms into the game's rest stance; collapse finger weights to hands and rebind to
the existing 21 bones; fit to the existing enemy scale; downscale base colour to 1024 and other maps to 512; retain the shorts
and breakable spiked collar. The pre-existing original membrane wings and emissive eye cue remain, with the wings now following
the animated chest through downed poses. Original wing-source fixture: `art/demon-asset/wing-source.glb` (the prior game's asset,
whose CC0 anatomy provenance is documented in `art/celestial-characters/README.md`).

Runtime: pooled eight small skeletons, sharing cached textures, plus existing instanced wings and combat cues. Each actor has
independent idle/flight, charging, hit and downed poses. The collar disappears when broken. No changes to movement, camera,
enemy count, target coordinates, health, commands, or attack cadence. Compared with the old procedural GPU body flex, this costs
more draw calls and CPU bone updates; the phone browser still needs a physical-device check. The close-up study shows the actual
runtime asset and sampler, not concept art.

Rebuild from the repository root:

```
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python scripts/demon_asset/build.py -- --pack '<extracted Bestiary kit>' --libraries '<extracted angel packs folder>'
node scripts/review-demon-asset.mjs
```

The builder reuses `scripts/angel_asset` for rest fitting, weight collapse and animation retargeting. Asset byte count, SHA256,
body triangle count and clip provenance are in `art/demon-asset/asset.json`. Physical iPhone Safari and VoiceOver are unverified;
Chrome phone viewport checks are emulation.

## Verification

2026-10-20, macOS Chrome with ANGLE Metal, production Next build. The comparison page uses stills rendered through the actual
runtime rig and materials; use **Play** to see the live animation. `demon-phone.spec.ts` records 393×852 and 852×393 viewport
resource snapshots. One captured workload (lift, move forward 1.2 seconds, rebuke) measured 48 draw calls, 239,448 triangles,
55 geometries and 39 textures. This is a resource snapshot, not a physical-device frame-time benchmark or a claim of 60 fps.

Typecheck, 2,438 unit tests, production build, landing first-load check (629.0 / 629 KB), and the browser/accessibility suite
are run for this prototype. Targeted tests cover independent enemy poses, collar identity, wing attachment through collapse,
reduced motion, cached-map ownership and model budget. No production deployment or merge is authorized.
