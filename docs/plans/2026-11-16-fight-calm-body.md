# Calm fight camera and a stronger angel

Date: 2026-11-16. Branch `codex/hermon-feel`, based on `codex/hermon-counters` at ca905a4.

## What Garo said and chose

After playing the counters preview he said the fight sequences are "dizzying" and "make zero common sense", and that the angel
"looks like a weak ragdoll with no muscle mass or definition, its legs and non-sword wielding are just lay limp while the rest of
the character is doing all sorts of chaotic" things. I measured the fight (captured frames and a code survey) and offered the
measured faults as tick boxes. He ticked all seven:

- Dizzy: "Angel spins 360°", "Camera turns itself", "Camera zooms out/in", "Nonstop shake".
- Body: "Legs join the swing", "Free arm braces", "Stronger build".

The background redo he asked for in the same message is a separate branch (`codex/hermon-art`).

## Measured today (file:line on ca905a4)

- `src/game/swordString.ts:20-22` CUTS: the cross cut spins the whole model a full turn about the spine in .34 s (`twirl: 1`), the
  rising cut tips it -61° (`flip: -.17`), the casting blow is a full somersault in .4 s (`flip: 1`). Applied by
  `src/world/angelMotion.ts` `turnBody`; queued cuts chain with no gap.
- `src/game/combatCamera.ts:46-49`: on every strike, string, cast-down watch and warden finisher the camera turns itself toward the
  demon at up to 10 rad/s (570°/s) and pulls the boom out to about 1.9x. `src/game/CameraRig.tsx:61` writes that heading back into
  the pilot's own yaw and pitch, so the player's heading changes without input.
- FOV: +9° at every dive launch (`banish.ts`), +4/+5/+9° per cut (`CUTS.fov`), and speed FOV up to +16° between 34 and 130 m/s
  (`cameraFx.ts` `speedFovTarget`, `diveFov`). Strikes reach 55-130 m/s, so the view widens and narrows through every dive.
- Shake: a speed rumble (`cameraFx.ts` `rumble`, called from `Shooter.tsx:55`) keeps a shake floor of up to .24 trauma at 45+ m/s,
  i.e. through every dive; hit trauma .32/.45/.85 and pitch kicks 1/-1.8/2.8° on top.
- Legs: in flight the sword clip (`slash`, UAL1 Sword_Attack) is masked to the upper body (`angelMotion.ts:73`, `angelClips.ts:63`),
  so the legs keep the flight clip and its 4.5-7 Hz under-damped springs (`suitSprings.ts`); in the frames they hang straight down.
- Free arm: driven by the same upper-body clip only while it plays (fade .08 in, .25 out), then the flight trail; no hold pose.
- Build: the body is the thin Quaternius Male_Peasant (`docs/art/angel-asset/PROVENANCE.md`).
- Reduced motion already switches most of this off: no combat camera (`combatCamera.ts` returns at `i.reduced`), no kill shake, no FOV
  punch, no speed FOV, no body spins. The calm camera below is close to what reduced motion already does, which is tested.

## Decisions

D1. No whole-body spins. Every cut's `twirl` and `flip` become a lean that goes out and comes back (the existing `|turns| < 1`
branch of `turnBody`): cross cut twirl .05 (18°, into the swing), rising cut flip -.04 (-14°), casting blow flip .06 (22°, a chop
forward). The cut reads from the blade and the body, not from rotating the whole model.

D2. The view turns only when the player turns it. A single switch `FIGHT_CAMERA.follow = false` in `combatCamera.ts` makes
`stepCombatCamera` behave as it does under reduced motion (no engage heading, no boom pull-back, no write-back into
`runtime.yaw/pitch`). The string framing, the cast-down watch and the warden finisher focus all go through that planner, so they
stop turning the view too. The code stays so a later, gentler follow can be tried as its own change. The press target is already
picked near the middle of the view (`swordString.pressTarget`), so the dive goes where the player is looking.

