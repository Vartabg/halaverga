# A more realistic fight: contact, bodies and fallen-angel Watchers

Date: 2026-11-16. Branch `codex/hermon-real`, based on main 547a7cc (the live build: Hermon fight line + calm camera + painted
background).

## What Garo said and chose

Playing the live build on his laptop: "it needs a more realistic fight sequence, and that includes how the watchers and the
archangel look and move". A frame-by-frame capture of a live fight at 1440x900 and a code survey found four faults; he ticked all
four, and chose two directions:

| Fault (measured) | Today |
|---|---|
| Blade really hits | A cut lands when the angel is within `STRIKE.contact` 3.4 m of the target centre (`strike.ts:9`, `banish.ts:120`); the blade never meets a body and the Watcher is a speck on screen during the cut. |
| Angel flies like a flyer | In flight the body hangs upright with the legs dangling; all three cuts reuse one ground clip (`ual1/Sword_Attack`) at different rates (`swordString.ts:21-23`). |
| Hits land on bodies | A struck Watcher holds one hit frame (`demonActors.ts:49-69`), then a thrown body tumbles rigid (`thrown.ts`); when the angel is hit only a counter, shake and red overlay change (`wardenMath.ts:26-30`), no flinch, no knockback. |
| Watchers fight like fighters | Watchers are a small Quaternius Bestiary "Imp" (QAL licence) with a humanoid jump clip as flight; attacks are code-posed joints (`demonActors.ts:9-34`). |

- Watchers: **"Fallen angels"**. In 1 Enoch 6 they are angels who came down on Hermon, so they take human form with wings and arms,
  the archangel's size, not imps. Ophanim are never enemies; no "six wings" (setting rules in memory and `AGENTS.md`).
- Source: **"Free realistic humans"**. MakeHuman bodies (MPFB2 add-on for Blender, CC0 output) and free motion capture, no account.
  Every download is asked first with its name, source and size, and recorded in a provenance note.

## Decisions

Stage A needs no downloads and ships first as its own preview (one change per test). Stage B needs the downloads.

### Stage A: contact and reactions on today's models

A1. Blade contact, decided in the game step (pure, plain {x,y,z}; nothing read back from the render layer).
- New `src/game/bladeReach.ts`: `BODY = { lesser: { radius, half }, warden: { radius, half } }`, a vertical capsule per demon
  around its centre `s.targets[i].c`, sized from each model's rest bounding box (measured once from the GLB during the build and
  pinned in a test with the method), and `BLADE = { reach }`: the angel's chest to the sword tip at the cut's impact pose (about
  1.6 m: arm plus the 1 m blade; measured the same way).
- `contactAt(i) = BLADE.reach + BODY[kind].radius` replaces `STRIKE.contact` in all three consumers: `beginStrike`'s step-in
  distance (`strike.ts`, `distance - contact * .8`), the step-in pace (`strike.ts`), and the landing in `stepBanish`
  (`banish.ts:120`). `STRIKE.contact` is removed; tests that pin it (`strike.test.ts`, `sword-string.test.ts`,
  `counter-queue.test.ts`, `desktop-restore.spec.ts`) move to the new constants.
- Landing is a swept test: the closest distance between this step's path of the angel's chest (last position to this one) and the
  capsule's axis segment is at most `contactAt(i)`. At 130 m/s and the 0.05 s step cap that is a 6.5 m segment, so a fast dive
  cannot skip the body. Unit test at 130 m/s.
- No new miss state: the dive keeps homing on the target as today (`aimStrike`), so a cut that fails to reach ends exactly as now
  (`cancelStrike` at `STRIKE.maxTime`, string timer unchanged).
