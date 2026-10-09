# In-game vote

The game has ten ways to fly (see [controls-demo.md](controls-demo.md)), and one vote covers all of them. After trying some, a small card asks which control the player liked best and, for each control they tried, an optional 1-5 rating. Touch screens and desktops vote separately: a touch player chooses among the five touch controls (One finger, Twin stick, Draw, Conduct, Brush) and a desktop player among the eight desktop controls (Cursor, One finger + keys, Flow, Captured, Mouse + keys, Draw, Conduct, Brush). The vote is anonymous: no sign-in, no cookies. The tallies go to a tiny database, and Garo reads them at `/results`.

Anonymous, unverified counts, so treat them as a guide, not a ballot. Nothing proves that a vote came from someone who really played, and the only anti-abuse measure is a limit of 20 votes per hour per network address (see Anti-abuse below).

The vote card is the one thing in the game that leaves the device, and only when the player presses **Send vote**. The Gesture Lab measurements (Flight settings → Control lab measurements) stay on the device as before.

## What "tried" means

A control counts as tried after 20 seconds of actual play on it: a key or pointer held down, or input within the last 2 seconds. Opening the Controls sheet, tabbing through it, stepping through the controls or idling adds nothing. The seconds are kept per device family and control in `localStorage` (`halaverga.vote.play.v2`, checked against the round). Total play is the sum of the player's own family's controls.

## When the card shows

- **Any time**: open the Controls sheet and press **Vote on the controls**, or pause and press **Vote on the controls**. Neither needs a minimum number of controls, but at least one control of the player's family must have its 20 s of play: with none, the card says so and offers only **Keep playing** (no form, and no Skip mark), so someone who only opened the sheet cannot vote for the default. From the sheet the game pauses behind the card (keys and fingers cannot fly it) and resumes on Done, Skip or Keep playing; from a pause the player opened it stays paused. The card shows "Tried X of N" and, when X is below N, "Not tried yet: ..." next to a **Not yet** button, so a vote sent early is an informed one.
- **The pause card leads with the vote** (a nudge at the top) once the player has tried 3 controls of their family (touch and desktop alike) and played 180 s in that family.
- **Automatically, once per page load**: when the player lands (flying to not flying), only after every control of their family has been tried and 180 s have been played in that family. The game pauses first. The card never opens on a pause the player opened. Because this asks for every control, it fires rarely; the button and the pause card are the real routes.
- After a sent vote the device does not ask again for 7 days or until the next round. After **Skip** it stays quiet for 24 hours. Both marks belong to one family (`halaverga.vote.v1` holds `touch` and `desktop` entries), so a touch laptop or an iPad that voted as touch is still asked as desktop, and the other way round.
- Right after an automatic open the card ignores taps for 400 ms and until every finger has lifted, so a thumb still on the screen cannot dismiss it. The keyboard works at once.
- The card lists only the controls the player tried (20 s of play) in their family, with the one they are on first, with a favorite radio and an optional 1-5 rating for each. It shows the family's running tally ("Favorites so far on desktop: Cursor 4 · Draw 2").

## Backend

- **Storage**: Upstash Redis through the Vercel Marketplace, reached with plain `fetch` to its REST `/multi-exec` endpoint. There is no npm dependency.
- **Routes**:
  - `POST /api/vote` records one vote (`src/server/vote/handlers.ts`);
  - `GET /api/results` returns the public tallies as JSON (`src/server/vote/results.ts`);
  - `/results` is a server-rendered page with no client JavaScript and `noindex`, with one table per family (Control, Favorite votes, Share, Tried, Mean rating, Ratings).
- **Reads are cached**: results go through `unstable_cache` for 30 s with a fixed key that carries the round and schema, so query strings cannot bypass it. Upstash is read about once per 30 s per deployment, however often the page is loaded.
- **Build output**: `/` stays static; `/api/vote`, `/api/results` and `/results` are dynamic. `node scripts/check-vote-build.mjs` (after `next build`) checks that the built vote route carries the real build stamp, not `unknown`.

### Environment variable names

Values are set by the integration in the Vercel dashboard. None is ever committed, and none uses a `NEXT_PUBLIC_` prefix.

