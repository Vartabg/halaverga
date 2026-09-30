# Vote runbook

For the person who runs the poll. Everything here is done in the Upstash or Neon console, the Vercel dashboard, or your own terminal. No agent does the dashboard steps, and no agent holds the store credentials. How the vote works and what it stores: [voting.md](voting.md). Check 30 minutes after posting the link, then daily. There is no public alarm signal: the audit and a count of the stored votes are the alarms.

**Kill switch.** The fastest is one row: `mode closed`. You can ask Claude to close the vote (in a session where you connected the store yourself) or paste the line yourself; both run the same statement from the list below. It needs no redeploy: every instance reads it on its next vote and holds `closed` for 30 s. Votes then answer 503, the card says `Voting isn't open right now.` after Send, `/api/results` says `open:false` and the tally is still shown.

## 1. Switches, fastest first

| Switch | Effect | Speed |
|---|---|---|
| Close the vote (`mode closed`) | votes answer 503 `closed` | next vote; each instance holds it 30 s |
| Reopen (delete `mode`) | votes are accepted again | within 30 s per instance |
| Shield (`unit 4 block 10 global 300 cap 3`) | more votes get 429, and each network group counts for at most 3 votes a day per family | next vote; `cap` re-scores history at the next results refresh |
| Share day (`unit 20 block 200 global 3000 cap 40 max 12000 round 50`) for a venue, a class or a planned surge | shared-network votes are counted instead of refused. Afterwards clear the knobs. | next vote; **`cap` re-scores every past day**, check `asOf` and re-run the audit |
| `minv 200` | raises the ranking floor above its default of 100 (use when the audit shows stuffing at launch) | next results refresh |
| `max 12000` | raises the ceiling on stored votes | next vote |
| Enable Firewall rule K1 (and K2) | denied at the edge before any function or store call | seconds |
| Pause the Vercel project | takes the game down too. Last resort. | seconds |

Only `cap`, `minv` and the void set change what the reader shows. `unit`, `block`, `global` and `max` decide only whether a new vote is stored. A knob outside its range (unit 1 to 200, block 1 to 2000, global 1 to 20000, max 100 to 20000, cap 2 to 100, minv 10 to 1000, round 1 to 1000) is ignored and the default applies. **Raising a limit mid-day:** a key an instance already refuses from memory (over twice its limit) stays refused on that instance until the next UTC day, because a refused request never reaches the store to see the new value; the 60 s latches clear by themselves.

## 2. The console lines, Upstash and Neon side by side

In the Upstash console CLI tab (or `redis-cli` with your own token) use the first block of each pair; in the Neon SQL editor use the second. `hv:production` is the live namespace (`hv:preview` is preview). The example day `20260930`, hour `2026093014` and group `a3f` are placeholders: use the values the audit prints. Nothing is ever deleted by a void, and un-voiding restores the votes. The Neon statements are proved against a real PostgreSQL next to the Redis lines (`pnpm test:pg`), and `tests/vote-docs.test.ts` fails if this page and `src/server/vote/neonRunbook.ts` drift apart.

**Kill switch: close the vote**

Upstash:

```
HSET hv:production:ctl mode closed
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','mode','closed') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Reopen the vote**

Upstash:

```
HDEL hv:production:ctl mode
```

Neon SQL:

```sql
DELETE FROM public.hv_hash WHERE k = 'hv:production:ctl' AND field = 'mode';
```

**Shield: tighter limits for a scare**

Upstash:

```
HSET hv:production:ctl unit 4 block 10 global 300 cap 3
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','unit','4'),('hv:production:ctl','block','10'),('hv:production:ctl','global','300'),('hv:production:ctl','cap','3') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Share day: wider limits**

Upstash:

```
HSET hv:production:ctl unit 20 block 200 global 3000 cap 40 max 12000 round 50
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','unit','20'),('hv:production:ctl','block','200'),('hv:production:ctl','global','3000'),('hv:production:ctl','cap','40'),('hv:production:ctl','max','12000'),('hv:production:ctl','round','50') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Change the per-group cap on counted votes** (the favorite cap follows it: two fifths of `cap`, at least 1, so `cap 3` allows 2 ballots naming the same favorite per group and `cap 2` allows 1; `cap 2` is the tightest shield while an attack runs)

Upstash:

```
HSET hv:production:ctl cap 3
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','cap','3') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Change the votes needed before a ranking shows**

