# Human hero and facing correction

The previous live model had the correct -Z forward convention in ordinary forward flight. Its chest-like rear plates and featureless helmet made the direction visually ambiguous. A separate sharp-turn defect allowed the camera to turn toward the character's face while velocity-driven body yaw caught up. The new regression reproduced a 1.236-radian separation before the correction; the presentation now bounds that separation to 0.4 radians. The movement/collision controller and camera writer are unchanged.

## Actual character

The original sculpt has an athletic torso, a tapered waist, connected shoulders/arms/legs, hands with thumbs and knuckles, and a human face, ears and hair. The cool metallic suit follows the anatomy. It uses no third-party character asset or superhero logo. Front/profile/back and gameplay-camera views are visible in the [actual rig study](images/human-hero.png). The study calls the same rig and pose helpers as the game, rather than using a generated concept image.

The surface is fused in Blender, relaxed and decimated, then assigned smooth weights across the existing ten joint controls. Runtime geometry is transformed from the exported rest pose and bound to neutral game axes. Each instance owns its geometry, materials and skeleton; the loader's source remains reusable. A conservative animated bound includes the extended hands. The earlier rigid-asset assembly remains compatible with earlier model fixtures.

The [asset report](performance/human-hero-asset.json) records 576,572 bytes, 13,378 triangles, eight material batches and ten joints. The model is approximately 1.995 m tall, 0.787 m wide and 0.345 m deep. Byte, triangle and proportion budgets are retained. The weighted body increases transfer size from the rigid prototype; it substantially reduces the avatar's material/part batch count. Performance must be measured on the full scene.

## Verification

- Type check, all 51 unit/physics/model tests and production build pass.
- Tests cover sharp-turn facing at 30/60/120 Hz, angle wrapping, forward-facing eyes at four headings, connected body geometry, normalized joint weights, deformed bounds, joint continuity and source-cache disposal.
- Desktop gameplay captures show the corrected [forward flight](images/human-hero-flight.png), [portrait layout](images/human-hero-portrait.png) and [landscape layout](images/human-hero-landscape.png). These are system-Chrome viewport checks, not physical iPhone validation.
- All 32 browser/accessibility regression cases pass, including the new rapid-turn chase-facing test, both camera modes, touch handoffs, orientation changes, landing, graphics recovery and automated AA scans.
- The [93-second desktop rendering sample](performance/human-hero-mac-chrome.json) recorded 5,569 active frames on Apple M2 Max / headless system Chrome 152 at 1440 × 1000, DPR 1, high quality, third person and Surge: median 16.7 ms, p95 18.1 ms, zero stalls over 50 ms and zero browser errors. Peak rendering was 14 draw calls, 91,664 triangles, 13 geometries and five textures. This is a desktop spot check, not physical iPhone validation.
- Physical iPhone performance, Safari ergonomics, VoiceOver and subjective character approval retain their explicit gaps in [TECH_DEBT.md](TECH_DEBT.md).

## Review

1. Hard constraints: one camera writer; no new dependency, external asset, API, credential or collider. Canvas recovery remains intact. Lifecycle secret scans are required before push.
2. Behavior: the visible back stays behind the view heading while banking and pose blending remain available. Both cameras and all input methods retain their contracts. Failed rig assembly disposes owned resources and reaches the existing Canvas error boundary.
3. Quality: authoring and runtime modules remain under 200 lines. Geometry/skeleton allocation occurs at assembly, not per frame. The new main surface has a connectivity test so detached limbs cannot silently return.

The rig uses the documented [Three.js skinned mesh](https://threejs.org/docs/pages/SkinnedMesh.html) attributes and binding model. The source asset and runtime checks are the evidence for this implementation. Local [reviewed 3D guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md) informed camera ownership, resource disposal and honest device reporting; it does not cover character sculpting.