| Name | Needed | Set by |
|---|---|---|
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | yes | the Upstash integration |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | yes | the Upstash integration |
| `VOTE_SALT` | optional | you, as any long random string. Without it the token is used as the salt |
| `VERCEL_ENV` | automatic | Vercel. Keys are namespaced `hv:production:…`, `hv:preview:…`, or `hv:local:…` |

Without the URL and token the game works normally, `/api/vote` answers 503, and the card says "Voting isn't open on this version yet." `/results` says "Voting isn't set up on this deployment yet."

## What is stored (privacy and retention)

| Data | Where | Kept |
|---|---|---|
| Favorite, ratings, tried controls, touch or desktop (counters, see below) | `hv:<env>:vote:r2:s2` | for the round |
| The server's build stamp | counter in `hv:<env>:builds:r2:s2` | for the round |
| The optional note (at most 280 characters) with its favorite and device | list `hv:<env>:notes:r2:s2:YYYYMMDD`, newest 200 per day | about 90 days, then it expires |
| A scrambled form of the network address (HMAC of the IPv4 address, or of the IPv6 /64 network, + date) | rate-limit key | one hour |
| A random send code (one per Send; the single retry reuses it), with no link to the vote or the address | `hv:<env>:seen:<code>` | one hour |

- No raw IP, no cookie, no account, no user agent and no lab measurement is stored. IPs, bodies and tokens are never logged.
- Notes are never shown on `/results`. The page only counts them. Read them in Vercel → Storage → Open in Upstash → Data Browser, keys starting `hv:production:notes:r2:s2:`.
- The card shows this privacy text word for word (`PRIVACY_LINE` in `src/ui/vote/VoteCard.tsx`):

  > Anonymous. No sign-in, no cookies. We save only your answers, your note if you write one, touch or desktop, and the game version. Notes are deleted after about 90 days. To stop repeat votes, a scrambled form of your network address and a random send code are kept for one hour, then deleted. Your lab measurements stay on this device.

- The note field is labelled "Anything else? (optional, please leave out your name or contact details)".
- On the device itself, `localStorage` keeps seconds played per control (`halaverga.vote.play.v2`) and the voted or skipped mark (7-day lock, 24-hour quiet after Skip). It never leaves the device. Blocked or unreadable storage falls back to safe defaults (nothing played, never voted).

## Rounds, schema and the key tag

`VOTE_ROUND` in `src/lib/vote/shape.ts` is `r2` and `VOTE_SCHEMA` is `2`. Every server key carries one tag built from both, `VOTE_KEY_TAG = r2:s2`, so a later change to the payload shape can never mix into older data:

- `hv:<env>:vote:r2:s2` (the counter hash)
- `hv:<env>:builds:r2:s2`
- `hv:<env>:notes:r2:s2:YYYYMMDD`

Bump the round (to `r3`, and so on) when the controls change meaningfully: the new round starts from zero, every device may vote again, and old rounds stay readable in Upstash under their own tag.

- **r1 to r2 (2026-09-28).** r1 counted four styles (Standard, Draw, Conduct, Brush) with one shared favorite tally. r2 covers ten control types with a separate tally for touch and for desktop, so the numbers could not be compared and everyone needs to be able to vote again. The r1 keys (`hv:<env>:vote:r1` and so on) are left in place and are no longer read.
- **Payload.** A vote must carry `v: 2`. A body with no `v`, a `v` of 1, a favorite, tried or rated id outside the device's family, or the old `standard` answers 400 like any other bad vote. A tab left open from before this change therefore gets 400, and the card tells the player to reload the page and try again. The send code (`nonce`) is required: the card always sends one, so the repeat-send guard always applies.
- **Allowed ids.** The server checks the favorite, `tried` and `ratings` against `controlsFor(device)` from `src/game/controlTypes.ts`, the same pure module the game reads. There is no second list. `tried` may hold 1 to N ids (N is the family size, 5 or 8).
- **Counters** in `hv:<env>:vote:r2:s2`, per family: `total`, `dev:<device>`, `fav:<device>:<id>`, `tried:<device>:<id>`, `rsum:<device>:<id>` and `rn:<device>:<id>` (rating sum and count), plus `stale` (votes from an old build) and `notes`. The old cross-family `fav:<id>` and favorite-by-device fields are gone.
- **Results shape** (`GET /api/results`): `{v: 2, round, total, notes, stale, builds, families: {touch: {votes, controls: {<id>: {favorite, share, tried, rating: {avg, n}}}}, desktop: {...}}}`. Every control of a family has a row, zeros included. `share` is an integer percent of that family's votes. `avg` is `null` below 3 ratings. `/results` renders one table per family from the same data.

