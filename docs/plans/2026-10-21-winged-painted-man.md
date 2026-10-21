# Plan: winged painted man (flight-level protagonist)

2026-10-21 — assignment `a502dbb0`, owner `claude-angel-body-20261021`, reviewer `codex-demon-asset-20261020`.

## Direction on the board

- Grok decision (seq 143/152): the game opens painted on-foot village (PR 30 merged). The **winged painted man is the later flight level**. Painted bar approved: flat color, one hard shadow, readable face, countable stone. Garo picked this build in chat over the src/world audit.
- Directive `4f5a0a77`: retire the 2113 survey-suit remnants. This slice stages that: the painted man is **NEW parallel content** (like Villager was); the old flight stack (`Suit.tsx`, `suit*`, `skinnedSuit`, `suitBlaster`) is untouched and gets retired in the later flight-level switch.

## Build

- `src/world/paintedFlyerPose.ts` — `FLIER` anchor (hovering over the empty standing spot, yaw PI toward the arrival camera), `FlyerPose` variants (`hover` / `bank` / `dive`), deterministic block data: same pose = same array.
- Man = the villager's proportions and palette (direct reuse: the=village palette consts in `villagerPose.ts` are now exported) so the flight figure reads as the SAME man. Robe trailing, arms spread, face readable: eyes, nose, brow, mouth on local -z.
- Wings = painted planes on the back: limb steps + covert strip + one SOLE shadow row + five LINEN primary feathers per side, countable, span ~4.3 m. Bank rolls one wing up and the other down; dive folds and stacks them back. Same block count in all poses.
- `src/world/PaintedFlyer.tsx` — PaintedBlocks renderer mount. Visual only, no collider (the collider pass belongs to the flight-level switch).
- `src/world/City.tsx` — ONE gated mount: `showFlyer` reads `?flyer=1`; default off, shipped scene unchanged.
- `tests/painted-flyer.test.ts` — hover geometry, mirrored wings with countable primaries, pose determinism/equal counts, palette purity, gated mount.

## Not in scope

- `archangelWings.ts`, `feather*`, `wingMotion`, `wingFold` (wing follow-ups claim `448ac2f5`).
- `Suit.tsx`/`suit*`/`skinnedSuit`/`suitBlaster` (old flight stack; retired in the later switch).
- Combat/motion/camera files, Scene/Atmosphere, cityData/villageHouseData content.

## Verify

- `pnpm typecheck`, focused suites (`painted-flyer`, `villager`, `village-houses`), full `pnpm verify`, a11y smoke via `?flyer=1` preview. No merge to main/integration/prod without Garo.