- The visible blade meets the body because the slash clip already eases its impact frame onto the landing beat (`strike.ts`
  "land on the beat", `SLASH.raised`), and the landing now happens at blade reach instead of 3.4 m from the centre. The cut's swing
  direction (strike direction turned by the cut's `arc` in `swordString.ts`) gives the reaction side and the shove direction.
- Lock, `BANISH.swordReach` and the dive stay, so aiming is unchanged.

A2. Flight body: a root pitch toward prone at speed.
- In `angelMotion.ts`, next to `turnBody` (same pivot): pitch the model root forward by speed, 0 at or below the hover speed, rising
  to about 65° at cruise and 75° in a dive, eased (about .3 s). Order: speed pitch first, then the cut's lean (`twirl`, `flip`).
- Hover and climb keep 0 pitch, so the pinned rule "no torso pitch where an overhead camera can meet it" (`flightClips.ts:75`,
  `flight-clips.test.ts:69`) still holds; that test is unchanged, and a new test pins 0 pitch at hover speed.
- Legs: the cruise clip's legs are brought together, straight and pointed (a joint layer like `strikeStance.ts`, before the
  springs). During a cut the upper body plays the slash as today (`UPPER_BODY`); hips and legs keep the flight pose.
- Off under reduced motion (upright, as today). Silhouette, trail and wing tests (`flight-silhouette.test.ts`,
  `flight-layer.test.ts`) are updated only where the new pitch changes a pinned number, with the reason.

A3. Hits land on bodies.
- Watcher: `DemonPose` gets a hit clock (`hitT`, seconds since the hit) so the hit reaction plays over its length instead of a
  decaying one-frame blend (`demonActors.ts:49-69`); the body yaws toward the hit side (root yaw). A non-final cut still staggers
  and throws it (`thrown.ts`); the reaction plays during the throw on the upper body, the throw owns position.
- Angel: new `src/game/hurtShove.ts` owns a decaying shove vector. `wardenDamage` (`wardenMath.ts:26-30`) sets it away from the
  attacker (about 14 m/s, half-life .15 s). Player.tsx adds it to the velocity on the same line that calls `strikeStep`, so the
  flight safety sees it like a strike dash. While a strike is under way (`strike.phase !== 0`) the shove is dropped (the strike owns
  velocity). It applies under reduced motion too (it is movement, not decoration).
- A flinch pose (head and chest back, arms in, wings flared) plays for about .35 s in `angelMotion.ts`, off under reduced motion.
- No ragdoll in this plan.

### Stage B: realistic bodies and motion (after Garo approves the downloads)

B1. One human base for both sides from MakeHuman (MPFB2 in Blender 4.0.2, scripted headless): an athletic male build for the
archangel, a taller, heavier build for the Watchers; skin, eyes and brows from CC0 MakeHuman assets. The archangel keeps its outfit
look (ivory and gold) where the old Quaternius outfit pieces fit the new body; otherwise simple robes from MakeHuman's CC0 clothes.

B2. Watchers as fallen angels: the same body family, dark bronze armour tint and the archangel's wing system with dark feathers
(`archangelWings.ts`), each holding a blade. Their attack machine (`wardenAttacks.ts`: tell, rush, sweep, fan, volley, recover)
stays; each phase plays a motion-capture clip instead of code-posed joints, and their blades meet the angel's blade on a block.

B3. Motion capture for both: several cut directions, block, hit reactions (front, sides), a fall, and a combat idle, retargeted onto
the game's 21-bone rig with the existing method (`scripts/angel_asset/build.py`, `glbclips.py`). Flight stays hand-authored
(no mocap exists for flight). The three-cut string maps to three different cut clips.

B4. Budgets: each character GLB at most 2.5 MB and at most 2.5 MB added in total over today's `angel.glb` + `abyssal.glb`
(about 4 MB); textures 1k or smaller; nothing new on the landing page (629 KB first load); draw calls no higher than today's
Watcher. The asset manifests (`art/*/asset.json`, which pin bytes and sha256) and their tests (`angel-clips.test.ts`,
`arm-cannon-asset.test.ts` and the demon asset tests) change with the new GLBs. Every Canvas keeps its error boundary and
context-loss handling.

### Stage B decisions after the prototype (2026-11-16)

