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
