# Environment benchmark verification · 19 September 2026

Tested locally at `http://127.0.0.1:3476/` using a Next production build.
`verified-inputs.json` records the base revision, production build ID and SHA-256
of every runtime source file, dependency lockfile and relevant asset. The build
metadata inside the raw measurements names the pre-commit base, c9ab444, and a
default deployment URL; that URL was **not** the test target or a deployment of
this change.

## Functional checks

- `pnpm verify`: type checking, 220 tests in 28 files, production build and
  first-load isolation check passed. The landing page loads 601.6 KB of scripts
  and keeps scene code in its lazy chunk.
- Full Playwright suite: 35 tests passed in 3.4 minutes, including automated
  accessibility, input, movement, camera controls, landing, portrait/landscape
  resizing and graphics/asset recovery.
- Following the review's sign-collider, instance-color and half-float changes:
  all 8 navigation tests passed; the production build passed; all 7 focused
  accessibility, flight and recovery browser tests passed in 29 seconds.
- Final arrival and flight screenshots: no page or console errors. The portrait
  capture uses 393×852; desktop uses 1440×1000. These are Chrome viewport checks,
  not physical phone validation.
- The before/after page was inspected in the in-app browser. Its slider changed
  the split and both flight-approach and portrait selection controls responded.

## Five-minute desktop sample

Source: `profile/measurements.json`, recorded by scripts/profile.mjs. Repeated
lift, forward flight, turns, descent and return-to-terrace cycles kept the player
inside the dense district. Settings: third-person, high quality, DPR 1, 1440×1000,
2048² directional shadow map, cruise keyboard input. No concurrent automated
browser runs were started during this measurement.

| Measurement | Result |
| --- | --- |
| Hardware / backend | Apple M2 Max, ANGLE Metal, WebGL2 |
| OS / browser | Darwin 25.6.0, headless system Chrome 153 |
| Recorded duration / samples | 300 s / 18,000 active frames |
| Median / 95th-percentile frame time | 16.7 ms / 17.4 ms |
| Frames over 50 ms | 0 |
| Peak reported draw calls / submitted triangles | 15 / 575,774 |
| Reported geometry / texture count | 11 / 14 |
| Added runtime environment assets | 3,593,183 bytes |
| Page / console errors | 0 |

The sample meets this proof's 600,000-triangle, 45-draw-call and 10 MB asset
budgets. Renderer.info values are the app's existing renderer counters; they are
not a GPU capture or total memory-byte measurement. The frame ring retains the
latest 18,000 samples and excludes each first resume frame. Power mode and
background system load were not controlled or recorded.

This does not establish physical iPhone Safari performance, thermals, touch
enjoyment or VoiceOver usability. The low tier retains DPR 1 and disables shadows;
this five-minute sample measures the high tier only. Water uses approximate sky
reflection rather than a second rendered view of the city.

## Art scope

The reviewed corridor now combines damaged modern geometry, textured surfaces,
canopy silhouettes, hanging growth, brighter atmosphere and a clear water route.
The approved athletic explorer remains the same asset. This is the first
environment benchmark; bespoke architecture, richer ground detail and the wider
district remain future art work. See README.md for the persistent brief and
REVIEW.md for independent code-review dispositions.
