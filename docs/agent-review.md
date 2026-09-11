# Independent review · first flight

Both external review runs completed through existing account access. Muse reported `muse-spark-1.3-contributor`; Antigravity reported `gemini-3.8-flash-high` and terminal SUCCESS. Neither edited the repository. Their supplied-code findings were independently checked, not accepted wholesale.

## Movement review

- Tightened camera boom collision: start the query at the head, filter the player body, and stop before the obstruction. The review's arithmetic description of the old margin omitted its shifted ray origin, but the old origin could itself start behind a close obstruction.
- Ground contact now clears accumulated downward velocity. Landing completes closer to the chosen surface. Actual browser tests exercise successful landing and interruption by new movement.
- Rejected the claim that a 0.57m translation necessarily tunnels through a thin wall. Rapier's character controller sweeps the capsule. Tests against a 5cm wall and 28cm roof at 34m/s pass without adding dynamic-body CCD.
- Pause/rotation handling existed outside the supplied excerpts and clears inputs. Browser tests verify it. Touch ascent/descent comes from forward movement plus camera pitch; that path has a unit test.

## Rendering review

- Raised the tower pad above its supporting slab and added an explicit collider. The slab already prevented falling through; the marking was partly buried.
- Removed an unused water-color path and made shader animation updates explicit.
- Rejected the claimed DataTexture alignment crash: Three.js 0.183.2 explicitly initializes DataTexture unpackAlignment to 1.
- Geometry allocation happens at scene creation, not per frame. Static colliders share one fixed body. Performance is measured rather than inferred from component count.
- The independent review missed a missing water shader brace. Browser console inspection caught it; console errors are now included in browser regression checks.

Gemini reported 24,964 input and 6,803 output tokens; its separate thinking counter is not added. Muse did not expose usable token usage. These counters do not imply a price or claimed Codex savings.