## Anti-abuse, stated honestly

Results are anonymous and unverified. Nothing proves that a voter played, which controls they really tried, or that they are one person. "Tried" is checked on the device only. The only limit on a single voter is 20 votes per hour per network address (the global cap and the Firewall rule below only bound total volume), so treat the tallies as a guide, not a ballot. Clearing site data and changing network allows another vote.

- 20 votes per network address per hour. The check runs first and on its own, so one spammer cannot use up the global limit. An IPv6 caller counts by its /64 network (review 2026-09-25): home and VPS users hold a whole /64, so keying on the full address let one person send each request from a fresh address and fill the global hour alone.
- A retried Send is counted once: the card sends a random send code, the one retry reuses it, and the server skips a code it saw in the last hour. A failed write releases the code so the retry still counts.
- Every Upstash call gives up after 2.5 s (the card waits 6 s), so a hung store never holds the function open.
- 600 votes per hour for the whole deployment, counting only votes that passed the per-address check.
- Each server instance also remembers repeat spam for the hour and stops calling Upstash for it.
- The device remembers a sent vote for 7 days or until a new round, separately for touch and desktop.
- A required Vercel Firewall rule (below) stops floods before they reach the function.
- Clearing site data and changing network allows another vote. That is acceptable for a playtest poll.
- Any "too many" answer (429) tells the player to try later. It never marks the device as voted and never claims the vote counted.

## Cost and quota

- A real vote costs up to about 30 commands (a favorite, up to 8 tried ids and up to 16 rating counters and sums, plus the shared counters, the note and the limits). A vote with few tried controls costs less. A rate-limited request costs at most 2, and 0 once the instance pre-limit trips. Results cost 1 transaction per 30 s at most.
- The Upstash free plan has a monthly command allowance and a storage cap (check the current numbers in the Upstash console). A playtest poll uses a tiny fraction of it.
- A flood from many different networks (many IPv4 addresses or many /64s, which takes real resources) could still fill the global hour or use up the free allowance. The per-address limit does not stop it; the Firewall rule in step 4 is the launch gate: **add it before sharing the link publicly.**
- Unchanged from before: a request with no Origin and no Sec-Fetch-Site header (curl, not a browser) passes the same-origin check, and a vote carries no proof of play. The limits above are the protection. If that happens, voting says "try later" or "not open". **The game keeps working**, because nothing in flight depends on the vote.

## Garo's steps (in the Vercel dashboard, not done by any agent)

All of these are still required before the link is shared publicly (Upstash, the optional `VOTE_SALT`, the Firewall rule and a redeploy). None has been done.

1. Open the `halaverga-flight` project → **Storage** → **Create Database** → **Upstash for Redis** (Marketplace). Pick the free plan and a region near Austin.
2. **Connect** it to the project for Production (and Preview if you want to test on preview links). This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (plus a few names the game does not use).
3. Optional: **Settings → Environment Variables** → add `VOTE_SALT` with any long random value, for Production and Preview.
4. **Required before sharing the link: Firewall rate-limit rule.** Project → **Firewall** → **Configure** → **New rule**: if the request path is `/api/vote`, `/api/results` or `/results`, then **Rate limit** by IP (for example 30 requests per 60 s), action **Deny** (429). If your plan does not offer the rate-limit action, note that here. The in-app per-address and global limits still apply, and you can add a plain Deny rule later if a flood ever shows up.
5. **Redeploy from the dashboard** (Deployments → the latest production deployment → Redeploy), so the functions see the new variables.
6. Open `/results` on the live site. It should say round r2 with 0 votes and show one empty table per family. Play, vote once from the pause card, and check that the total becomes 1 after about 30 s.

## Tests

- Node: the handler, store, hash, limits and payload rules (`tests/vote-*.test.ts`) run against a fake Redis that counts calls. No test reaches a real database.
- Browser: `tests/vote.spec.ts` mocks `/api/vote` and `/api/results` with `page.route`.
- Not done: voting on a real phone against a real Upstash database. Record it in the device checklist in [gesture-lab.md](gesture-lab.md).
