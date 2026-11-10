# Plan: the sword fight on Mount Hermon

- **plan_id**: `2026-11-09-hermon-war`, **revision**: `rev-2` (after independent review; see `2026-11-09-hermon-war-review.md`)
- **worktree**: `/Users/vartny/.codex/worktrees/hermon-war/halaverga`, branch `codex/hermon-war`
- **source baseline**: `34997c0` (main `e905d03` + `codex/celestial-confrontation` `bab3c32` + palette commit `c003477`), merging `codex/breach-slice` `9826287`
- **requested by**: Garo, 2026-11-09, after a side-by-side review of four builds: "Yes, build it" (the Oct 20 sword fight on the Hermon mountain, as one game).

## 1. Goal

One game instead of two half-games.

- `codex/celestial-confrontation` has the approved setting (Mount Hermon at dawn, 1 Enoch 6, continuous massif, painted ink shading, CC0 archangel) but its fight is an early copy: hold C to fire at orbs. No objective, nothing fights back.
- `codex/breach-slice` has the only complete loop in the repository (momentum flight, dive strike, chained strikes, automatic bind and cast, lesser demons that throw darts, two wardens with telegraphed attacks and earned counters, a shield, a three-part ward, "0 / 8 banished", victory and fallen states) but it is set in a retired place: a night sanctuary above an abyss.

The player should be able to take wing from the Hermon arrival terrace, fight the full Oct 20 encounter in the open air of the gorge, and win or fall, with nothing of the sanctuary setting left on screen or in the source.

## 2. Method

A real `git merge codex/breach-slice` into `codex/hermon-war` (natural merge base). 43 conflicts, resolved by one ownership rule:

| Area | Owner | Examples |
|---|---|---|
| Setting, terrain, sky, light, palette, landing copy frame | Hermon (ours) | `Scene.tsx` world mounts, `HermonCity`, `massifData`, `atmospherePalette`, `globals.css`, `layout.tsx`, `arrival.json`, `navigation.ts` |
| Fight rules, enemies, flight model, combat camera, combat HUD, their tests | breach-slice (theirs) | `banish*.ts`, `strike.ts`, `celestialBattle.ts`, `combat.ts`, `momentumFlight.ts`, `warden*.ts`, `Drones.tsx`, `demonActors.ts`, `BattleHud.tsx` |
| Files both sides own a part of | hand-merged | `Scene.tsx`, `Player.tsx`, `Shooter.tsx`, `Suit.tsx`, `Telemetry.tsx`, `Landing.tsx`, `FieldGuide.tsx`, `hintSteps.ts`, `dronePatrols.ts` |

A first attempt that replayed breach-slice against a hand-picked older base (`a893794`) was abandoned: it treated every file the Hermon branch had *not* copied as a deliberate revert and produced silent hybrids (for example `Drones.tsx` without its model loader). The natural merge keeps every disagreement visible.

## 3. Consequential decisions

**D1. Where the fight happens.** Both worlds were built on the same coordinate skeleton: arrival terrace at `(0, 20, 65)`, high landing at `(30, 61.4, -38)`, four outlying terminals. The sanctuary "nave" (open air along z from 65 to about -145 near x = 0) becomes the air over the Hermon gorge (`massifData.heightAt`: flooded floor near y = -3 along x ≈ 0, banks 13 to 28 m high that begin 9 m and finish 59 m out from the centre line). The match is not complete: the summit terrace (x 7 to 53, z -58 to -17, 61 m) stands in what was the open east half of the nave. So:

- Seven patrols keep breach-slice's "fighting band" values. The eighth, `east-basin` (warden 7), was at `(18, 45, -65)`, hidden from the approach by the terrace; it moves to the open west bank at `(-34, 45, -98)`. The id stays because it is the combat pool's name.
- `tests/portrait-arena.test.ts` (sanctuary mesh) is replaced by `tests/gorge-arena.test.ts`, built on the production collision triangles (`tests/physicsWorld.ts`): the lane is open for x -20 to 6 end to end and at x 15 outside the terrace; every patrol is visible from the approach and from mid-gorge; every loop is at least 6 m over `heightAt`; the terrace is real cover.
- `tests/drone-patrol.test.ts` keeps the Hermon solids, arch and `heightAt` clearance (5.7 m) with breach-slice's band assertion (23 < y < 47).

