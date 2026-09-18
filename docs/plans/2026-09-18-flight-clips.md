# Flight clips on a fuller skeleton

Goal: in flight, the explorer moves like a game character from the chase camera. Hover, cruise, power flight, turns, braking, climbing, diving and landing each have their own authored body shape. The shapes blend by speed, direction and travel angle.

Owner decisions (2026-09-18):
- Flight first; ground clips and foot IK come later.
- Whole-body roll into turns is part of this work, landing as its own change after the clips.
- The face-atlas mirror fix lands before the skeleton rebuild (PR #6).

Design, chosen by a three-way design review with independent judges:
- The skeleton grows from ten to 21 bones: spine, chest, neck, clavicles, hands, feet and toes. The ten legacy joints keep their indices and pivots, and every rest orientation stays identity.
- Clips are original keyframe tables in TypeScript, compiled to quaternions and sampled by our own sampler, not three's AnimationMixer. No clip data enters `suit.glb`.

## 1. Skeleton, no visual change

- [ ] `src/world/suitSkeleton.ts`: bone names, parents and heads. The legacy rows are the `pivots` values themselves. `boneIndex` accepts legacy and semantic names.
- [ ] `src/world/skinnedSuit.ts` builds 21 bones and maps skin indices by name. The rigid fallback stays at ten joints.
- [ ] `scripts/hero_skin.py` weights the new bones by splitting today's weights. A build assert proves that each legacy joint's share is unchanged and that no vertex has more than four influences.
- [ ] One Blender rebuild of `public/models/suit.glb` and `art/halaverga-explorer.blend`. Gates:
  - Only skin data and bone nodes change.
  - Posed vertices match the previous GLB within 1 mm across legacy poses.
  - The baseline review strips look unchanged.
- [ ] Tests: skeleton structure, the 21-joint budget, no animations in the GLB, and identity rest.

## 2. Authored flight clips

- [ ] Clip sampler, flight clips and accents, flight mix and flight pose modules.
- [ ] Facing, hinge, frame-rate, pause and ground-exactness tests.
- [ ] Review strips, a browser label spec and a first-load check.

## 3. Whole-body turn roll

- [ ] Root roll from lateral acceleration, with its own facing verification.

Out of scope: ground clips, foot IK, root motion, fingers and face animation, third-party assets.