Upstash:

```
HSET hv:production:ctl minv 200
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','minv','200') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Change the ceiling on stored votes**

Upstash:

```
HSET hv:production:ctl max 12000
```

Neon SQL:

```sql
INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','max','12000') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;
```

**Put the limits back to their defaults**

Upstash:

```
HDEL hv:production:ctl unit block global cap max round
```

Neon SQL:

```sql
DELETE FROM public.hv_hash WHERE k = 'hv:production:ctl' AND field IN ('unit','block','global','cap','max','round');
```

**Show the knobs**

Upstash:

```
HGETALL hv:production:ctl
```

Neon SQL:

```sql
SELECT field, value FROM public.hv_hash WHERE k = 'hv:production:ctl' ORDER BY field;
```

**Void one network group for a day**

Upstash:

```
SADD hv:production:void:r3:s3 T:20260930:a3f
```

Neon SQL:

```sql
INSERT INTO public.hv_set (k, member) VALUES ('hv:production:void:r3:s3','T:20260930:a3f') ON CONFLICT DO NOTHING;
```

**Void one network group for one hour**

Upstash:

```
SADD hv:production:void:r3:s3 T:2026093014:a3f
```

Neon SQL:

```sql
INSERT INTO public.hv_set (k, member) VALUES ('hv:production:void:r3:s3','T:2026093014:a3f') ON CONFLICT DO NOTHING;
```

**Void a whole hour**

Upstash:

```
SADD hv:production:void:r3:s3 2026093014
```

Neon SQL:

```sql
INSERT INTO public.hv_set (k, member) VALUES ('hv:production:void:r3:s3','2026093014') ON CONFLICT DO NOTHING;
```

**Un-void a group**

Upstash:

```
SREM hv:production:void:r3:s3 T:20260930:a3f
```

Neon SQL:

```sql
DELETE FROM public.hv_set WHERE k = 'hv:production:void:r3:s3' AND member = 'T:20260930:a3f';
```

**List the voids**

Upstash:

```
SMEMBERS hv:production:void:r3:s3
```

Neon SQL:

```sql
SELECT member FROM public.hv_set WHERE k = 'hv:production:void:r3:s3' ORDER BY member;
```

**How many votes are stored**

Upstash:

```
HLEN hv:production:vote:r3:s3
```

Neon SQL:

```sql
SELECT count(*) FROM public.hv_hash WHERE k = 'hv:production:vote:r3:s3';
```

**Reset the poll (after the launch check)**

Upstash:

```
DEL hv:production:vote:r3:s3
```

Neon SQL:

```sql
DELETE FROM public.hv_hash WHERE k = 'hv:production:vote:r3:s3';
```

**Today's counted-request counter**

Upstash:

```
GET hv:production:rlg:20260930
```

Neon SQL:

```sql
SELECT v, exp FROM public.hv_kv WHERE k = 'hv:production:rlg:' || to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD');
```

**Audit: votes per day and network group (an entry is 18 characters: hour 1-10, device 11, favorite 12, mask 13-14, last 15, tag 16-18)** (Neon SQL only; for Upstash use `node scripts/vote-audit.mjs`)

```sql
SELECT substr(value,1,8) AS day, substr(value,16,3) AS tag, count(*) AS n FROM public.hv_hash WHERE k = 'hv:production:vote:r3:s3' GROUP BY 1,2 ORDER BY n DESC, tag LIMIT 20;
```

**Audit: votes per hour** (Neon SQL only; for Upstash use `node scripts/vote-audit.mjs`)

```sql
SELECT substr(value,1,10) AS hour, count(*) FROM public.hv_hash WHERE k = 'hv:production:vote:r3:s3' GROUP BY 1 ORDER BY 1;
```


## 3. Signals and actions

| Signal | Meaning | Action |
|---|---|---|
| Audit names a network group over the cap, or one group that is 30% or more of a day | one network is stuffing (already scaled to `cap` votes) | to remove it entirely, void `T:<day>:<group>` |
| Audit flags 10 or more groups with the same count of 3 or more, or one control 70% or more of a day with 30+ votes, or an hour more than 3x the median | spread stuffing | void the named groups; set `cap 3` and `minv 200`; if the groups cannot be named, void the hour (this also drops honest votes) |
| Today's `rlg` counter at or over the global limit, or the stored-vote count near 6,000 | the counted budget is used up: every further vote gets 429 until the next UTC day (global limit) or until `max` is raised | void flooded groups first; if the audit shows honest volume, raise `global` or `max` (the 60 s latch clears by itself) |
| Upstash command graph jumps (Neon: compute hours jump) | wallet attack or a bug | close the vote, enable K1, read the Firewall traffic, rotate the store credentials if in doubt |
| Vercel bill or transfer alarm | static or invocation flood | enable Firewall rules 5 and 6; last resort pause the project |
| 429 for many honest visitors | a shared address or block over its day limit, a network over its 30-day round limit (`round`, no Retry-After is sent for it), or the day's global limit or the ceiling reached (the results then say `open:false`) | read the audit for the cause; for an event use the share-day preset; visitors keep their pick and can send again after 00:00 UTC |
| Token, connection string or salt exposed | privacy or write access | rotate the Upstash token, or reset the Neon role password, in the console and redeploy; rotating `VOTE_SALT` unlinks every rate key and every network group code from that day on, and nothing else |
| Result found poisoned late | tally skew | void the named groups (or hours); nothing is deleted and it is reversible; a whole-hour void also drops honest votes |
| A code fix changes vote-server rules, the weights or the group cap maths | old deployments could still write, or history re-scores | bump `VOTE_ROUND` in the same release, reset the store credentials, redeploy, delete old production deployments, confirm Deployment Protection is Standard |
| Public numbers look stale after a change | the 120 s cache plus the 120 s CDN | wait about 4 minutes under continuous traffic (an idle site refreshes on the next visit) and check `asOf` on `/api/results` |

## 4. The audit

**Upstash:** in your own shell, with your own credentials exported (never committed):

```
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/vote-audit.mjs --hours 48 --env production --yes
```

`KV_REST_API_URL` and `KV_REST_API_TOKEN` work too, `--env` defaults to `production` (or `VOTE_ENV`), `--hours` is 1 to 720 (default 48), and reading production needs `--yes`. It is read-only (it sends only `HGETALL`, `SMEMBERS`, `HLEN` and `GET`), never prints the URL or the token, and refuses a non-https store URL except on the local machine. It prints, per UTC hour: the entries, the top 3 network groups, the top pick and its share, the picks per control and the share of entries whose pick is the control flown last; per UTC day: the `rlg` counter, the entries, the counted votes after the cap against the capped ones, the largest groups and how many groups have 1, 2, 3, 4 or 5+ entries; the stored-vote count, the void set and the knobs; and ready-to-paste `SADD ...void:r3:s3 T:<day>:<group>` lines for every group over the cap. **Flags:** a group above `cap`; a group 30% or more of a day; one control 70% or more of a day with 30+ entries of a family; 10 or more groups with the same count of 3 or more; an hour more than 3 times the median of the hours that have entries; a flat count (variation under 0.25) across 6 or more consecutive hours; the pick being the last-flown control in 70% or more of 30+ entries. Entries already voided are left out, so a void makes its flag go away. Check `asOf` on `/api/results` afterwards.

**Neon:** the script reads Upstash only. Run the two audit SELECTs above (`Audit: votes per day and network group`, `Audit: votes per hour`) in the Neon SQL editor, read `counted-today` for the `rlg` counter, and void a group with the `void-group` statement. A Neon mode for the script is out of scope.

## 5. Local and LAN demos

Off Vercel every client is the single address `local`, so under the default limits the 9th vote from a local or LAN address gets 429. `node scripts/fake-upstash.mjs --demo` (dev only, in memory, `127.0.0.1` only, refuses to run on Vercel) seeds 40 sample touch votes from 14 network groups and presets `ctl unit 200 block 200 global 20000 round 1000 minv 30` (the default ranking floor is 100 votes), printing `demo data seeded: 40 votes, 14 groups; ctl unit, block, global, round raised, minv 30`. Then, on a production build:

```
node scripts/fake-upstash.mjs --port <store port> --demo &
KV_REST_API_URL=http://127.0.0.1:<store port> KV_REST_API_TOKEN=dev-token \
VOTE_SALT=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") \
  pnpm exec next start --port <free port>
