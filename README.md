# Halaverga · Mount Hermon

A browser flight playtest set on Mount Hermon at dawn in the days of Jared. 1 Enoch 6 describes the Watchers’ descent and oath. The shepherds, their warning and the flight are game fiction.

Choose **Play The Cloven Arch** to intercept a Watcher before it reaches the two shepherds carrying the warning. A snow hollow and an exposed limestone shoulder mark two interception opportunities. The story also has a text account at `/crossing/account`. Choose **Ascend Mount Hermon** for free flight, combat and five source tablets across the massif. [First-flight brief](docs/plans/first-flight.md)

## Run and verify

Use Node 22 and pnpm 10.32.1. Run `pnpm install`, then `pnpm verify`. Use the local managed-preview tool to start `pnpm exec next dev --hostname 127.0.0.1 --port 3366`. Production browser checks require `pnpm build` and a managed `next start` preview on port 3366, followed by `pnpm test:browser`. CI runs `pnpm verify` — TypeScript, unit/physics tests and the production build — on ubuntu; the browser and accessibility checks stay Mac-recorded because their frame-timing thresholds need a real GPU (see `docs/verification.md`).

The local Playwright configuration uses system Chrome on macOS, never Chrome for Testing. `pnpm test:a11y` fails on automated AA violations. Test results, traces and reports are excluded from Git.

## Flight controls

In The Cloven Arch, steer with the arrow keys, WASD or a thumb drag. At close range, press Space or C, tap, or release a steering drag to strike. Both endings offer a replay and the text account.

### Free flight

- On a trackpad, the free cursor steers and an edge hold keeps turning. Scroll with two fingers for speed. Space lifts or starts a cruise with combat enabled. Click while stopped to command a strike, drag to look, and choose Land when aiming at a nearby level surface.
- On the keyboard, use WASD to move, the arrows to look, R/F to rise or descend, B to brake and Shift to surge. Escape pauses. E opens a nearby tablet. Click or press C for each sword cut and hold V to shield.
- On touch, drag the scene to look. Hold Fly to travel, drag the held button to steer and release to hover. Tap a demon to strike again or switch targets. Twin stick, left-handed controls, button sizing and tap controls are available through Controls and Flight settings.
- The Field guide explains the flight styles, offers a text route and lets you read the source tablets. Switching away pauses the game. A safe landing and flight preferences are saved locally.

## Controls demo and vote

- **Controls** opens the same picker from the flight header, pause card and Flight settings. Touch offers One finger, Twin stick, Draw, Conduct and Brush. Desktop offers Cursor, One finger + keys, Flow, Captured, Mouse + keys, Draw, Conduct and Brush. Switching keeps your position and saves your choice. `?controls=<id>` selects a style for one visit. [Control descriptions](docs/controls-demo.md) and [gesture examples](docs/gesture-lab.md).
- On desktop, digits 1–8 select flight styles by default. Turn off **Number keys 1-8 switch controls** in Controls to use the top row during a fight. Press 1 to rebuke, 2 to strike, 3 to bind or 4 to cast.
- Near the flight boundary, a grid and directional cue show how to turn back. Flight eases to a stop as it approaches a solid surface. An edge hold continues turning in all standard flight styles. [Flight decisions](docs/DECISIONS.md)
- The vote asks one question, "Which way of flying felt best?" (round r3). Fly at least two ways for 20 seconds each (until then there is no Vote button: two small dots on **Controls** fill in as ways are flown), then tap **Vote** (it appears beside **Controls** only when the vote works, and again in the Controls sheet and on the pause card), tap the one that felt best or **Can't tell**, and tap **Send vote**. Touch and desktop are counted separately. It is anonymous and unverified (no sign-in, no cookies, no text box), and it is the one thing that sends what you picked, only when you press Send. The game page also sends anonymous visit and step counts to Vercel Web Analytics, nothing at all when your browser sends Do Not Track or Global Privacy Control. A vote over a limit is refused with a "busy" message; nothing is stored for it. Results are at `/results` (a ranking shows once enough people from enough networks have voted) and how a vote is counted is at `/privacy`. Backend (Upstash or Neon), privacy, limits, kill switch and launch steps: [docs/voting.md](docs/voting.md) and [docs/vote-runbook.md](docs/vote-runbook.md). Not checked on an iPhone, a real trackpad, or a real Upstash or Neon store yet.

## Terrain, actors and simulation

The playable summit uses authored ground and matching collision meshes. Beyond the flight boundary, sampled regional elevations carry the ridges to the horizon. The sky, limestone and snow share the dawn lighting. [Elevation and art provenance](docs/art/hermon-sky/PROVENANCE.md)

In free flight, `Player.tsx` drives the Rapier capsule and `CameraRig.tsx` owns the camera. The crossing uses its own fixed-step simulation and one camera controller. The playable angel and adversary load from `archangel.glb` and `watcher.glb`. The body geometry, animation sources, licenses and rebuild procedure are recorded together. [Character provenance](docs/art/real-bodies/PROVENANCE.md)

## Playtest status

Record iPhone Safari in portrait and landscape, VoiceOver and player comfort on a physical device. Desktop WebKit and Chrome viewport emulation provide separate evidence. [Verification history](docs/verification.md)

Run `node scripts/profile.mjs` against a managed production preview for a five-minute desktop free-flight sample. `PLAYTEST_URL` selects the preview, `PROFILE_OUTPUT` selects the report folder and `PROFILE_SECONDS` sets the duration. The report records frame times and resource counts. The measurements panel can also download the most recent 18,000 active frames.

## Deployment

The dedicated Vercel project is `halaverga-flight` in `garo-vartabedians-projects`. Link explicitly before deploying from a new worktree. Use its generated test domain and retain immutable deployment URLs for comparisons. The game itself needs no environment variables. Voting needs one store from the Vercel Marketplace: Upstash for Redis (`KV_REST_API_URL` and `KV_REST_API_TOKEN`; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work) or Neon Postgres (`DATABASE_URL`, used only when no complete Upstash pair is set), and `VOTE_SALT` is **required** (at least 32 random characters, never the store token). Without a store or a valid salt the game works and voting reports that it is not set up; preview deployments never vote unless `VOTE_ALLOW_PREVIEW=1`. Setup steps, including the required Firewall rate-limit rule, are in [docs/vote-runbook.md](docs/vote-runbook.md); the design and the limits are in [docs/voting.md](docs/voting.md). Never commit values or `.env` files. Hand-deploy steps, the post-deploy checks and the rollback target are in [docs/deploy.md](docs/deploy.md); the launch order and the owner-only clicks are in [docs/launch-readiness.md](docs/launch-readiness.md). The purchased Halaverga domain is a later launch decision.
