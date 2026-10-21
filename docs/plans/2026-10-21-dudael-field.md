# Dudael field pass · 2026-10-21

Garo, this chat: "i need help with the open world environment in halaverga, i'm not happy with how
uninteresting it is." He green-lit the plan and the fog change in chat. The board directive
(merge-monitor halaverga message 108, prod 6bc7fde phone check) already flagged the near field as
the wrong grammar: apartment stumps/shells, window soot/rust/scum surfaces — a modern-city ruin —
under an Enoch sky. This pass replaces the **flyable field** content with Dudael chasm terrain and
opens the fog so the field reads from a distance.

Branch `codex/dudael-field` (base `codex/dudael-city` b404c6b, so near-field stele + field agree).
Assignment 494cfe09 (owner claude-openworld-interest, reviewer codex-demon-asset-20261020).

## Why the field read uninteresting (diagnosis, pre-pass)

1. Fog `near 30 / far 470` smothers everything past ~150 m; the field materialises in mist.
2. One hue everywhere (bronze haze) with no chromatic rhythm inside it.
3. One grid rhythm: 52 m cells, 20 m canals, statistically even ruin mix — flying scrolls one texture.
4. No destinations: nothing pulls the eye or rewards flying somewhere.
5. Flat: no fly-through, no vertical play beyond cube stumps.

## Steps as designed (one slice, this branch)

1. **Fog headroom** — `atmospherePalette.ts` FOG numbers only: near 30 → 65, far 470 → 540. Fog
   colour stays HAZE (one horizon colour, unchanged). Test `tests/atmosphere.test.ts` fog pins
   updated to say what is true now (fully fogged by 540 m, still inside the 650 far plane).
2. **Dudael field shapes** — new `src/world/dudaelFieldShapes.ts` (pure, Node-safe, exact boxes,
   walks its own seeded stream): watch-spires (tapering, snapped caps), colossal stele stumps,
   fallen stele fragments, broken watch pillars (snapped column ribs), churned obsidian raft fields.
   Built on the skylineParts Spec/bakeTower vocabulary already in the repo, so the collider story
   (exact boxes, steel-tagged columns stay `frame`) is unchanged physics.
3. **Rhythm + landmarks** — `fieldData.ts`: zone-based block variation (merged superblocks, one wide
   chasm plaza, wider and narrower channel stretches) and six deterministic set pieces, placed outside
   the district, the north canal avenue margin and the box-edge strip:
   - the **gate pair**: two colossal leaning stele fragments flanking the north canal avenue exit,
     visible down the boulevard from spawn — fly between them;
   - a **titanic fallen stele** lying across a wide plaza east (fly under);
   - a **fly-through bridge remnant** arching between two spires over a channel;
   - a **watch-pillar stump cluster** near the south breach;
   - a **fallen colossus** with a gap through its torso, west;
   - **bronze way-stone rows** marking lane intersections (nav rhythm, no extra geometry weight).
4. **Field surfaces** — `RuinField.tsx` material shader only (no new textures or draw calls): the
   modern window/soot/rust story becomes Dudael — carved ashlar courses, dark obsidian faces, molten
   bronze bleeding low in joints, ember underglow and a molten crust tideline at the waterline.
   `aWall`/`aSeed` attributes unchanged, so skylineParts' buffers keep their contract.
5. **Tests** — `field.test.ts` retargeted to the new reality (same guarantees: determinism, box
   clearance, canal openness, exact colliders, mount); `atmosphere.test.ts` fog pins updated.

## Deliberately untouched (other claims / stability)

`cityData.ts`, `kit.ts`, `cityMaterials.ts`, `EnvironmentLight.tsx`, `steleData.ts`, `Stele.tsx`,
`Drones.tsx`, `Scene.tsx`, `Atmosphere.tsx`, `productionSky.ts`, `package.json`/`pnpm-lock`, all
motion/combat/camera files (with one approved exception, below), district and skyline files. No
merge to integration, main or production without Garo.

## Scope exception, approved in chat: the wedge-release floor peel (movement side)

The published field config (span raised, piers 30) could not clear recorded pin #142 — the suit
caught at the city's court/hill corner stuck in a level floor-skate forever after a wedge release.
Proven in chat, 2026-10-21: reproducible across 5 legal field-side variants (span wall omitted,
column resize, wall reverted to pre-raise, a legal probe stone near the district band — each
re-rolled downstream physics, none moved the corner outcome); the only construct that ever cleared
it was a rim post inside the district band, which is illegal and was removed. The root defect is
movement-side: while the wedge owns the step, `limitSteer.ts` wipes the peel state (`S.peel`,
`S.touchT`, `S.touchGap`, line 93) and skips `peelPitch` (line 99), so a wedge that releases into a
level skim 1.23 m above the flight floor finds every peel trigger dead (touch band 0.8 m, no
contact, pitch level) and skates. Garo approved a movement-side fix on this branch:

- `limitLatch.ts`: new `STEER.exitFloor: 2` (m above the flight floor).
- `limitWedge.ts`: on a wedge release **by moving** (the probe found a way out; the give-up path is
  untouched) with pitch free and the suit inside `exitFloor`, re-latch the floor peel
  (`S.peel = -1`, fresh peelLost/shallow/settle/leaveT) — the same state a floor touch would have
  armed. It does not fire for under-slab wedges that gave up, and any pilot pitch input (hold) or
  aim keeps it off, the same gates `peelPitch` already uses.

Not a dice fix: the re-arm is the missing handoff between two existing mechanisms (wedge levels the
pitch; peel climbs away from the floor), it reuses `peelPitch` semantics exactly, and pin #142's
limit-escape test stays as the regression guard. The earlier session's "all 7 pass" note was stale
— at verified-tree state before this fix the suite was 6/7, deterministic.

## Verification before finish

`pnpm verify` (typecheck + vitest + build + first-load + vote budget), browser/a11y specs, honest
device note (no iPhone claim). Perf honest: collider count and triangle count compared against the
old field and reported in the finish.
