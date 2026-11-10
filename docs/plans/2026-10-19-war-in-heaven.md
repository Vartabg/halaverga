# War in Heaven — first playable sanctuary

Garo, 2026-10-19: the city and drones are abandoned in favour of biblical angels versus demons, with the world, characters and gameplay serving that theme. This supersedes the modern-city setting in the older flight plans. The current delivery is a playable encounter and an art-direction foundation, not a claim of finished AAA production quality.

## Direction

An unnamed warrior angel guards the threshold between a celestial sanctuary and the abyss. The silhouette language is vertical stone, white linen, pale feathers, aged gold and uninhabitable scale. The enemy language is iron crowns, hooked limbs, teeth, membrane wings and ember-red fire. Enemies may be terrible; holiness need not look human or reassuring. The many-eyed wheel witness is friendly and untargetable.

The world is an authored, physically collidable sanctuary rather than a recoloured city. A long open-air flight lane frames a colossal gate. Repeated colonnades form a readable nave, fractured causeways create alternate elevations, a marked high altar permits landing, and fire-veined black glass carries the abyss below. Three shared materials keep repeated stonework inexpensive. Visible sanctuary triangles are also its collision triangles. There are no hidden office blocks under the new scene.

The revised hero has a visible anatomical face, swept chestnut hair, an open laurel diadem, a fine gold nimbus, a fitted continuous cuirass, articulated shoulder lames and bracers, pleated ivory linen and a split crimson mantle. Its 362 overlapping feathers form shoulder coverts, secondaries and outer flight feathers. Wings attach to the chest. The holy-fire bracer uses the existing calibrated aim and muzzle sockets. Existing flight, aim-assist, burst timing and shot feedback remain the foundation.

## Accuracy boundaries and sources

These are visions, different literary contexts and artistic traditions, not one anatomical field guide. The game combines their imagery without presenting its setting or combat rules as a scriptural reconstruction.

| Source | What it supports | What we do not claim |
|---|---|---|
| [Revelation 12:7–9, World English Bible](https://ebible.org/engwebp/REV12.htm) | Michael, his angels, the dragon and war in heaven. The launch tablet quotes verse 7 verbatim. | The text does not specify Michael's armour, nimbus or number of wings. The player is an unnamed original angel. |
| [Revelation 9:7–10](https://www.biblegateway.com/passage/?search=Revelation+9%3A7-10&version=WEB) | Crowns, iron armour, terrifying teeth and wings as enemy design motifs. | The adversaries are original abyssal creatures, not literal reproductions of the locusts or an assertion that the vision is describing generic demons. |
| [Ezekiel 1:15–21](https://www.biblegateway.com/passage/?search=Ezekiel+1%3A15-21&version=WEB) | Wheels within wheels and eyes, associated with the living creatures. | Holy wheels never become enemy drones or enter the damageable pool. |
| [Isaiah 6:2](https://www.biblegateway.com/passage/?search=Isaiah+6%3A2&version=WEB) | Seraphim have six wings. | Six wings are not a generic archangel attribute. |
| [Dürer, Saint Michael Fighting the Dragon, Met collection](https://www.metmuseum.org/art/collection/search/360117) | A historical tradition of winged warriors confronting a monstrous host; strong interlocking silhouettes. | An engraving is artistic interpretation, not scripture. No museum image is bundled in the game. |
| [Bermejo, Saint Michael Triumphs over the Devil, National Gallery](https://www.nationalgallery.org.uk/paintings/bartolome-bermejo-saint-michael-triumphs-over-the-devil) | Ornate armour, precious material contrasts and an unmistakably holy warrior. | We do not copy its character or represent that costume as a biblical specification. |

The four remote tablets preserve clearly labelled quotations from *1 Enoch*, Charles 1917, as a separate literary source. Their note is not shared with the World English Bible quotation. The World English Bible is public domain; its source page supplies that statement. All runtime architecture, geometry, effects and ornaments in this slice are original procedural assets; the existing project-owned suit rig and cannon socket asset are reused.

## Playable loop

1. Launch from the safe sanctuary; holding position on the ground does not start enemy fire.
2. Fly and cast holy fire. Eight banishments secure the breach; the count is relative to the current attempt.
3. A nearby enemy gathers white light for 0.9 seconds before casting a red projectile at the player's current position. Movement and stone provide counterplay. Banishing the charging enemy interrupts it.
4. Three ward segments absorb hits. A 2.5-second grace interval prevents a simultaneous volley from consuming the whole ward. Swept hit detection prevents tunnelling. Projectile collision respects the sanctuary.
5. Defeat pauses into an accessible regroup dialog. Regroup restores the ward, resets the encounter and returns the player to the starting dais. Victory clears hostile projectiles, changes the breach to gold and permits free flight.

The current encounter has one enemy role and one attack. It is intentionally a complete small loop before expanding the cast.

## Production direction after this slice

- Author a sculpted warrior and two distinct enemy rigs: a close-range diving fallen warrior and an armoured abyssal caster. Establish silhouette, attack anticipation, impact, stagger and recovery together; give each a distinct sound identity.
- Turn the gate into a layered arena with a short escalation, a deliberate climax and a dragon-scale presence. A named dragon boss needs its own model, encounter design and source note; it is not present in this delivery.
- The character revision replaces the first slice's primitive armour, flat feathers and bat blockouts with fitted assets, layered feather normals, original surface maps and subtle cloth/creature motion. Facial expression, more natural hair, a fully articulated adversary rig, cloth collision and bespoke combat animation remain production work. Preserve the single camera writer and the established flight controls. See [the character pass](../art/war-in-heaven/character-pass.md) and [wing refinement](../art/war-in-heaven/wing-refinement.md).
- Replace generic synthesized weapon sound with an original sonic palette: wing pressure, metal, breath, choir-like harmonic textures and clear hostile attack cues. Honour mute and reduced motion.
- Validate visual hierarchy while moving, not only in a screenshot. Measure desktop and physical iPhone Safari frame times and resources before increasing asset or effect budgets. Do not describe viewport emulation as device validation.

## Engineering evidence policy

Reviewed baseline: `/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md` (trust audit passed). Installed Three 0.183.2, R3F 9.7.0, React 19.2.8, Next 16.3.8. No dependency upgrade. Keep modules below 200 lines, demand rendering, DPR at or below 1.5, pooled enemy/projectile rendering, DOM HUDs, context-loss recovery and owned-resource cleanup. Tests cover telegraph timing, line of sight, interruption, swept hits, grace, victory/defeat, spawn support and patrol clearance against actual sanctuary collision. See `docs/art/war-in-heaven/verification.md` for measured checks and remaining device limits.
