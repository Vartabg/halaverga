# Review: Hermon background redone with art

## Plan review

Reviewer: a fresh-context sonnet agent, read-only, given only the plan files, AGENTS.md and the source at ca905a4. Completed
2026-11-16 with file:line evidence; one review covered this plan and `codex/hermon-feel`'s.

| # | Finding | Disposition |
|---|---|---|
| 1 | The water mirrors the procedural sky (`waterShader.ts` uses `skyBase`); with a photo backdrop it would reflect the old gradient. | Accepted: the water samples the backdrop or `skyBase` is retuned to it; `skyShader.ts` stays. |
| 2 | Fog is one colour pinned to `HAZE`, and the procedural sky equals `HAZE` at and below eye level, which is what joins fog and sky. A photo loses that, and from altitude its lower half shows past the water's edge. | Accepted: the backdrop is graded offline to a constant `HAZE` in a band about 5-8° above the horizon and across the lower hemisphere; `FOG`, `HAZE` and their tests are unchanged. |
| 3 | No failure path for a 4096 JPEG that fails or decodes slowly. | Accepted: the backdrop loads in its own boundary and Suspense with the procedural sky as the fallback. |
| 4 | "Remove Skyline where the backdrop replaces it" cannot be partial (one mesh); nothing else reads it and it has no collider. | Accepted: unmount it; update the pinned mount, skyline, massif and atmosphere tests; keep the setting guards. |
| 5 | Downloads need the owner's yes. | He chose "Both, mixed" (painted sky and range, real rock and snow textures) from options naming Poly Haven CC0 downloads of about 10-30 MB. Every downloaded file is listed in `docs/art/hermon-sky/PROVENANCE.md` and reported to him. Blender 4.0.2 is installed at `/Applications/Blender.app`. |
| 6 | Optional: normal maps are wasted (the ink shader lights from the vertex normal); 12 texture taps is heavy on phones; bump the shader cache key; default the backdrop to 2048x1024; use `scene.backgroundRotation` and reuse `EnvironmentLight.tsx`. | Accepted as written. |

Code review of the finished diff follows below.

## Changes after the first frames (lead's direction)

The first pass left every hill beyond about 60 m one tan colour (the fog was the old `#d9bd97` haze) and the textures barely showed.
Second pass: HAZE retuned to a pale rose-lavender sampled from the painted horizon (`#d6c2d0`; `FOG.color === HAZE` kept, setting
guards pass), `SKY.low` to match, fog near 50 to 110 m (far 580), snow near-white and rock grey limestone with a light zone tint,
grey limestone on low-saturation stone materials, the terrace ring muted to bronze. This departs from plan-review row 2's "HAZE
and FOG unchanged": the tan haze was the cause of the sand look he called ugly, so it changed, and the backdrop was regraded to the
new HAZE so fog still meets sky.

## Code review

Reviewer: a fresh-context opus agent, read-only, given the diff, the plan and this review. Completed 2026-11-16.

| # | Finding | Disposition |
|---|---|---|
| 1 | The environment map was built before the texture was marked sRGB (child effect before parent), so lighting was 1.3-2.5x too bright on first entry and darker after a retry. | Fixed: colour space set in the memo before the child renders; test pins the order; intensity .5 to .4 by eye. |
| 2 | About 70 MB of GPU memory kept on phones (PMREM from the 2048 image, background cube with mipmaps), 95 MB at peak, where a context loss ends the session. | Fixed: the sky is a camera-following shader sphere (`BackdropSky.tsx`, no cube target); the environment map comes from a 256x128 copy. GPU memory not measured. |
| 3 | With Skyline gone, the massif ends in a straight cut over water at the world edge, visible through the boundary walls. | Fixed: `EdgeRing` starts on the strips' border vertices and falls under the water over 300 m (no collider); frames at the north and east walls show no cut. West and south not captured. |
| 4 | Textured albedo applied after the toon lighting, so the vertex tint dominated. | Fixed: the block runs before `lights_toon_fragment`; albedo lowered to suit. |
| 5 | Softer cel and ink applied even when no texture loaded, washing out a 404 and the gold/jade/ember accents. | Fixed: blended by the per-fragment art weight (0 until the maps load). |
| 6 | The stone gate measured saturation on linear colour, so rock and plinth stayed flat paint. | Fixed: measured in sRGB; a test names the materials on each side. |
| 7 | The disposer left the shared uniforms on disposed textures. | Fixed: nulled. |
| 8 | Retry never reloaded a failed backdrop. | Fixed: the retry clears the backdrop's texture cache too. |
| 9 | Optional: script HAZE vs palette, mount pins, unused `SKYLINE` (seed 2033 rust/soot), landing-page wording, dead texture-free branch, per-asset CC0 check. | All done; `PROVENANCE.md` records that each asset page states CC0 1.0. |

Still weak (for Garo to judge): the arrival terrace reads large and grey-white, far hills are smooth under the fog, some pillar
sides and gold bands keep a violet cast.
