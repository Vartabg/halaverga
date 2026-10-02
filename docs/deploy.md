# Deploy and the way back

The exact hand-deploy that has worked, the checks after it, and how to undo it. Written 2026-10-02 (task `vote-and-deploy`). Nothing here was run against production: no deploy, no rollback, no promote. What was only read, and what was rehearsed locally, is marked each time. The order of the whole launch is in [launch-readiness.md](launch-readiness.md); what the vote stores and refuses is in [voting.md](voting.md) and [vote-runbook.md](vote-runbook.md).

**Who does what.** Anyone may deploy a preview. The production step (`--prod`) is run only after the owner says yes in chat. Nobody changes Vercel or GitHub settings from here; those are owner clicks (listed in launch-readiness.md).

## 1. What production is today (read-only, 2026-10-02)

Read through the Vercel MCP (`get_project`, `list_deployments`, `get_deployment`, `list_deployment_aliases`, `get_firewall_config`) and with plain `curl` on the public domain. Nothing was changed.

| Fact | Value |
|---|---|
| Team, project | `garo-vartabedians-projects` (`team_mmxvo8Upj7qpyLgCOmxS8Rv1`), `halaverga-flight` (`prj_r7ZYcwa74yk8FJ7gpOiQAebRWjS8`), framework Next.js, Node 24.x, region `iad1` |
| **Current production deployment** | `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm`, state READY, target `production`, source `cli` |
| Its URL | `halaverga-flight-7vv2q6zjg-garo-vartabedians-projects.vercel.app` |
| Created | 2026-09-22 20:27:37 UTC (15:27 CDT). The build took about 17 s (`buildingAt` to `ready`). |
| Its commit | `261a101`, tip of `codex/world-atmosphere` ("Complete ruined waterfront and unify storm sky with floodwater", 2026-09-22 15:22 CDT). The deployment carries no git metadata; the commit is proven by the build stamp in the live JavaScript, `2026-09-22 · 261a101` (found with the loop in section 7, today). `origin/codex/world-atmosphere` holds it. |
| Public aliases | `halaverga-flight.vercel.app` (answers 200 to anyone) and `halaverga-flight-garo-vartabedians-projects.vercel.app` (answers 302 to Vercel login). Unique deployment URLs also answer 302 to login. So the public link is the first one. |
| Deployment Protection | SSO on, type `all_except_custom_domains`; no password, no trusted IPs |
| Rollback candidates | `isRollbackCandidate: true` for `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm` (the current one) and `dpl_8vJK99rxnvcjDrPyprwDTZkcu4L9` (production from `main` 7945430, 2026-09-20 01:18 UTC, GitHub metadata). The 12 deployments newer than the current one (of the 15 listed) are previews (target null) and are not candidates. |
| Newest deployment | `dpl_GSUBt1vVahXkWB5KNUuiGzUiYRMJ`, 2026-10-02 08:53 UTC, a preview, not production. |
| Firewall | `get_firewall_config` (version `active`) answers 404 "not found": **no custom firewall configuration exists yet.** The runbook's rules 1, 2 and K1 are not in place. |
| Plan | Not readable from the MCP (`get_team` and `get_project` carry no plan). This decides how far back an Instant Rollback can go (section 8). |
| What the public site lacks today | `/privacy`, `/results`, `/api/results`, `/api/vote`, `/manifest.webmanifest` and `/models/arm-cannon.glb` all answer 404, and the home page has none of the security headers (no `X-Frame-Options`, no CSP). The first deploy adds all of them. |

## 2. Before any deploy

1. The work is committed on its branch and the tree is clean. Write the SHA down: `SHA=$(git rev-parse HEAD)`.
2. `pnpm verify` is green (typecheck, vitest, build, `check-first-load` at or under 636 KB, `check-vote-build`). `pnpm audit:prod` says no known vulnerabilities.
3. The secrets audit is clean (HARD rule): `gitleaks git .` for history and `gitleaks dir` on the scratch copy in step 2 below. Anything found stops the deploy.
4. For a production deploy: the iPhone Safari pass is recorded (emulation is not an iPhone), and the owner has said yes.

## 3. Preview deploy (the recipe that has worked)

A preview is a deployment with no `--prod`. It gets a unique URL behind Vercel login and never serves the public domain.