**D2. Enemy collision and sight.** Enemy movement, bolts and line of sight already query the live Rapier world (fixed colliders), so they act on the massif trimesh without new code. Three things do not query Rapier and are accepted as they are: lesser-demon patrols are analytic ellipses (guarded by the clearance tests in D1); the cast-down finisher sinks the bound demon to y <= -6 through whatever is below it, which on Hermon reads as cast into the earth; warden steering clamps y >= 16, which is above the gorge water. `wardenElevation(i, turn, playerY)` keeps its signature and bands (18..78 and 30..72); `wardenNavigation` passes the result through `clearOfGround(x, y, z) = min(ceiling - 10, max(y, heightAt + 8))`, so the lift beats the band's top over a ridge and stops at the steering clamp's ceiling margin.

**D3. Sanctuary-only content is removed, not hidden.** Deleted from the tree: `Sanctuary.tsx`, `sanctuaryData.ts`, `sanctuaryKit.ts`, `sanctuaryStone.ts`, `breachArchitecture.ts`, `Abyss.tsx`, `CelestialVault.tsx`, `ThroneWitness.tsx`, `BreachRoutes.tsx`, `BreachHud.tsx` (+ css), `public/sanctuary-map.svg`, `public/demon-comparison.html` and its four PNGs, and the tests that assert only on those. Reason: AGENTS.md forbids legacy wording, palette or code from retired directions. The low-passage and high-approach route hints of breach-slice's last commit describe sanctuary architecture that does not exist on the mountain; they are dropped. `breachRoutes.ts` shrinks to the warden elevation rule and is renamed `wardenElevation.ts`. Tests that assert only on removed code go with it (`sanctuary.test.ts`, `sanctuary-stone.test.ts`, `breach-routes.test.ts`, `demon-phone.spec.ts`). `Ash.tsx`, `CanalReflection.tsx`, `weather.ts` and `productionSky.ts` are already absent from the merge result (Hermon deleted them, breach-slice never changed them).

**D4. Enemy look.** The rigged demon actors from breach-slice replace the Hermon branch's orb sentinels: their wind-up poses carry the attack telegraphs the counters depend on. `ArmCannon.tsx` is not mounted (the fight is sword, rebuke and shield) and `arm-cannon.glb` is not fetched. The file itself is kept exactly as breach-slice kept it, with its test: it becomes the one new unmounted module, taking the place `demonGeometry.ts` leaves in the Hermon baseline's fifteen. Removing the arm-cannon chain is a separate cleanup. `public/models/abyssal.glb` is breach-slice's (the rig the actors need).

**D5. Victory consequence.** `BreachAftermath` (gold seal ring where each warden was cast down) is kept and renamed `SealedGround`. The gorge floor is under the water plane (y = 0.1) and the ring is 22 m wide, so it rests at `restingHeight`: the highest of the centre and eight rim samples of `heightAt`, never below `WATER_LEVEL`. The sanctuary's other victory responses (the breach turning gold, the vault and stone shaders) go with their files (D3). The HUD's victory line becomes "The host is cast down".

**D6. Words.** Hermon framing stays: title, eyebrow and intro from the Hermon branch. Enemies are "demons" (lesser) and "wardens" (two elites), collectively "the Watchers' host"; "banish" becomes "cast down". The ban is on breach-slice's setting copy only: "War in Heaven", "abyssal", "the breach", "celestial sanctuary", "First Sanctuary", "Begin expedition". Hermon's own names stay as the Hermon branch wrote them ("Sanctuary of the Throne", "Bridge of the Abyss", the "SANCTUARY" on-foot label, "Pause expedition"), and "abyss" stays inside the Revelation 20 credit. Replacement strings: objective "Cast down the Watchers’ host" / "N / 8 cast down" / "The host is cast down"; chapter "MOUNT HERMON / THE GORGE"; fallen "The host has driven you back. Return to the Threshold of Hermon, take wing, and try again." with the button "Return to the threshold"; warden panel "Bound in chains", "Cast down", "strike to cast it down"; fight setting "The fight (demons and the sword)". Breach-only hunks that merged without a conflict are audited by diffing every changed file against the Hermon baseline (this is how the "Heaven at war" title was caught). The field guide keeps one source paragraph and one fiction paragraph: 1 Enoch 6 for the setting; the mechanics' imagery credited to the passages breach-slice already cited (Mark 1:25, Jude 9, Genesis 3:24, Revelation 20:1–3, Ephesians 6:16) plus a citation, without quotation, of 1 Enoch 10:4 and 10:11–12 (already recorded in `docs/research/combat-texts.md`), and stated to be game rules, not claims about the texts. No new scripture is quoted; existing verbatim quotations are carried over unchanged. Ophanim are never enemies.