```

`/results` then ranks touch at once and a person can test with up to 200 votes a day. `dev-token` belongs to the fake store only. Never use these overrides on a real deployment. `scripts/vote-live-check.mjs --app ... --store ... --phase functional|unit|global` runs the end-to-end check against the same fake (one fresh app process per phase; the recipe is at the top of the script).

## 6. Before the link goes public (do these in order)

None has been done. The app reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then `KV_REST_API_URL` and `KV_REST_API_TOKEN`; else `DATABASE_URL` (then `POSTGRES_URL`); it also reads `VOTE_SALT`, `VOTE_ALLOW_PREVIEW`, and Vercel's own `VERCEL` and `VERCEL_ENV`.

1. **Connect a store to Production only.** Vercel dashboard, the `halaverga-flight` project, Storage.
   - **Upstash for Redis:** Create Database, Upstash for Redis. The free plan is fine (check its monthly command allowance in the console); pay-as-you-go with a monthly spend cap is the safer launch plan. Match the region to your Vercel functions (default Washington, `iad1`, so Upstash `us-east-1`); every vote makes 1 to 3 round trips. Untick Preview and Development. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the app does not use the other names it adds).
   - **Or Neon:** connect a Neon resource, again to Production only (the CLI equivalent is the `-e production` flag of `vercel integration add`). Choose the AWS region that matches your functions. **Do not use a `--prefix`.** This adds `DATABASE_URL` (the pooled string, which the app uses) and `POSTGRES_URL`. If both Upstash and Neon variables exist, Upstash is used. Read the Neon plan's storage and compute allowance in its console first: a vote more often than every 5 minutes keeps the compute awake all day.
2. **Set `VOTE_SALT` (required).** Settings, Environment Variables, add `VOTE_SALT` for Production only, sensitive on. Value: run `openssl rand -hex 32` in your own terminal and paste the 64 characters. At least 32 characters, never the store token. Without it voting stays closed.
3. **Firewall rate limit and kill switch.** First read your plan's limits: Firewall, how many custom rules and rate-limit rules you can create; Settings, Billing, whether Spend Management exists. Write down what you find. **If the plan cannot rate limit `/api/vote`, do not publish the link.** Create the minimum set (rules 1, 2 and K1) from the table below, K1 **disabled**. Only Deny or Rate limit actions, never Challenge or Attack Challenge Mode (a challenge sets a Vercel cookie, which the card says does not exist, and a `fetch` cannot solve it).
4. **Check Deployment Protection:** Standard or stronger, including previews, so old deployment URLs and preview URLs are not public.
5. **Redeploy from the dashboard** (Deployments, the latest production deployment, Redeploy) so the functions see the new variables. Confirm **Automatically expose System Environment Variables** is on: if `VERCEL` and `VERCEL_ENV` are missing the app treats every visitor as one address and stores under `hv:local`.
6. **Check the live site** from your terminal or phone: (a) `curl -I` on `/`, `/results`, `/privacy`, `/api/results` and `/api/vote` shows the headers in [voting.md](voting.md) (`X-Frame-Options: DENY`, the API CSP, no `Set-Cookie`, and on `/results` `public, max-age=0, s-maxage=120`); (b) send one `POST /api/vote` with a forged `X-Forwarded-For` and `X-Vercel-Forwarded-For` and confirm the number of `rl:u:` keys (Neon: `hv_kv` rows) did not grow per spoofed value; (c) enable and disable Firewall rule K1 once; (d) close the vote, send a vote and see the card say voting isn't open, then reopen (about 30 s); (e) vote once from your iPhone in Safari, portrait and landscape, and once from a desktop trackpad: the stored-vote count is 2 and each entry is 18 characters (this also confirms the key is `hv:production:*`, not `hv:local`); (f) `/results` shows no per-control numbers below the floor and links to `/privacy`, and `/privacy` shows the privacy text. **Then reset the poll before sharing the link** with the `reset-poll` line above (your test votes must not stay in the real tally; they also used a few of today's limits, which reset at 00:00 UTC).

**Firewall rules** (Project, Firewall, Configure). Build them in this order and stop when the quota is used; the minimum set is 1, 2 and K1.

| # | Priority | Match | Action |
|---|---|---|---|
| 1 | must | path `/api/vote` | Deny if the method is not POST; rate limit **20 per 60 s per IP** (a classroom on one address still fits; the in-app limits are finer) |
| 2 | must | path `/api/results` or `/results` | rate limit 30 per 60 s per IP |
| K1 | must | path starts with `/api/vote` | Deny, **created disabled** (kill switch A) |
| 3 | if quota | path `/api/results` and a non-empty query string | Deny (only the JSON route: in-app browsers append tracking parameters to shared `/results` links) |
| 4 | if quota | any path, method not in GET, HEAD, POST, OPTIONS | Deny (removes TRACE) |
| K2 | if quota | path `/results` or `/api/results` | Deny, **created disabled** (kill switch B) |
| 5 | if quota | path starts with `/models/`, `/textures/`, `/docs/` | rate limit 300 per 60 s per IP, **created disabled** |
| 6 | if quota | path starts with `/_next/static/` | rate limit 600 per 60 s per IP, **created disabled** |

Rules 5 and 6 start disabled because one phone session fetches about 9 model and texture files and about 40 script chunks, so a low per-IP limit would break the game for a class or a carrier address before anyone reaches the vote. Enable them only when a transfer alarm fires. Check whether the IP rate-limit key groups IPv6 by /64; if not, note it here (the in-app block limit still applies).

**Optional extras.** The rest of the Firewall rules as the quota allows; Spend Management (Settings, Billing) with an amount and the pause action, or, if the plan has none, a note that the Hobby plan pauses the project at its own limits; `curl -I https://<your-domain>/docs/art/reclaimed-boulevard/index.html` to see whether the public review page is deployed (200 means it counts toward transfer, 404 means rule 5 needs no `/docs/` part); a second throwaway database connected to Preview only, with a different `VOTE_SALT` and `VOTE_ALLOW_PREVIEW=1`, so you can vote on a preview link from your phone without touching the real poll (use a Vercel share link or a protection bypass so the phone can open it); the audit daily while the poll is public; and recording the iPhone check honestly in the device checklist in [gesture-lab.md](gesture-lab.md).