```sh
cd <the worktree or repo on the branch to ship>
SHA=$(git rev-parse HEAD)
D=$(mktemp -d "${TMPDIR:-/tmp}/halaverga-deploy.XXXXXX")     # a scratch folder, not the repo
git archive "$SHA" | tar -x -C "$D"                          # exactly the committed files, no .git, no node_modules, no .env
mkdir -p "$D/.vercel"
cp ~/code/halaverga/.vercel/project.json "$D/.vercel/project.json"   # the link to halaverga-flight (gitignored, so not in the archive)
gitleaks dir "$D" --no-banner --redact                       # must print "no leaks found"; stop on anything else
cd "$D" && vercel deploy --yes --build-env VERCEL_GIT_COMMIT_SHA="$SHA"
```

Why each piece:

- **`git archive`** puts only committed files in the scratch folder, so uncommitted edits and ignored files (`.env*`, `.next`, `node_modules`) cannot ride along. `.vercelignore` then keeps `docs/`, `tests/`, `scripts/`, `art/` and `.env*` out of the upload.
- **`.vercel/project.json`** links the folder to the project. `~/code/halaverga/.vercel/project.json` holds `projectId`, `orgId` and `projectName`; checked 2026-10-02 that its ids match the project and team above. It exists only in that primary tree.
- **`--build-env VERCEL_GIT_COMMIT_SHA=$SHA`**: `next.config.ts` stamps every build with `date · short sha`. The archive has no `.git`, so without this the stamp falls back to `uncommitted`. The stamp is how you tell which deployment is which (Field guide footer, and the live-JavaScript check in section 7).
- **`--yes`** skips the prompts. The command prints the preview URL when the build is done; keep it. The `--logs` flag prints the build log.
- Environment variables come from Vercel, not from the folder. The vote store and `VOTE_SALT` are meant to be Production only, so a preview answers 503 `closed` on the vote routes unless the owner has connected a Preview-only throwaway store and set `VOTE_ALLOW_PREVIEW=1` (vote-runbook.md, "Optional extras"). That is what keeps a preview from touching the real poll.

Reaching a preview from a terminal: it answers 302 to login, so use `vercel curl <path> --deployment <preview url>` (the CLI adds the bypass for the logged-in user; `vercel curl --help` read, not run), or a Vercel share link and `curl -c jar.txt -L "<share url>"`, then `-b jar.txt` on each call.

## 4. Checks after any deploy (preview or production)

Set `BASE` to the preview (through `vercel curl` or the cookie jar) or to `https://halaverga-flight.vercel.app`. These exact requests were rehearsed on 2026-10-02 against a local production build of this branch (Next 16.3.8): once with no store (the state of the first deploy), once with the fake store attached. **That proves the code and the commands, not Vercel's edge.** The Vercel-specific behaviours (headers added by the platform, forwarded-address handling, the CDN copy of `/results`) are unproven until these run on a real deployment.

```sh
BASE=https://halaverga-flight.vercel.app
curl -sI  $BASE/             # 200; X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Cross-Origin-Opener-Policy,
                             #   Permissions-Policy, CSP "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"; no Set-Cookie
curl -sI  $BASE/privacy      # 200, same headers, no Set-Cookie
curl -sI  $BASE/results      # 503 (no store yet) or 200 (store); X-Robots-Tag noindex; 503 is cache-control no-store, 200 is "public, max-age=0, s-maxage=120"
curl -si  $BASE/api/results  # 503 {"ok":false,"error":"closed"} (no store) or 200 {"v":3,"round":"r3",...,"open":true,...}
curl -si  $BASE/api/vote                                              # 405 {"ok":false,"error":"method"}, Allow: POST
curl -si -X POST $BASE/api/vote                                       # no store: 503 closed, Retry-After 60.  store: 415 {"ok":false,"error":"json-only"}
curl -si -X POST -H 'Content-Type: application/json' $BASE/api/vote   # no store: 503 closed.  store: 400 {"ok":false,"error":"bad-vote"}
curl -si -X POST -H 'Content-Type: application/json' -H 'Origin: https://example.invalid' -d '{}' $BASE/api/vote
                                                                      # store: 403 {"ok":false,"error":"cross-site"}
```

What each should show, so a surprise is easy to spot:

