# Shooting experience · 2026-10-07

Garo, after the landing and pause redesign: "now I want you to work on the shooting experience as a whole so that everything from
the way it feels to shoot to the way it looks to shoot to the feeling and look of the drones taking damage and exploding. all of
that has to look up to a high standard of excellence"

## Where it starts

- Base: `codex/landing-pause` d820aa9 (live build + screen cleanup + the Envoy interface system). The shooter as built on
  2026-09-22/23 is documented in `docs/plans/2026-09-22-shooter.md` (owner decisions, feel constants, drones, look and sound,
  accessibility, performance budget); its decisions stand unless this plan says otherwise.
- What exists: a 9/s arm cannon with heat, vent and spread; recoil kick, FOV punches and kill shake on springs; pooled tracers and
  muzzle sprites (`ShotFx.tsx`); sparks, puffs, rings, debris, fireball and smoke (`ImpactFx.tsx`, `fxPools.ts`, `fxMaterials.ts`);
  eight passive patrol drones with alert, telegraph, dodge, punish, flinch, break and respawn (`drones.ts`, `droneDodge.ts`,
  `Drones.tsx`, `droneMesh.ts`); procedural WebAudio voices (`blasterVoices.ts`, `audioBus.ts`); a HUD with crosshair, heat and chain.

## Standing rules that bound this work

- Shooting never slows, stiffens or steers flight (Garo 2026-09-26): no look friction, no speed cap, no aim slow.
- Flash gates (3 per second, small-area limits) and `prefers-reduced-motion` stay; nothing new may strobe.
- The landing first load budget (`scripts/check-first-load.mjs`) does not move; `combat.ts` and `runtime.ts` stay three-free.
- iPhone Safari is the target: draw calls and particle counts stay inside the shooter's performance budget section.

## Direction

Excellence here means every shot answers at four moments, each legible on a phone: the trigger (cannon motion, flash, sound,
kick), the flight (tracer), the arrival (impact matched to what was hit) and the consequence (a drone that visibly takes damage,
loses parts, smokes and fails, then breaks apart in a burst with debris, a ring, a plume, and a sound with weight). The look
belongs to the ash world and the Envoy suit (teal shot energy, hot orange and white in the burst, graphite and rust debris).

## As built (2026-10-07 to 10-09, branch `codex/shooter-feel`)

Not validated on an iPhone. Every frame and number below is from a production build in headless system Chrome on an M2 Max Mac
(desktop emulation at 1440×1000 and 844×390), not iPhone Safari.

### Trigger

- The per-shot muzzle flash gains a **lance**: a 64 × 5 px white-hot spike along the shot's own screen direction (centred 16 px out of
  the bore) with a 28 px teal cross spike, turned a seeded 3–10° off the line and alternating sides, so a burst shimmers instead of
  repeating one disc. Core, halo and lance together stay inside 88 px, under the plan's 90 × 90 px small-area limit; the gated bloom is
  unchanged.
- From a burst's 4th shot the flash shortens to 33 ms (two frames) while the steady emitter glow widens 30% and brightens, so held fire
  reads as a stream from a lit cannon, not a strobe. The glow is steady (not a flash).
- Unchanged on purpose: the camera kick (A = 0.35° mouse / 0.2° touch), the cannon and body choreography, the crosshair pop and the
  shot voice. They already land on frame N (tests/shot-sync.test.ts); no new channel was added to the shot.

### Flight

- The tracer is a bolt, not a rod: a white-hot core over the middle 38% of the ribbon inside a soft teal fringe, brighter toward the
  head, 4 px wide (5 px for touch and tap look; was 1.5 / 2 px). Timing (arrives within 33 ms, retracting tail) is unchanged.

### Arrival

- Shot events carry the **surface**: bare ruin steel (colliders with `FRAME_GROUPS`) or concrete; water and drones as before.
  `fxImpacts.ts` holds the recipes: concrete gets a teal splash, a dust puff and a scorch mark (0.75 m, fades over 6 s); steel a
  white-hot ping, more sparks and a small scorch; water a splash, ring and three droplets; a drone shell a teal splash and a wisp of
  smoke; the eye an amber splash.
- Scorch marks are world-oriented quads inside the alpha sprite pool (a flag in the instance matrix), so impacts stay at 5 draw calls.
- Sounds: `world` (dull thud), `steel` (2400 → 1900 Hz ping), `water` (plop), faded with distance; drone hit, eye and blocked ticks as
  before. Every endpoint of the surface voices is at or above 150 Hz.

### Consequence

- **Damage stages** (owner decision changed, see below): the plate breaks off at 4 HP (an orange flare where the shell opens, chips,
  sparks) and the drone starts **failing** at 2 HP (new `fail` event: a spark crackle, a gout of dark smoke, an amber flare and an
  electrical crackle voice). Broken: the open top glows ember, thin smoke wisps, a spark every 0.6 s, the eye pulses at 1.5 Hz.
  Failing: the glow deepens and pulses, dark smoke every 0.1 s on the ash wind, sparks, an ember glow in the shell, a rotor wobble and
  sag (visual only; the hit sphere does not move) and the eye drops out at 1.5 Hz. Reduced motion: no wobble, every pulse steady.