## If the store is Neon

Everything above applies; these are the differences and the honest limits.

**Selection.** Upstash wins when both are configured. Neon is used when `DATABASE_URL` (else `POSTGRES_URL`) is a `postgres://` or `postgresql://` string with a user, a password, a host with a dot and a database name, and no complete Upstash pair exists. Otherwise the vote is closed. Preview stays closed without `VOTE_ALLOW_PREVIEW=1`.

**Schema.** Created on the first request of each server instance; you may paste the same five statements into the Neon SQL editor first (`IF NOT EXISTS` makes that harmless):

```sql
SELECT pg_advisory_xact_lock(hashtext('halaverga_vote_ddl'));

CREATE TABLE IF NOT EXISTS public.hv_kv (
  k   text PRIMARY KEY,
  v   text NOT NULL,
  exp timestamptz
);

CREATE INDEX IF NOT EXISTS hv_kv_exp_idx ON public.hv_kv (exp) WHERE exp IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hv_hash (
  k     text NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (k, field)
);

CREATE TABLE IF NOT EXISTS public.hv_set (
  k      text NOT NULL,
  member text NOT NULL,
  PRIMARY KEY (k, member)
);
```

The role in the connection string must be allowed to create tables in `public`. A missing privilege shows as every vote and every results read answering 502 (the SQL error `42501` in Neon's logs).

**Expiry.** Rate rows carry an expiry and are ignored once it passes. A cleanup deletes up to 200 expired rows at most once per 10 minutes, on a vote request that touches the counters:

```sql
DELETE FROM public.hv_kv WHERE k IN (SELECT k FROM public.hv_kv WHERE exp IS NOT NULL AND exp <= now() ORDER BY exp LIMIT 200 FOR UPDATE SKIP LOCKED);
```

With no votes at all, expired rows can stay in `hv_kv` until the next vote; delete them by hand if that matters.

**Timeouts.** Each Neon call may take up to 3 s (a suspended compute wakes on its first call), the whole request 6 s, the player's attempt 7 s. The first vote after the compute has been idle for more than 5 minutes is the slow one; if it answers 502 (`Couldn't send. Tap Send to try again.`) the resend finds a warm compute.

**Live check after deploy** (the unverified hosted behaviours; run by you or the lead through a Vercel share link, never by an agent holding the connection string). On a preview with no Upstash variables, a fresh `VOTE_SALT` and `VOTE_ALLOW_PREVIEW=1`:

1. Get a share link for the preview and store its protection cookie with `curl -c jar.txt -L "<share url>"`; add `-b jar.txt` to every call below.
2. `curl -sS -b jar.txt "$BASE/api/results"` answers 200 with `"open":true`. This one call proves the endpoint, TLS, the connection string, the role's privileges and the reader. A 502 means: check `SELECT tablename FROM pg_tables WHERE tablename LIKE 'hv_%';` and run the five statements by hand.
3. POST one valid vote (a v3 body with a fresh 32-hex code and an `Origin` header equal to `$BASE`): 200, and again 200. `SELECT count(*) FROM public.hv_hash WHERE k = 'hv:preview:vote:r3:s3';` is 1, `length(value)` is 18, and `SELECT k, v, exp FROM public.hv_kv ORDER BY k;` shows the unit counter at 2 (both requests) and the block, round and `rlg` counters at 1 (a resend of a stored code stops at gate A and spends no other budget), with `exp` about 25 hours ahead (30 days for the round counter and `rlg`).
4. Limits: send 7 more POSTs with distinct codes from your own address: 6 answer 200 and the 7th answers `429 later` with `Retry-After` set to the seconds left until the next UTC midnight; the vote count is 7 and the unit counter reads 9.
5. Kill switch: the `close` statement, a POST answers 503; the `reopen` statement, within 30 s a POST answers 200.
6. **Cold start (the assumption that matters):** leave the deployment idle for more than 5 minutes, then `curl -o /dev/null -w '%{http_code} %{time_total}\n' -b jar.txt -X POST ...` with a fresh code, and again at once. Expect under about 2 s cold and well under 0.5 s warm. A 502 on the first request after idle is the signal to raise the Neon call budget.
7. DDL race: on a fresh deployment, `seq 10 | xargs -P10 -I{} curl -sS -o /dev/null -w '%{http_code}\n' -b jar.txt "$BASE/api/results"` answers 200 ten times.
8. Clean up: `DELETE FROM public.hv_hash WHERE k LIKE 'hv:preview:%'; DELETE FROM public.hv_kv WHERE k LIKE 'hv:preview:%';` and confirm `SELECT count(*) FROM public.hv_hash WHERE k LIKE 'hv:production:%';` is 0.
9. Production: connect the resource to Production, set the production `VOTE_SALT`, redeploy, repeat steps 2, 3 and 5 against the real domain, then reset the poll before sharing the link.

**Honest limits.** Neon's wire format comes from its open-source client and proxy code, not from a promise, so the hosted service could differ (the live check catches it: every reply is checked and a surprise fails closed as a 502). Role privileges, the pooled host's latency, cold-start time, the free plan's storage and compute allowance, deadlock behaviour under the real proxy and how the proxy handles a client that gives up mid-request were not measured. A batch is one transaction, so it commits all or nothing; a vote whose reply is lost is safe to resend (the code is stored once). Postgres does not emulate Redis type errors: one bad command rolls the whole batch back, which no vote command can trigger.