The pipeline was proven outside the repo (handoff: `scripts/real_bodies/` from the prototype; Blender 4.2.23 at
`~/Applications/Blender-4.2.app`, MPFB 2.0.18 installed into a sandboxed user folder). Garo chose an olive, Near Eastern skin for
both sides and approved the MakeHuman tunic, sandals and hair packs. Results: archangel 1.88 m (ivory chiton, gold belt and hem,
CC0 hair), Watcher 2.00 m (oxblood chiton, bronze cuirass, bracers and greaves, leather pteruges, CC0 hair), about 21-22k
triangles, 1.40 and 1.58 MB; chest head .40 m above the pelvis like today's angel. The Mycenaean tunic was dropped (its file header
says AGPL3, its pack says CC0). Revised after the Stage B plan review (see the review file); B4's byte rule is replaced by B8.

B5. Clip names. The build renames clips to game names, so the game reads them as today. `archangel.glb`: `idle`, `swordIdle`,
`rebuke`, `cast` from the same sources as `scripts/angel_asset/build.py` CLIPS; `cut0`, `cut1`, `cut2` = UAL2 `Sword_Regular_A`,
`_B`, `_C`, and `cut0Rec`, `cut1Rec`, `cut2Rec` = their `_Rec` clips. The old single `slash` clip goes. `watcher.glb`: `idle`,
`flight`, `charge`, `hit`, `down` from the same sources as `scripts/demon_asset/build.py` (flight stays `NinjaJump_Idle_Loop`),
plus `hitHead` (`Hit_Head`), `knock` (`Hit_Knockback`), `block` (`Sword_Block`), `rush` (`Sword_Dash_RM`), `swordIdle`, `cut0`-`cut2`.
Horizontal root travel is removed in the build, height kept.

B6. Player cuts. A new `src/world/cutClips.ts` holds, per cut, `{ clip, rec, raised, impact }`: `raised` is the top of the windup
(the hand-speed minimum before the peak), `impact` the hand_r speed peak, both measured by the build into `asset.json` and pinned by
a test that recomputes them from the GLB to within one frame. `angelMotion.ts` reads `clips[cutClip(m.cut).clip]` for the act and
the cut's own `raised` wherever `SLASH.raised` is used today; if contact names a different cut than the one begun, the act switches
clip at the new cut's `raised` (both are held raised during the dive). When a cut's clip ends, its `rec` plays as the act's tail
at full weight (no fade from zero); a new strike replaces it. Mocap plays at real time: `CUTS[].rate` is retuned (start at 1),
`lead` becomes `min(SLASH.lead, raised)` per cut, and the chest roll per cut (`CUTS[].roll` twist) goes, since the three clips are
three strokes. `angelRegalia.ts` matches the new material names (sway on hair and chiton kept); the cel-and-ink HADES fragment is
not applied to the realistic bodies. `SWORD_GRIP`, the arm cannon link and `blasterSkin` are re-tuned to the new hand and forearm.

B7. Watchers. Lesser Watchers (all but `ELITES`) keep today's layers: idle, flight by speed, `charge` for the dart, the hit
reaction, `down`. The hit clip is chosen at the blow and stored on the actor beside the interrupted one: `hit` for cut 0 and 1,
`hitHead` for cut 2, `knock` for the casting blow. Wardens (`ELITES`, `wardenAttacks.ts`) play a clip per phase in place of
`attackPose`: tell holds `swordIdle`; rush `rush`; sweep `cut2`; fan `cut1`; volley `cut0`; recover `block`. A phase with a known
length (sweep: `CLEAVE.duration`; rush: reach / rush speed) scales its clip to fit; fan and volley align the clip's `impact` to the
bolt release on the existing code timers, which stay. Each Watcher holds a bronze blade: one instanced `swordGeometry()` (no
flame) placed from `hand_r`'s world matrix and a grip offset measured for the new hand, as `wingMatrix` is today.
Wings: no skinned feather wings per Watcher. One reduced dark feather wing pair is built once at load from `featherWing` (fewer
card rows and columns, at most 4k triangles per side), posed open, weighted to shoulder, elbow and wrist, and driven by the existing
instanced membrane rig with its joint table taken from `AVIAN_JOINTS` at the Watcher's wing scale (2 draws for all Watchers, as
today). Its material uses the feather atlas, tinted dark, with the drone shader's flash and damage hooks. The eye marker stays (it
is the telegraph): a small built-in geometry at the eyes, placed by `headBind`, coloured as today; halo and ring unchanged. The
bronze cuirass is a separate mesh named `plate`, so a broken Watcher loses its cuirass. `demonGeometry.ts`, the unused instanced
body and plate, and the imp wing geometry go.