- Every `/api/*` answer carries `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `X-Robots-Tag: noindex`, and a refusal carries `cache-control: no-store`. A good `/api/results` reads `public, max-age=0, s-maxage=120`.
- `/results` carries the common CSP (the one above, not `default-src 'none'`: `tests/vote-headers.test.ts` pins that) plus `X-Robots-Tag: noindex`; `/privacy` and `/` carry the common group only.
- **No request in the list stores anything.** A body-less POST is refused before any store call. With a store attached, `HLEN hv:production:vote:r3:s3` is unchanged after the list (the console line is in vote-runbook.md section 2; run it yourself, an agent holds no store credentials).
- No `Set-Cookie` on any answer of the page, `/results`, `/privacy` or `/api/*`. (A protected preview's own login redirect sets Vercel's `_vercel_sso_nonce` cookie; that one is Vercel's, not ours.)
- Anonymous counts (the game page only, Vercel builds only): `curl -s $BASE/ | grep -c '_vercel/insights'` is 1 or more, and the same on `/privacy` and `/results` is 0. `$BASE/_vercel/insights/script.js` answers 200 only after the owner enables Web Analytics (until then the app's own 404; see launch-readiness.md). Your own visits count; send Do Not Track to keep them out.
- The stamp: the deployed build must read `<today> · <short sha>` of the SHA you deployed (section 7).

### The vote live check

`scripts/vote-live-check.mjs` is **not** a check you can aim at a Vercel preview. It is a development tool that drives a local production build over real HTTP against `scripts/fake-upstash.mjs`, a fake store that also reports its command counts, and asserts status codes, headers and the exact number of store commands per request. It needs the fake store's `/stats` and the right to send raw commands, so it cannot read a real Upstash or Neon store. Run it before every deploy as the gate on the vote code:

```sh
node scripts/fake-upstash.mjs --port 3561 &                       # note the PID, kill it by PID afterwards
for phase in functional unit global; do                           # a FRESH app process for each phase
  KV_REST_API_URL=http://127.0.0.1:3561 KV_REST_API_TOKEN=dev-token \
  VOTE_SALT=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") \
    pnpm exec next start --hostname 127.0.0.1 --port 3562 &       # from a production build; kill it by PID after the phase
  node scripts/vote-live-check.mjs --app http://127.0.0.1:3562 --store http://127.0.0.1:3561 --phase $phase --fast
done
```

Rehearsed 2026-10-02 on this branch with Next 16.3.8: functional 18 pass and 2 skipped (the waits `--fast` skips), unit 19 pass, global 7 pass, 0 failures. The ports are the ones in the recipe at the top of the script; use your own free ones.

**What does run against a preview** is the hosted check, by hand. It needs a throwaway store connected to **Preview only**, a `VOTE_SALT` for Preview that differs from Production's, and `VOTE_ALLOW_PREVIEW=1` (owner clicks, vote-runbook.md "Optional extras"; the code reads `VERCEL_ENV` and the flag in `src/server/vote/config.ts`, and a preview then stores under `hv:preview:*`). Then, on that preview: `curl` the section 4 list; send one valid v3 ballot and the same again (both 200, one stored); read `/api/results`; close the vote and send (503), reopen, send (200); clean up with `DEL hv:preview:vote:r3:s3`. The Neon version of these steps is in vote-runbook.md ("Live check after deploy"). **Without a Preview store the preview can only prove the 503 `closed` paths**; the first real vote then happens on production, with the poll reset afterwards (vote-runbook.md section 6 step 6).

## 5. Production deploy (owner approves first)

Same recipe, one flag more. Run it only after the owner says yes in chat, and only from the SHA that passed section 2 and the preview checks.

```sh
cd "$D" && vercel deploy --prod --yes --build-env VERCEL_GIT_COMMIT_SHA="$SHA"
```

`--prod` builds with the Production environment variables and moves `halaverga-flight.vercel.app` to the new deployment when it is ready. The instant the alias moves, visitors get the new build; the old production deployment stays as the rollback target (section 8).

A staged variant (from Vercel's CLI docs, read here and **not run**): add `--skip-domain`. That creates a production deployment with the Production variables and the vote store attached, but does **not** move the public domain. Test it at its own URL (`vercel curl ... --deployment <url>`: the whole section 4 list and the vote check, with the poll reset afterwards), then `vercel promote <url>` moves the domain, and `vercel promote status` shows it. This gives a full production-grade check before any visitor sees the build. It is a choice for the owner; the plain `--prod` above is the path that has worked.

Right after: section 4 on `https://halaverga-flight.vercel.app`, then confirm the rollback is available (section 8, "Confirm it is armed").

## 6. Things to know

- Only the 2026-09-20 `main` deployment carries GitHub metadata; every deployment since is a hand deploy (`source: cli`). Whether Vercel's Git integration is still connected was not readable (`get_project` has no link field). Check the project's Git settings before the first push: if it is connected, a push of a branch makes a preview deployment (never production unless the production branch is pushed).
- vote-runbook.md section 3 says that after a vote-rule change you should "delete old production deployments". **Never delete `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm`**: it is the rollback target. It has no vote code (no `/api/vote`), so it cannot write a vote and the reason for deleting old deployments does not apply to it.
- A rollback does not touch the store. Stored votes, the controls (`ctl` row) and the audit stay as they are. The vote is simply unreachable on the old build, and visitors see the 404 pages listed in section 1.
- The Production-only store variables and `VOTE_SALT` belong to the project, not to a deployment; the old deployment never read them.

## 7. Which build is live

The stamp is baked into one script chunk. This finds it on any deployment you can reach (use `vercel curl` for protected URLs):

```sh
BASE=https://halaverga-flight.vercel.app
for c in $(curl -s $BASE/ | grep -o '/_next/static/[^"]*\.js' | sort -u); do
  curl -s "$BASE$c" | grep -o '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [^"]\{0,6\}[0-9a-f]\{7\}' | head -1
done        # prints e.g. 2026-09-22 · 261a101
```

Run on 2026-10-02 it printed `2026-09-22 · 261a101` for production. The Field guide footer shows the same stamp.

## 8. ROLLBACK

**Target: `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm`**, `halaverga-flight-7vv2q6zjg-garo-vartabedians-projects.vercel.app`, commit `261a101`, the production deployment visitors have today. What you get back is the game as it is live now: no vote, no results, no privacy page, no security-header set, and the storm sky and waterfront from `261a101`. That is the point: it is the last build known to be fine in front of strangers. A second, older target is `dpl_8vJK99rxnvcjDrPyprwDTZkcu4L9` (the `main` build of 2026-09-20, commit `7945430`), also marked a rollback candidate.

**Trigger it when** the live site is broken for visitors, the vote misbehaves in a way the kill switch cannot fix (a kill switch is faster for the vote alone: vote-runbook.md, `mode closed`), or a deploy leaks something. For a vote problem alone, close the vote first; a rollback also removes `/results` and `/privacy`.

**Dashboard path** (verified that the deployment exists, is READY, target production, and is flagged a rollback candidate; the clicks themselves were not tried): vercel.com, team `garo-vartabedians-projects`, project `halaverga-flight`, Deployments. Filter to Production, open the row for `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm` (created 2026-09-22), the three-dot menu, **Instant Rollback** (or the Promote option if Instant Rollback is not offered), confirm. The inspector link is `https://vercel.com/garo-vartabedians-projects/halaverga-flight/7sUsqUdXcAmG2S4K7MpnQUCwmstm`.

**CLI** (the commands and flags were read from `vercel rollback --help`, `vercel promote --help` and Vercel's docs; **not run**):

```sh
vercel rollback dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm        # Instant Rollback to that deployment
vercel rollback status                                  # shows a pending rollback
# if Instant Rollback refuses (see the plan note), promote the same deployment instead:
vercel promote dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm
vercel promote status
```

The REST equivalents are `POST /v1/projects/{projectId}/rollback/{deploymentId}` and `POST /v10/projects/{projectId}/promote/{deploymentId}` (Vercel docs); promote re-points production without rebuilding.

**Plan note (not verifiable here).** Vercel's docs say rolling back to a specific older deployment is a Pro or Enterprise feature; I could not read the team's plan. On a plan without it, an Instant Rollback may only offer the immediately previous production deployment. After the first deploy that is exactly `dpl_7sUsq...`, so the rollback works as written. After a second production deploy it may not, and `promote` is the way to reach `dpl_7sUsq...`. If neither works, the last resort is to redeploy the old commit: `git archive 261a101`, then section 3 with `--prod` and `SHA=261a101...` (full SHA via `git rev-parse 261a101`). That takes about the 17 s the original build took, and needs `origin/codex/world-atmosphere` kept (do not delete that branch; a tag, `git tag prod-before-first-deploy 261a101`, is a safer pin and is the lead's to push).

**Confirm it is armed, right after a production deploy.** In the dashboard, the row for `dpl_7sUsq...` should still show as a previous production deployment with Instant Rollback offered. Or list candidates with the MCP `list_deployments` (`rollbackCandidate: true`) and look for the id above. Do this before telling anyone the launch is live.

**After a rollback.** Run section 4 against the public domain; section 7 should print `2026-09-22 · 261a101`; `/api/vote` and `/results` should answer 404. Vercel may stop assigning the production domain to later production deployments after a rollback until one is promoted explicitly (from memory of Vercel's behaviour, not confirmed in this session): after fixing forward, deploy with section 5 and check section 7 shows the new stamp, and if it does not, `vercel promote` the new deployment. Votes already stored stay in the store.
