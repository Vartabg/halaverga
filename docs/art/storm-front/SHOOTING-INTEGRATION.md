# Shooting restored in the storm preview

The art preview was based on `e60a0f6`, which predates the shooting work. The sky changes did not disable a mounted shooter: that preview never contained it. The user identified the missing feature after approving the storm atmosphere.

This integration merges the existing game at `codex/shooter-feel` commit `c29a108` into the art worktree. It retains that build's arm cannon, drones, damage stages, shot/impact/explosion effects, sound, controls, Envoy suit, pause interface and open-world flight. The user-approved Blender district, storm sky, cold illumination, wet surfaces and water reflection remain active. Existing rendering components for the older ash sky and procedural central buildings are not mounted over the new art.

## Integration details

- `Scene` now mounts the existing guarded shooter and gesture layers inside the same physics world as the Blender district. `Experience` retains current input and HUD hooks, and clears both suit and district loader failures on retry.
- Central buildings retain the authored model's stepped collision envelopes. Obsolete procedural slab/debris boxes were removed: they duplicated the authored rubble and trapped low flight between slabs and façades.
- Automatic face escape gains 0.05 rad/s only at full surge, tapering to zero at normal cruise. This keeps the taller building envelopes within the existing recorded escape budgets. Perimeter turn rates, player input, and the shooter/aim override remain unchanged. The full movement invariant suite passes.
- The restored open world makes the former backdrop reachable. Its three structural mesh batches now supply actual triangle colliders, including the relay towers and hills. Rebar and glass are excluded; central buildings keep their coarse colliders. A Rapier ray test against the shipped GLB verifies both relay towers stop shots and the canal between them remains open.
- Both water planes cover the expanded flight area and camera far distance without adding triangles.
- The calm concrete material and wet asphalt use distinct material groups. The district's approved vegetation is retained.

## Verification · October 9, 2026

- Next.js 16.3.8 production build and TypeScript passed.
- All **2,368 tests in 188 files** passed, including movement/aim invariants, all 285 recorded pinned-flight states, shooting, damage/effects, decoded district delivery and horizon raycasts.
- Landing first load: **628.8 KB**, inside the existing 629 KB gate; scene/model code remains lazy. Server/static route build checks passed.
- A desktop play session loaded the cannon with the district and fired seven shots, with no console or page errors.
- All **54 browser scenarios** passed across the shooting, touch, desktop blaster, accessibility, flight, recovery, safety, pause and district integration specs. The first run passed 53; the boundary assertion was corrected and both safety scenarios passed on rerun. The trace showed the suit leaving the edge by over 50 m before hitting a newly solid horizon hill and returning; the check now observes the actual escape within its original three-second window instead of assuming continued flight never turns back.
- Phone controls were checked with Chrome touch emulation in portrait and landscape. The default page loads both the district and cannon, and firing remains available without a query override.

Physical iPhone Safari and hands-on shooting feel remain unverified. The earlier five-minute storm-only timing in README.md predates this combined build and is not a measurement of shooting plus reflection.
