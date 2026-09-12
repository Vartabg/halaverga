# Halaverga · Return to Earth

A browser flight study through Meridian, a fictional modern hillside city damaged in 2033 and visited in 2113. Assisted free flight, water skimming, cancellable landing, first/third person, touch and keyboard controls, and one clearly fictional municipal record.

## Run and verify

Use Node 22 and pnpm 10.32.1. Run `pnpm install`, then `pnpm verify`. Use the local managed-preview tool to start `pnpm exec next dev --hostname 127.0.0.1 --port 3366`. Production browser checks require `pnpm build` and a managed `next start` preview on port 3366, followed by `pnpm test:browser`. CI manages its own server and tests after a production build.

The local Playwright configuration uses system Chrome on macOS, never Chrome for Testing. `pnpm test:a11y` fails on automated AA violations. Test results, traces and reports are excluded from Git.

## Controls

- Trackpad only (desktop default): click the open scene to lift and cruise; move the pointer to steer. Hold near an edge to keep turning. Two-finger scroll up accelerates and down slows. Click again to brake and hover. While hovering, click and drag to look around; aim at a nearby flat surface and click Land. Moving onto a button or outside the scene stops cruise. No held click, pointer capture mode, or keyboard is required.
- Keyboard: WASD move; arrow keys look; R/F rise/descend; Space lift/land; Shift toggle Surge; Escape pause; E read a nearby terminal. For captured mouse look, choose “Mouse + keyboard” in Flight settings and click the scene. Trackpad mode remains available if mouse capture is unavailable.
- One thumb: hold anywhere in the open scene to lift and cruise. Slide to aim (left/right turn, up/down climb/descend); drag farther for smoothly increasing speed. Holding near an edge keeps turning. Release to hover. A quick tap does not start flight.
- Two thumbs: add a second scene contact to recenter into left movement/right view. Drag the left thumb forward/back/sideways; drag farther for more speed. The right thumb aims independently, including upward/downward flight while moving forward. Center the left thumb to hover. Roles remain fixed if fingers cross. Lift either thumb, then slide the remaining thumb to resume one-thumb flight. No mode switch or separate Surge button is needed.
- Aim toward a flat surface to reveal its landing ring, release, then tap Land. New flight input cancels landing. The active flight surface owns touch gestures; pause or open the Field guide to use native pinch zoom. The page has no zoom-limit metadata. Game controls suppress selection and long-press callouts; the guide remains selectable.
- Field guide offers the same discovery as readable text. Settings include perspective, graphics, reduced camera motion, audio, reset, and a local timing-report download.
- Optional tap controls provide short directional movements and separate view buttons without dragging. They are hidden by default to keep the scene clear.

## Architecture and original assets

Next.js/React hosts a lazy-loaded R3F/Three.js WebGL2 scene. Rapier's kinematic capsule sweeps handle collisions. `game/Player.tsx` owns motion; `game/CameraRig.tsx` owns the camera; keyboard, trackpad and touch share `runtime.ts` input. Preferences and safe checkpoints are stored locally. No account, database, or model request is needed to fly.

The suit and camera share one interpolated physics anchor. Six articulated suit parts blend through acceleration, streamlined flight, turns and braking. Exterior building volumes, advance clearance sweeps and contact-corrected velocity prevent entry into unfinished interiors. The district perimeter brakes approaching flight; supported landings and saved checkpoints are checked against the actual geometry. The Field guide includes a route map. `docs/navigation-audit.json` records the finite route and high-speed regression evidence; it is not an exhaustive guarantee of every trajectory.

City geometry is generated deterministically and combined into one colored mesh. The suit is an original Blender model: regenerate with `Blender --background --factory-startup --python scripts/build-suit.py`. The untextured GLB, procedural city, shaders, icon, and fictional record are project-original. No third-party art, recordings, or copyrighted game assets are included. Dependencies retain their respective licenses.

## Playtest status

The reconnaissance suit uses a fitted graphite pressure layer, sculpted ceramic armor, a continuous visor and a flush power spine. Its six animated sections batch by material, preserving the authored roughness, metallic response and emission. The original GLB has no texture dependencies. The player collider and camera remain independent of the model.

With the managed production preview running on port 3366, `node scripts/review-suit.mjs` renders a front/profile/rear study of the actual GLB using system Chrome. It writes `/tmp/halaverga-suit-study.png`; set `SUIT_REVIEW_OUTPUT` to choose another destination. This temporary review page is intercepted locally and is not a public game route. [Recorded material study](docs/images/suit-study.png).

This is a playtest candidate, not a measured iPhone release. Physical iPhone Safari, VoiceOver and subjective enjoyment checks must be recorded by the tester. Desktop viewport emulation and headless Mac timing are separately identified. See `docs/verification.md` for evidence and remaining checks.

Run `node scripts/profile.mjs` against a production preview for a five-minute desktop route sample. `PROFILE_OUTPUT` selects the report folder; `PROFILE_SECONDS` sets duration; `PROFILE_SURGE=1` uses maximum-speed flight. A first frame after resume is excluded; reports retain the most recent 18,000 active frames. These reports stay on the device until downloaded.

## Deployment

The dedicated Vercel project is `halaverga-flight` in `garo-vartabedians-projects`. Link explicitly before deploying from a new worktree. Use its generated test domain and retain immutable deployment URLs for comparisons. This project does not require environment variables. The purchased Halaverga domain is a later launch decision.