D3. No zoom swings. Launch FOV punch 0. Cut FOV punches 0/0/3 (only the casting blow). Speed FOV capped: at most +4° above the hip
FOV, reached at 60 m/s, no `diveFov`; ease rate unchanged.

D4. No nonstop shake. `rumble` is no longer called. Hit trauma .12/.18/.5, pitch kick 0/0/1.5°. Hit-stop unchanged (it reads as
impact, it does not move the view).

D5. Legs join the swing (in flight, while a sword cut plays). A procedural leg layer runs after the flight clips and before the
springs: a held "fighting" stance while the sword is out in flight (hips flexed about 25°, knees bent about 45°, feet apart),
then a per-cut drive: cross cut, the legs scissor against the blade (the leg on the blade side swings back, the other forward);
rising cut, knees tuck on the wind-up and drive down through the cut; casting blow, knees tuck up on the wind-up and extend hard on
contact. Leg springs stiffen (about 2.5x) and damp toward critical while a cut plays, so they move with intent and do not flop.

D6. The free arm braces. The same layer gives the left arm a guard: upper arm forward and out, elbow bent about 90°, fist in front of
the chest, swinging against the blade (cross cut pulls back, rising cut drives down, casting blow reaches forward then pulls in), and
it holds the guard between cuts instead of reverting to the flight trail. Its springs stiffen like the legs'.

D7. Stronger build, in code at load time. The extracted Fantasy outfits pack is not on this Mac, so the GLB is not rebuilt.
`skinnedSuit.ts` (or a new module it calls) pushes each skinned vertex out along its smoothed normal by the weight-blended bulk of the
bones that move it: chest 2 cm, clavicle/shoulder 2 cm, upper arm 1.6 cm, forearm 1 cm, neck 1 cm, thigh 1.6 cm, shin 1 cm,
pelvis .5 cm, spine 0 (so the waist stays narrow and the chest and shoulders read wider: a V). Normals are averaged by position first
so split seams do not crack. Head, hands and feet are 0. Visual only; colliders and the rig do not change.

D8. Out of scope: new animations (no sword clip besides UAL1 Sword_Attack is on this Mac; more would need a download, his call),
phone layout, flight model, the background (`codex/hermon-art`), any merge to main, any production deploy.

## Files

Camera and spins (lead): `src/game/swordString.ts`, `combatCamera.ts`, `cameraFx.ts`, `Shooter.tsx`, `banish.ts`, and the tests
that pin these numbers. Body (helper): `src/world/angelMotion.ts`, `flightPose.ts`, `suitSprings.ts`, `skinnedSuit.ts`, a new
`src/world/strikeStance.ts` and `src/world/suitBulk.ts`, and their tests. Every module stays under 200 lines.

## What can go wrong

- Without the follow camera a demon can leave the frame during a long dive. Accepted for this test: he said the camera turning
  itself is part of what makes it dizzying. If he loses demons, a slow follow (under 1.5 rad/s, no write-back) is the next change.
- Tests pin the old camera and cut numbers (combat-camera, flight-weight, hermon-war-mounts, strike tests). Update them to the new
  values; do not delete behaviour tests that still hold.
- The bulk can push a sleeve through the tunic or the pauldron into the neck. Check captured frames front, back and side.
- Leg poses can push the feet into the wings or the sword. Check frames during each cut.

## Acceptance checks

1. `pnpm verify` passes.
2. Unit tests: each cut's spin is under a quarter turn; with `follow` off the planner never changes the pilot's yaw or pitch and
   the boom scale stays 1; no rumble floor at speed; speed FOV at 130 m/s is at most hip + 4; leg and arm layer targets per cut;
   bulk moves a chest vertex out and leaves a head vertex where it was.
3. Captured frames (desktop 1280x800 and phone 390x844) of a three-cut string: the view heading does not change without input, the
   legs and free arm hold a stance, the body does not spin, and the angel looks broader than ca905a4.
4. Browser specs: counter, counter-lifecycle, celestial-battle, simple-hints, suit-clips, accessibility.
5. Not checked: a physical iPhone. Feel is Garo's to judge on a preview.