**D7. HUD.** One objective card, one prompt. The breach route card is gone (D3). `Telemetry` keeps the Hermon region labels.

**D8. First-load budget.** The landing page's first-load JavaScript must stay within the repository's enforced budget (`pnpm verify` / build check). Fight modules stay behind the existing lazy scene boundary; nothing from `three` enters the landing graph.

**D9. Module size.** Every `src/**` module stays under 200 lines (AGENTS.md); the repository's own check enforces it.

## 4. Failure behaviour

- Demon model fails to load: as in breach-slice, the model is loaded outside the optional `shooterFault` boundary on purpose, so the failure reaches the scene's reload card rather than silently switching the fight off. A render error inside the fight layer still turns the fight off and leaves flight running.
- WebGL context loss: existing `GraphicsRecovery` pause and reload path. Unchanged.
- A patrol or warden goal inside terrain: swept navigation reports `NAV.blocked` and replans in 0.1 s (existing); D2's floor removes the common cause.
- Reduced motion: breach-slice's reduced paths (no hit-pause shake, steady pulses) are kept.

## 5. Acceptance checks

1. `pnpm exec tsc --noEmit` clean.
2. Unit suite green, including the carried-over fight tests and the new patrol-clearance and mount-guard tests.
3. Mount guard (`tests/hermon-war-mounts.test.ts`, source-text style used by this repository): `Scene.tsx` imports `./HermonCity` as `City` and mounts `<City />`, `<RuinField />`, `<Sky />`, `<Water />`, `<Skyline />`, `<Drift />`, `<SealedGround />`, the fight layer and the demon model preload, and names none of the removed components; `HermonCity.tsx` still mounts `<Village />`, `<Reclamation />`, `<MassifTerrain`; `Drones.tsx` builds the demon actors and mounts the warden parts; `Experience` mounts `<BattleHud />`; `ControlsHint` mounts `<FlightFeel />`. The same file gates every `src/**/*.ts(x)` at 200 lines and bans breach-slice's setting copy in the player-facing files.
4. Orphan check (import-graph script, run against the result and both parents): no module without an inbound import that the Hermon baseline `34997c0` did not already have, except `ArmCannon.tsx` (D4).
5. `git grep -i` for breach-slice's setting copy (D6 list) in `src/` returns only the five non-player-facing hits the Hermon baseline already has (`abyssal.glb` in `Suit.tsx`, comments in `dudaelFieldData.ts`, `dudaelFieldShapes.ts`, `skylineDamage.ts`, `steleData.ts`); Hermon's own names are exempt.
5a. Every `src/game` file equals breach-slice's except the intended Hermon differences (limits, patrols, navigation names, warden elevation, comments). This is the check that found the deleted frame-state line in `Shooter.tsx`.
6. Production build succeeds and the first-load budget check passes.
7. Browser, desktop: start, take wing, strike a demon (banished count rises), take a dart (ward drops), raise shield (dart quenched), reach victory or fallen, restart. No console errors, no shader compile errors.
8. Browser, phone viewport portrait and landscape: Fly button, tap-to-strike, Chain button visible and working.
9. Playwright: accessibility, flight, and the carried fight specs (`celestial-battle`, `banish`, `angel-strike-integration`, `combat-flow`, `warden-attacks`, `hover-aim`, `momentum-*`) pass against the production build, with selectors moved to the Hermon start button. Specs that drive sanctuary architecture are adapted or removed and listed in the report.
10. Not covered and reported as such: a physical iPhone.

## 6. Out of scope

Village-on-foot opening changes, new art, WebGPU, the Nov 1 real-world terrain experiments, any deploy or merge to `main`.