B8. Contact, draw calls, bytes. `BODY` is re-measured from `watcher.glb` and `BLADE.reach` from `archangel.glb` (the sword tip from
the chest at each cut's `impact`, at game scale; the minimum of the three cuts), each in its test. Materials: at most 6 per body
(flat cloth, leather and sandal colours share the chiton's swatch; bronze one; skin; hair and brows; eyes; lashes dropped if they
cost a draw). Fight draw calls at 8 Watchers (`renderer.info.render.calls`) are measured before and after and may rise by at most
40. Both GLBs together may not exceed today's `angel.glb` + `abyssal.glb` (4.01 MB); textures 1k or smaller; first load unchanged.

B9. Files and credits. Keep `SUIT_URL` and `ADVERSARY_URL` and change only their paths (`/models/archangel.glb`,
`/models/watcher.glb`), so text-pinned mounts stay. `loadSuit` takes the new names; every loader, spec and review script that names
the old files is updated (`blender-district`, `angel-strike-integration`, `recovery` specs; `review-*.mjs`). `scripts/real_bodies/`
imports `scripts/angel_asset/` unchanged; `art/real-bodies/asset.json`; `docs/art/real-bodies/PROVENANCE.md` (every download's
URL, bytes and sha256; MPFB data CC0 per its repository's LICENSE.ASSETS.md; the add-on's GPL code is not shipped). The CC-BY
sandals are not used: the build makes plain sandals (sole and straps) from the foot surface as it makes the armour, so every shipped
asset is CC0 or made here and no in-game credit is needed. A failed `watcher.glb` gets a spec like `recovery.spec.ts` (the shooter
turns off, flight continues). Old models and tests no longer used are removed.

Out of scope: the flight model and controls, the camera (stays calm, the player's own), the background art, ragdolls, any merge to
main or production without Garo's yes.

## What can go wrong

- Real contact makes cuts miss that used to land; tune the capsule and blade so a well-aimed cut still lands, and keep the lock.
- Prone flight can hide the angel's sword arm from the chase camera; check frames from behind and the side.
- MakeHuman's default rig differs from the 21-bone rig: weights and clips need the same remap the Quaternius pack used.
- Motion-capture licences vary (some datasets are non-commercial): only CC0, CC-BY or "free for any use" sets, each recorded.
- Text-pinned tests read mounts and file text (`hermon-war-mounts.test.ts` and others); update them, keep the setting guards.

## Acceptance checks

1. `pnpm verify` passes (types, unit tests, build, first-load budget, vote build). New unit tests: swept contact against each
   capsule, including a 130 m/s dive that must not tunnel; `contactAt` replaces every `STRIKE.contact` use; 0 pitch at hover and
   prone at cruise; the shove's owner, decay and drop during a strike; the hit clock playing the full reaction.
2. Frame-by-frame capture of the same fight at 1440x900 before and after: blade on body at contact, prone flight, a visible
   reaction on both sides; Stage B also shows the Watchers as winged human figures at the angel's size.
3. Browser specs: accessibility, celestial-battle, counter, counter-lifecycle, desktop-restore, simple-hints, suit-clips.
4. Not checked unless done: a physical iPhone; GPU memory.
