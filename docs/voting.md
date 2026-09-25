# In-game vote

After playing, a small card asks which control style the player liked (Standard, Draw, Conduct or Brush) and, for each style they tried, an optional 1-5 rating. It is anonymous: no sign-in, no cookies. The tallies go to a tiny database, and Garo reads them at `/results`.

The vote card is the one thing in the game that leaves the device, and only when the player presses **Send vote**. The Gesture Lab measurements (Flight settings → Control lab measurements) stay on the device as before.

## When the card shows

- **Automatically, once per page load**: when the player lands (flying to not flying) after playing about 3 minutes in total and trying at least 2 styles for 30 s or more. The game pauses first. The card never opens on a pause the player opened.
- **Any time**: pause, then **Vote on the controls**.
- After a sent vote the device does not ask again for 7 days or until the next round. After **Skip** it stays quiet for 24 hours.
- Right after an automatic open the card ignores taps for 400 ms and until every finger has lifted, so a thumb still on the screen cannot dismiss it. The keyboard works at once.

## Backend

- **Storage**: Upstash Redis through the Vercel Marketplace, reached with plain `fetch` to its REST `/multi-exec` endpoint. There is no npm dependency.
- **Routes**:
  - `POST /api/vote` records one vote (`src/server/vote/handlers.ts`);
  - `GET /api/results` returns the public tallies as JSON (`src/server/vote/results.ts`);
  - `/results` is a server-rendered page with no client JavaScript and `noindex`.
- **Reads are cached**: results go through `unstable_cache` for 30 s with a fixed key, so query strings cannot bypass it. Upstash is read about once per 30 s per deployment, however often the page is loaded.
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
| Favorite, ratings, tried styles, touch or desktop | counters in `hv:<env>:vote:r1` | for the round |
| The server's build stamp | counter in `hv:<env>:builds:r1` | for the round |
| The optional note (at most 280 characters) with its favorite and device | list `hv:<env>:notes:r1:YYYYMMDD`, newest 200 per day | about 90 days, then it expires |
| A scrambled form of the network address (HMAC of IP + date) | rate-limit key | one hour |

- No raw IP, no cookie, no account, no user agent and no lab measurement is stored. IPs, bodies and tokens are never logged.
- Notes are never shown on `/results`. The page only counts them. Read them in Vercel → Storage → Open in Upstash → Data Browser, keys starting `hv:production:notes:r1:`.
- The card shows this privacy text word for word (`PRIVACY_LINE` in `src/ui/vote/VoteCard.tsx`):

  > Anonymous. No sign-in, no cookies. We save only your answers, your note if you write one, touch or desktop, and the game version. Notes are deleted after about 90 days. To stop repeat votes, a scrambled form of your network address is kept for one hour, then deleted. Your lab measurements stay on this device.

- The note field is labelled "Anything else? (optional, please leave out your name or contact details)".
- On the device itself, `localStorage` keeps seconds played per style and the voted or skipped mark (7-day lock, 24-hour quiet after Skip). It never leaves the device. Blocked or unreadable storage falls back to safe defaults (nothing played, never voted).

## Rounds

`VOTE_ROUND` in `src/lib/vote/shape.ts` is `r1`. Bump it (to `r2`, and so on) when the controls change meaningfully: the new round starts from zero, every device may vote again, and old rounds stay readable in Upstash.

## Anti-abuse, stated honestly

- 20 votes per network address per hour. The check runs first and on its own, so one spammer cannot use up the global limit.
- 600 votes per hour for the whole deployment, counting only votes that passed the per-address check.
- Each server instance also remembers repeat spam for the hour and stops calling Upstash for it.
- The device remembers a sent vote for 7 days or until a new round.
- A required Vercel Firewall rule (below) stops floods before they reach the function.
- Clearing site data and changing network allows another vote. That is acceptable for a playtest poll.
- Any "too many" answer (429) tells the player to try later. It never marks the device as voted and never claims the vote counted.

## Cost and quota

- A real vote costs about 14-18 Redis commands. A rate-limited request costs at most 2, and 0 once the instance pre-limit trips. Results cost 1 transaction per 30 s at most.
- The Upstash free plan has a monthly command allowance and a storage cap (check the current numbers in the Upstash console). A playtest poll uses a tiny fraction of it.
- A flood from many different addresses could still fill the global hour or use up the free allowance. If that happens, voting says "try later" or "not open". **The game keeps working**, because nothing in flight depends on the vote.

## Garo's steps (in the Vercel dashboard, not done by any agent)

1. Open the `halaverga-flight` project → **Storage** → **Create Database** → **Upstash for Redis** (Marketplace). Pick the free plan and a region near Austin.
2. **Connect** it to the project for Production (and Preview if you want to test on preview links). This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (plus a few names the game does not use).
3. Optional: **Settings → Environment Variables** → add `VOTE_SALT` with any long random value, for Production and Preview.
4. **Required: Firewall rate-limit rule.** Project → **Firewall** → **Configure** → **New rule**: if the request path is `/api/vote`, `/api/results` or `/results`, then **Rate limit** by IP (for example 30 requests per 60 s), action **Deny** (429). If your plan does not offer the rate-limit action, note that here. The in-app per-address and global limits still apply, and you can add a plain Deny rule later if a flood ever shows up.
5. **Redeploy from the dashboard** (Deployments → the latest production deployment → Redeploy), so the functions see the new variables.
6. Open `/results` on the live site. It should say round r1 with 0 votes. Play, vote once from the pause card, and check that the total becomes 1 after about 30 s.

## Tests

- Node: the handler, store, hash, limits and payload rules (`tests/vote-*.test.ts`) run against a fake Redis that counts calls. No test reaches a real database.
- Browser: `tests/vote.spec.ts` mocks `/api/vote` and `/api/results` with `page.route`.
- Not done: voting on a real phone against a real Upstash database. Record it in the device checklist in [gesture-lab.md](gesture-lab.md).