- **The kill**, in order: on the hit frame a crack and short thump (90 → 45 Hz); during the 80 ms hit-stop a white pre-burst swell at
  the drone and its halo growing white (both only when the kill pop passes its 3-per-second gate); then the burst (`fxBurst.ts`): the
  gated pop, a fireball 1.4× the 2026-09-23 size with three boiling flame lobes, a ground-plane shockwave ring 1.2 → 7.5 m in 0.34 s
  (gated with the pop), nine shards that glow hot and shed ember sparks for 0.45 s, the spark cascade, the pale plume, and then three
  dark smoke puffs that hold for 2.6 s and drift on the ash wind (`ASH.wind`), so the drone's absence is felt after the fire. Shards
  that land on water ring it, as before. Debris tints moved toward graphite and dark rust.
- The burst voice has weight: a sub thump 70 → 32 Hz (felt on headphones), carried on a phone by a triangle body 180 → 95 Hz, a
  lowpassed rumble and a hard crack, then a debris tail that swells in over 80 ms with two small metallic ticks. It rises a semitone
  per chain kill, like the kill tick (the burst event now carries the chain).
- Smoke reads against the ash overcast: the alpha sprites draw their own colour in the middle and a lighter rim toward the soft edge,
  and the lingering smoke is darker than the overcast (measured: the kill region of the sky is about 15% darker at +700 ms).

### Owner decisions from 2026-09-22 changed

- **Breakup at 3 HP → plate at 4 HP and failing at 2 HP.** One stage at 3 HP gave a body-hit drone a single visible change before it
  died; the brief asks for progressive damage. Kill times and HP are unchanged.
- **Tracer width 1.5 / 2 px → 4 / 5 px.** At 1.5 px the beam was a thread on a phone; 4 px reads as energy and is still far under any
  flash limit (it is not a flash: it moves).
- **Muzzle flash shape.** The approved core + halo gains the lance and cross inside the same 90 px box, and the late-burst flash is 33 ms.
- Not changed: recoil kick bounds, the flash gates (the new pre-burst and shockwave share the kill pop's gate), reduced motion, no
  new lights, no shadows on pools, seeded randomness, flight and look untouched.

### Budget and checks

- Draw calls: ShotFx 2, ImpactFx 5, Drones 5, cannon 3 (unchanged, 15). Pools: rings 8 → 12, alpha sprites 64 → 76 (12 scorch slots).
- `PROFILE_SHOOTER=0/1 node scripts/profile.mjs`, 45 s each (route fixed: Flight settings moved to the pause card on 2026-10-06):
  before off 23 draw calls / 211,799 triangles, p50 16.7 ms, p95 17.3; before on 32 / 221,325, p50 16.7, p95 17.4; after off
  23 / 211,799, p50 16.7, p95 17.5; after on 32 / 221,329, p50 16.7, p95 17.4; no stalls over 50 ms. The profile route kills no
  drone, so `scripts/shoot-shooter-feel.mjs` also records the peak WebGL draws in any frame across a shot, four hits and a kill
  (shadow passes included): before 51 / 387,884 triangles, after 51 / 388,262 at 1440×1000; 50 → 51 at 844×390.
- Landing first load 628.2 KB (budget 629, unchanged). `combat.ts` and `runtime.ts` stay three-free.

### Evidence

`docs/art/shooter-feel/`, before (base d820aa9) and after, at 1440×1000 and 844×390, each frozen on the shooter clock (Escape pauses
it) a fixed page-clock delay after a key press: `*-shot-*` (+31 ms), `*-damaged-*` (+350 ms after the hit that takes a drone to
2 HP; four hits on the base build), `*-kill-burst-*` (+175 ms after the killing hit), `*-kill-after-*` (+695 ms), `*-impact-*`
(+150 ms after a shot into the roof). Timings and peak draws: `before-timing.json`, `after-timing.json`. Desktop emulation, not an iPhone.

### Not done or uncertain (needs Garo's eye on a phone)

- The damaged drone at 30–40 m is still small on screen; the ember glow and smoke read in the frames but the 2 HP state is subtle in
  landscape. A phone check decides whether it needs a bigger glow or a halo tint.
- The shockwave ring is the brightest new element; it may read as too graphic next to the soft fireball.
- The scorch mark is dark on the dark roof and shows mostly on lighter concrete.
- The burst's sub thump does not exist on a phone speaker by design; its weight there rests on the mid body and the crack.
- No haptics, no decal persistence beyond 12 marks / 6 s, no per-surface hit marker (markers stay for drones only).

### Test counts (2026-10-09)

- `pnpm typecheck` clean; `pnpm test` 187 files, 2,366 tests passed (base 186 / 2,349; new `tests/shooter-feel.test.ts`, 18 tests);
  `pnpm build`; `check-first-load` 628.2 KB of 629; `check-vote-build` passed.
- Shooter specs (arm-cannon, classic-blast, desktop-blaster, shooter-desktop, shooter-touch, suit-clips) and accessibility: 44 passed.
- Full `pnpm test:browser`: 503 passed, 1 skipped (the WebKit gesture spec: WebKit is not installed on this Mac), 43.6 min, system Chrome.
- Tests changed: `drone-brain` (break at 4 HP and fail at 2 HP, was break at 3); `shot-fx` (source pins repointed to `fxBurst.ts`,
  `fxImpacts.ts` and `fxShaders.ts` where the recipes moved, the fireball sizes 1.4×, the alpha pool's scorch slots; the 5-draw-call
  and under-200-lines checks kept and extended to the new modules); `shot-resolve` and `gesture-draw` (the new `surface` field in
  literals). No flash-gate, accessibility or flight assertion was touched.
