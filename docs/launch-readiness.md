# Launch readiness: vote validity, analytics, deploy (task `vote-and-deploy`)

## Your part, in short

Read this first. Everything below is reference.

**Before the link goes public you must:**
1. Connect a vote store to Production only, and set `VOTE_SALT` (Vercel, project `halaverga-flight`: Storage, then Environment Variables). Two things.
2. Make the three Firewall rules for `/api/vote` (rules 1, 2 and K1, vote-runbook.md section 6 step 3). If Vercel will not let you rate limit `/api/vote`, do not publish the link.
3. Fly it once on your iPhone, portrait and landscape: the game, one vote, `/results`, `/privacy`. Nothing here has been tried on a phone.
4. Say yes in chat to the production deploy. Afterwards send two real votes and run the one `reset-poll` line (vote-runbook.md section 6 step 6), so the tests do not stay in the tally.

**You should** (quick; the launch works without them, but blind or exposed): enable Web Analytics for the project (1 click, or the funnel counts stay empty); turn on Dependabot alerts, secret scanning and push protection on the GitHub repo (3 toggles); set a Spend Management amount (1 setting).

**Optional:** a throwaway Preview-only store to test votes before production (without it the first real vote happens on production); a look at Deployment Protection (nothing to change if it reads as in the list below).

**Later:** the first audit run, 30 minutes after the deploy (vote-runbook.md section 4).

**Safely waits:** whether the waterfront and the ridge come back (the deploy is correct without them). **Done from here, not by you:** merging the stack, `pnpm verify`, the preview deploy and its curl checks, the rollback readiness check.

From the blind-spot audit (2026-10-02). Garo asked for all of it, done the most logical way.

This task: results that do not over-claim, anonymous funnel counts, and a rehearsed deploy with a written way back.
Decisions and measurements are added here as the work lands.

## V1 Results that do not over-claim (audit findings 4 and 5)

What changed and why (the lead fixed the floor at 300, the rest was chosen here):

- **Ranking floor 300 (was 100).** Five equally liked controls sit about 34 points apart by luck alone at 100 votes and about 20 at 300. It is still the `minv` knob, 10 to 1000. Side effect fixed: the runbook example `minv 200` would now have lowered the floor, so the example is `minv 600` (code, runbook and the Neon parity test agree).
- **Below the floor `/results` already showed only a rounded count** (no table, bar or percent, and the JSON carries null). Kept, now pinned by a test that also feeds it a forged unranked read that still holds numbers.
- **Noise note per ranked family**, computed from that family's own published count: 340 / sqrt(N) points, whole numbers (34, 24, 20, 17, 12, 9 at 100, 200, 300, 400, 800, 1,600). It replaces the footer sentence about gaps under 10 points. Per family, not in the footer, because the two families have different counts. The figure is the touch case (five equal controls). Desktop has eight and three are never suggested; the repair round (V4, below) hides the percent of a control with too few tries and lets the note follow the least-compared row that shows one.
- **One line under the title says what the 20 seconds are**, once. V1 first said "The vote measures the first 20 seconds of flying each way", which is not what the code does (20 seconds is a minimum for each way a vote compares, not a cap); V4 reworded it.
- **Last flown against first flown: on the page, not only in the audit.** It is one line per family and it appears only once the family is ranked and has 200 counted picks that carry an order, so at launch the page stays short. The entry stores the tried controls and `last`, not the order, so "first" is the family's default (the control everyone starts on); only picks of ballots that tried the default and flew another control last are used (no Can't tell, none that end on the default). Weights are the tally's own group caps, n is rounded down to 5, shares are whole percents, and no score reads it. 200 picks because a share is then within about 7 points either way. New JSON field `lastFlown` (null until then). **Its baseline is equal liking, not "order did nothing"** (corrected after an independent check): the line first said "if order did not matter, each would win about X%", which is true only when the starting and the last-flown control are equally liked. A suggested control that is simply better liked leaves the same gap with no order effect, and equal liking plus a real order effect looks identical, so the page now says "If every control tried were liked equally, each would win about X%. Order and liking cannot be told apart here." The same fix is in voting.md item 6, controls-demo.md and the runbook, which now also lists "the suggested controls are simply better liked than the default" among the causes of an audit flag. The only way to separate the two is to change the ballot flow (for example send some visitors to fly the default last), which this task leaves alone.
- **Audit alarm.** The fixed 70% line fired on about one fair 30-pick day in 50 and missed a real skew on three-control ballots. It now compares the last-flown share of picks with the chance the ballots themselves give (a ballot of k tried controls gives 1 in k) and flags a family-day at 30 picks, 3 standard errors and 10 points over. Smaller excesses only show in a per-family summary line. Documented in vote-runbook.md section 4.
- **Docs.** controls-demo.md said 20 a day per block and ranking at 30 votes (code: 60 and 300); it also listed head-to-head wins and losses, which are not published, and lacked the 30-day network limit. voting.md has one new item (How a vote is scored, 6) on order and novelty and on what the vote can and cannot tell, and its old claim that 100 honest ballots leave each desktop control about 26 comparisons is replaced by the audit simulation's figures (default about 93, suggested controls 25 to 30, the three never-suggested desktop controls about 2).

Measured here (emulation, not an iPhone): a local production build against the fake store with 350 touch ballots rendered the table, "about 18 points" for 350 votes and the order check (67% last, 33% first, equal-liking baseline 50%); the desktop block with no votes showed the count-only text. Landing first load 635.6 of 636 KB, unchanged: no client code was touched (the new strings are in the server route only).

Not done on purpose: no forced final fly or any other change to the ballot flow (it adds friction at the step where voters are lost); the in-game card's "Winning head to head so far" top-three line is unchanged: it still names three controls with no noise caveat once a family ranks (now from 300 votes), and changing it means editing the card's lazy chunk and copy.

## V2 Anonymous funnel counts (audit finding 3)

Garo asked for all of it, done the most logical way. The old branch `codex/vercel-analytics` (d9f9cb2: the package plus `<Analytics />` in the layout) is **not brought in**; the same job is done another way, and nothing from it needs merging.

**Why not the package.** The first-load budget has 0.4 KB of room. Measured on 2026-10-02 with the old branch's approach redone here: the landing first load went from 635.6 KB (9 scripts) to **639.3 KB (10 scripts), over the 636 KB budget**, so `check-first-load` fails. The cost is the `Analytics` client component and its Next route glue, 3.7 KB.

**What shipped instead.** A zero-script-file loader plus a tiny wrapper:

- `src/app/AnalyticsBoot.tsx` (on the game page only, Vercel builds only) writes one inline script from `src/lib/trackBoot.ts`: Vercel's documented plain-HTML queue snippet, then `/_vercel/insights/script.js`. Landing first load with it: **635.6 KB, 9 scripts, unchanged** (the page HTML grows about 0.9 KB, which the budget script does not count). No new dependency, so `pnpm install --offline --frozen-lockfile` still works from the unchanged lockfile (checked after the experiment above was reverted).
- `src/lib/track.ts`: five fixed steps (`begin`, `scene_ready`, `second_way_20s`, `vote_card_shown`, `vote_sent`), a bare event named for the step, once per page load, no payload and no identifier, never throws, a no-op on the server, with no vendor queue, or when the browser sends Do Not Track or Global Privacy Control.
- Wired here, in vote-owned files only: `second_way_20s` (the tick that makes a family's second control reach 20 s, `voteTracker.ts`), `vote_card_shown` (the ballot appearing) and `vote_sent` (Send tapped with a pick) in `VoteCard.tsx`.
- **`begin` and `scene_ready` are wired by `src/ui/vote/gameSteps.ts`** (repair round, 2026-10-02): the vote layer, a lazy chunk, listens to the game store for `ready` and `started` and calls `track`, so `Experience` and `Player` are untouched and the landing first load did not move (635.8 KB, 9 scripts, budget 636 KB, measured after the change; a real browser, system Chrome emulation, saw `scene_ready` then `begin` arrive as bare events in `tests/track.spec.ts`). Until then `/privacy` named five steps and only three were sent; `tests/track-steps.test.ts` now fails if a step the text names has no call site.
- Opt-out is ours because Vercel's script has no Do Not Track or Global Privacy Control check (read from its script on 2026-10-02): with either signal the vendor script is never added, so not even a page view goes out.
- Page CSP: it names no `script-src`, `connect-src` or `default-src`, so the same-origin script and beacon pass and **nothing was widened**; the API CSP is unchanged and `/results`, `/privacy` and `/api/*` carry no script. A test pins both.
- Privacy: `PRIVACY_FULL` (so `/privacy`), `docs/voting.md` (lines 3 and 7, the quoted text, a new "Anonymous counts" section) and the README sentence now say what is true: no cookie, a count holds no pick and no code, what Vercel records, a visitor hash discarded after 24 hours, and the opt-out. The ballot's short line is unchanged. `tests/vote-docs.test.ts` pins all of it.

Checked here (desktop emulation, not an iPhone): a production build with `VERCEL=1`, run on port 3560, with the vendor script stubbed. The boot adds the script and both ballot counts arrive as bare events with no hydration error; Do Not Track makes no request and no event; a 404 on the script drops the queue and the vote still sends. The 31 existing vote browser specs pass against that build. Not checked: the real vendor script, because Web Analytics is not enabled for the project.

**Plan and switches only the owner can touch.** I read, I did not change, anything on Vercel.

- **Web Analytics is not enabled** for `halaverga-flight`, or the latest deployment predates enabling it: a read-only GET of `/_vercel/insights/script.js` on the latest deployment (`dpl_GSUBt1vV...`, 2026-10-02) returned the app's own 404. Before the first deploy: Vercel dashboard, project `halaverga-flight`, Analytics, **Enable**, then deploy. Until then the page works and counts nothing.
- **The team's plan is Pro** (V4 read it later the same day with `get_git_deployment_context`; this section first said it could not be read). Vercel's docs (2026-10-02): custom events are Pro and Enterprise only; Hobby gets page views only (50,000 events a month, then collection pauses), so on Hobby the funnel would be page-level only and the wrapper harmless. On Pro the five steps should appear once Web Analytics is enabled, and an event costs $0.03 per 1,000 beyond the monthly credit, about six events per visitor.
- After the first production deploy: open the site once with the network tab open (expect `/_vercel/insights/script.js` 200 and a request to `/_vercel/insights/view`), then look in the dashboard under Analytics for the page view and, on Pro, the Events panel. Your own visits count too; send Do Not Track from your browser to keep them out.

**Reading it.** Page views are people who arrived; `begin` and `scene_ready` show who got into the game and whether the load held them back; `second_way_20s` to `vote_card_shown` to `vote_sent` is the vote funnel; `vote_sent` against the stored votes is only a rough hint at refused and failed sends, not a count of them (visitors with a blocker, Do Not Track or Global Privacy Control are stored but never in `vote_sent`, it is once per page load, and `/results` is rounded down to 5, so the gap can be small or negative; see voting.md, "What the counts cannot tell"). Blockers that drop `/_vercel/insights` and Do Not Track or Global Privacy Control visitors are missing, so every number is a floor. If you decline Web Analytics, treat a low vote count as unreadable, not as a verdict.

Not done on purpose: no `@vercel/analytics` package (budget); no per-control or per-pick event (it would put the vote in a third party's hands); no change to the page CSP; no preview of the real script (it needs the project switch above). When the other branch frees about 8 KB of first load, swapping the boot script for the package's `inject` is a two-file change.


## V3 Deploy readiness and a written way back (audit finding 6)

Garo asked for all of it, done the most logical way. Choices: a deploy doc that records what was actually read and rehearsed ([deploy.md](deploy.md)); the patched Next the registry offers, not the minimum; the dependency audit as its own CI job; and the first deploy described by what visitors would lose, found by diffing the live commit against this branch. Nothing was pushed, deployed, rolled back or changed on Vercel or GitHub.

### What the first deploy replaces

Production runs `261a101` (tip of `codex/world-atmosphere`, 2026-09-22; proven by the stamp `2026-09-22 · 261a101` in the live JavaScript, and by the Vercel deployment created 2026-09-22 20:27 UTC). It is in no branch heading to production, so the first deploy of this one replaces it silently. `git diff 261a101...HEAD` (what this branch added since the common ancestor, merge 7945430) is 536 files, +48,322 / -528; against production itself, `git diff 261a101 HEAD` is 547 files, +48,335 / -889. Almost all of it is new (the blaster and drones, the controls demo and Gesture Lab, the vote, `/results`, `/privacy`, the arm cannon, the new hero), plus the security headers the live site does not send. What matters here is what is **taken away or changed**. Of the 18 files in `261a101`, 11 do not exist on this branch and 7 were rewritten by the sky and water work.

| What visitors had | On this branch | Verdict |
|---|---|---|
| Violet-grey storm ceiling, muted amber sun low in the sky (`#e7ba86`, `[-65,42,-90]`), dark teal floodwater, one palette for fog and light | Clear blue sky with cumulus, a high warm sun (`[-65,100,80]`), one pale haze for sea, city and skyline | **Superseded on purpose.** Garo's note of 2026-10-01 (sky-background.md): "the sky and the background are ruining the demo". Do not bring the storm sky back. |
| Silt ribbons collecting against the retaining walls of the water | Not in the new water shader (it keeps the shimmer and the wake) | Small loss, part of the same superseded look. |
| Floor bands, rooftop ribs and broken setbacks on the 20-box far skyline | Gone: the far skyline is its own three-layer mesh (`Skyline.tsx`, 110 to 330 m out) | Superseded. |
| **The waterfront** (`src/world/waterfrontDetails.ts`): broken curb and expansion joints, leaning street lamps, buckled quay railing, driftwood along the banks, ladders running into the flood, two drowned stair flights, six service cabinets with missing doors, a transit shelter, nine fallen flood barriers | **Nothing equivalent exists.** The quay walls and the road are plain boxes. | **Valuable and missing.** The shelter and cabinets are the only signs of ordinary life in the canal. About 48 box colliders. |
| **A mountain ridge ring and terraced hillside blocks beyond the district** (`src/world/distantTerrain.ts`) | No ridge. The district-edge hills (`k.hill`) and the new far skyline stand against open sea and sky. | **Missing, not obviously wanted.** The sky-background brief replaced the background, but its notes never mention the ridge. Owner's call. It is mesh only, no colliders. |
| Authored route, arrival terrace, roof pad, hero ruins, hills, trees | Unchanged geometry | Kept. |
| Everything else in `261a101` (docs, five capture images, a performance JSON, `scripts/review-world-atmosphere.mjs`) | Not on this branch | History only. They stay readable with `git show 261a101:<path>`. |

**Cherry-pick, not applied.** The whole commit is not the command: a merge simulation (`git merge-tree`, nothing touched) conflicts in 7 files, the exact ones the sky and water work rewrote (`Atmosphere.tsx`, `EnvironmentLight.tsx`, `Scene.tsx`, `atmospherePalette.ts`, `cityData.ts`, `skyShader.ts`, `waterShader.ts`). Only the two new files are wanted. To take the waterfront:

```sh
git restore --source=261a101 -- src/world/waterfrontDetails.ts
# then in src/world/cityData.ts add   import { waterfrontDetails } from './waterfrontDetails';
# and, just before `return k.finish();`,   waterfrontDetails(k);
```

For the ridge and terraces the same with `src/world/distantTerrain.ts` and `distantTerrain(k);` (it uses `colors.edge` and `k.add`, both present). I tried the waterfront on a scratch copy of this branch (not applied here): it typechecks, and **two pinned checks fail, so it is not a free pickup.** `tests/skyline.test.ts` pins 101 colliders and a hash of them (the waterfront makes 149), and its "draws the hills and the terrace parapets in the calm concrete group" check fails with it; `tests/limit-escape.test.ts` ("recorded pins: all 285 stalled states get out") finds 2 stalled states that no longer escape within 3.5 s after contact (pin 245 at `-27,3,-18` and pin 262 at `42,3,-25`, both at 34 m/s; which new box they now run into was not traced). So it needs the pins re-recorded and a flight-safety look at those two states, and the ridge needs a visual check against the new skyline layers. The blaster-era route and drone tests passed with it. None of that is worth doing before the iPhone pass unless Garo wants the waterfront in the launch build; the first deploy is correct without it.

### Next 16.3.8, and the dependency audit in CI

- **Bump: `next` 16.3.5 to 16.3.8** (exact pin kept). `pnpm audit --prod` flagged GHSA-vcvr-r3jv-pc5j (critical, remote code execution in `next/og` `ImageResponse`), vulnerable `>=16.2.0 <16.3.6`, so the patched floor is 16.3.6, as the audit said. The registry's latest is 16.3.8 (16.3.6 on 2026-09-22, 16.3.7 on 2026-09-29, 16.3.8 on 2026-09-30; none deprecated). **I took 16.3.8, not the floor:** its release notes (read on GitHub) list security fixes the floor does not carry, a high server-side request forgery in image optimization and five medium ones (cache poisoning in static and incremental pages among them); 16.3.7 is a bug-fix release. This app has no `ImageResponse`, `next/og` or metadata image route (0 hits in `src`) and serves with `images.unoptimized`, so the critical one was probably unreachable either way; a patched line costs nothing. The lockfile diff touches only `next`, `@next/env` and the eight swc binaries. `pnpm audit --prod` now says "No known vulnerabilities found".
- **Measured on 16.3.8:** typecheck clean, vitest 178 files and 2,253 tests pass, `pnpm build` passes, **landing first load 635.8 KB, 9 scripts (budget 636 KB), up 0.2 KB from 635.6**, `check-vote-build` passes. That leaves **0.2 KB of headroom**: the next first-load addition anywhere will trip the budget. I did not touch the budget.
- **Rehearsed on this build:** the three `vote-live-check` phases against the fake store (functional 18 pass and 2 skipped, unit 19 pass, global 7 pass, 0 fail) and the post-deploy curl list in deploy.md against a local production build (with and without a store). Local, not Vercel.
- **CI: a separate `audit` job** in `verify.yml` runs `pnpm run audit:prod` (`pnpm audit --prod --audit-level=high`, also an npm script now). It is **not** in `pnpm verify`, which stays free of the network after install. Why a job and not a step in `verify`: a new advisory appears with no code change, and it should be its own red check that never hides the verify result; `pnpm audit` reads only `package.json` and the lockfile, so the job needs no install and finishes in seconds. **Non-flaky rule:** a finding at high or critical fails the job. If the audit endpoint cannot be reached, the job prints a GitHub warning and passes, because that says nothing about the code. The two cases are told apart by the text `N vulnerabilities found`, which a real finding always prints and an unreachable endpoint never does (pnpm retries for about 70 s first, so the job has a 10 minute timeout). All three outcomes were run locally on the extracted step: the old lockfile (exit 1, 1 critical), the new one (exit 0), and a registry that refuses connections (warning, exit 0). The workflow itself has not run on GitHub.

### Owner-only clicks (an agent may not do these)

Changing accounts, security features or Vercel and GitHub settings is the owner's. One short list:

1. **GitHub, repository `Vartabg/halaverga`, Settings, Code security:** turn on Dependabot alerts, secret scanning and push protection (free on a public repo; the audit found all three off).
2. **Vercel, project `halaverga-flight`, Storage:** connect the vote store (Upstash or Neon) to **Production only**, then Settings, Environment Variables: `VOTE_SALT` (Production only, sensitive; vote-runbook.md section 6 steps 1 and 2). Optional, for a vote check on a preview: a throwaway store on **Preview only**, a different `VOTE_SALT`, and `VOTE_ALLOW_PREVIEW=1`.
3. **Vercel Firewall:** the rate-limit and kill-switch rules (vote-runbook.md section 6 step 3; rules 1, 2 and K1 are the minimum). Read the plan's limits first; if the plan cannot rate limit `/api/vote`, do not publish the link. **Today no custom firewall configuration exists** (the API answers not found).
4. **Vercel Spend Management** (Settings, Billing): an amount and the pause action, or a note that the plan has none. The team is on Pro (read in V4), which is also what lets an Instant Rollback reach an older deployment by id (deploy.md section 8).
5. **Vercel Web Analytics:** Enable for the project, or the funnel counts nothing (V2 above).
6. **Look at Vercel Deployment Protection.** Observed today: unique deployment and alias URLs answer 302 to Vercel login, and `halaverga-flight.vercel.app` answers 200 to anyone; the setting reads SSO on, `all_except_custom_domains`. That is what the runbook wants (public link open, old and preview URLs closed). Confirm it is still so after any change.
7. **The production deploy itself:** only after Garo says yes in chat.

Decisions for Garo, not clicks: whether the waterfront and the ridge come into the launch build (above), and whether to pin the rollback target's source with a tag (`git tag prod-before-first-deploy 261a101`, pushed by the lead; keep `origin/codex/world-atmosphere` until then).

### Go-live order

0. **Before any merge to `main`: know whether a merge deploys.** Production deploys from `main` only if the project's Git link is live. Read on 2026-10-02 (deploy.md section 6): `halaverga-flight` is not in the team's linked-Git-projects list, and PR #12 (merged to `main` 2026-09-23 19:17 CDT) produced no deployment while the merges of 09-17 to 09-19 each did. So the link is almost certainly off. It was not read as a setting, so do not rely on it for the first merge: look at Project Settings, Git (a look, no change), or merge the stack into an integration branch first and merge to `main` only at step 5. Right after the first merge to `main`, `list_deployments` must show no new deployment with `githubCommitRef: main`; if one appears, it is a production deploy of an untested build with the vote closed (no store yet), and the way back is `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm` (deploy.md section 8).
1. **Integration.** One branch with everything that ships: merge `shooter`, then `screen-cleanup` (push it first: it exists only on one Mac), then `sky-background`, then this task. Run `pnpm verify` and the Mac browser suite once on the merged result. Landing first load must stay at or under 636 KB; do not raise it.
2. **iPhone pass.** Real iPhone Safari, portrait and landscape: the game, one ballot sent, `/results`, `/privacy`. Record it honestly in the device checklist (gesture-lab.md). Emulation is not an iPhone.
3. **Preview and its live check.** Sections 3 and 4 of deploy.md: `scripts/hand-deploy.sh preview` (archive, secrets scan, deploy; it stops on any finding), the curl list, the stamp. The vote path needs the owner's Preview-only store (click 2); without it the preview proves only the closed paths, and the first real vote happens on production, with the poll reset after.
4. **Owner yes.** Before asking, confirm the rollback target `dpl_7sUsqUdXcAmG2S4K7MpnQUCwmstm` is still READY and a candidate (deploy.md section 8) and that clicks 1 to 5 are done or knowingly skipped.
5. **Production deploy.** `scripts/hand-deploy.sh prod` from the SHA that passed steps 1 to 3 (deploy.md section 5); it runs the same secrets gate.
6. **Curl checks on the public domain**, the stamp, the vote check (two real votes, then the `reset-poll` line), the analytics check, then the first audit run at 30 minutes (vote-runbook.md).
7. **Rollback ready.** Confirm the dashboard still offers Instant Rollback for `dpl_7sUsq...` now that it is the previous production deployment, and write down who runs it.

### Not done on purpose (V3)

No deploy, rollback or promote; no push; no change to Vercel, GitHub, the budget or the vote backend; the waterfront and ridge not cherry-picked; no `@vercel/analytics`. `/results` carries the common CSP, not `default-src 'none'`: `tests/vote-headers.test.ts` pins that and I left it. The environment variable names on Vercel were not read, on purpose: values must not be printed. (The plan and the Git link were read afterwards, in V4.)

## V4 Repair round (2026-10-02)

A second reading of V1 to V3 found eleven problems. Garo asked for all of it, done the most logical way. Each was checked first; what was real is fixed here, what cannot be fixed from this machine is said so under "Not fixable here". Nothing was pushed, deployed or changed on Vercel or GitHub.

### Results: desktop rows, the noise note, the 20 seconds

- **A percent from a handful of ballots.** The desktop table printed a head-to-head percent for every control, including the three the card never suggests (Flow, Captured, Mouse + keys), which have about 2 comparison points each at 100 votes. A synthetic read the audit rendered showed `under 5 tried | 80%` and `about 0 of 10 tried | 6%` under a note that said about 19 points. **Fix:** a control with fewer than 30 published tries (`MIN_TRIED_SHOWN`, tries are already rounded down to 5) shows `too few votes to tell` in place of the bar and percent, and its row moves below the rows that show one. A control nobody met still says `none yet`. The public JSON is unchanged: only the page decides what to print.
- **The note was the five-control figure on a desktop family.** It is now the larger of the old 340 / sqrt(votes) and 170 / sqrt(t), where t is the fewest tries among the rows that show a percent. I checked that the second figure is the same number for touch before adopting it: 150 simulated families of equally liked controls, run through the repo's own `aggregate` (a throwaway test, not kept), gave a 95th percentile spread of the rows that show a percent of 22, 15 and 12 points at 300, 600 and 1,000 votes, against notes of 21, 15 and 11, and the same for desktop with 10% self-chosen challengers. So the touch note reads as before (20 at 300 votes) and an uneven desktop family gets a larger number. The old 340 / sqrt(N) alone ran about 1 to 2 points under that 95th percentile at 300 votes.
- **"The vote measures the first 20 seconds of flying each way"** was wrong: 20 seconds is the least a vote needs for each way it compares (`TRIED_S` is a minimum, play time has no ceiling, and the ballot carries no time at all). The line is now `A vote needs at least 20 seconds of flying each way it compares. A vote does not include how long you flew.`
- Tests: `tests/vote-pages.test.ts` pins the cut at exactly 30, the row order, the real-aggregate case, the larger-of-two note and the new line; `tests/vote-docs.test.ts` pins the docs. Copy is in `copy-list.md` for the owner.
- Not changed: the in-game card's "Winning head to head so far" line still names the top three from the ranking order with no noise caveat (its ranking already needs 15 comparison points and 6 groups to lead; the card is a lazy chunk with its own copy).

### The deploy recipe is a gate now

The recipe was a block to paste with the gitleaks line and the deploy on separate lines, and the `--prod` deploy had no scan. It is `scripts/hand-deploy.sh` (deploy.md section 3): history scan, scan of the exact folder that goes up, then one `vercel deploy` call, for preview and prod. `set -euo pipefail`, no skip flag. `tests/hand-deploy.test.ts` runs it with stub tools and pins the stops (finding in either scan, gitleaks missing, link missing, bad mode). I also ran it with the real gitleaks (8.30.1) on a scratch repo with a planted fake token: it stopped before the stubbed `vercel`, and on the clean repo it reached it. Nothing was deployed.

### Two facts that were "not readable" and now are

The plan is **Pro** and the Git link is **not there**, both from `get_git_deployment_context` (read-only; `get_team` and `get_project` show neither). The plan means custom analytics events and Instant Rollback to an older deployment by id are available (Vercel's docs, 2026-10-02); the missing link is step 0 above. Vercel's own project `updatedAt` reads 2026-10-02 21:10 UTC, after the newest deployment; what changed is not readable from here.

### Not fixable here

- **No physical iPhone.** The browser specs (53 at the last full run) run in desktop system Chrome with `/api/vote` and `/api/results` mocked (emulation, not an iPhone). There is no phone on this machine and Playwright's WebKit is not installed (the WebKit specs skip, `docs/verification.md`). This is why "Your part" item 3 is yours. Nothing was changed to pretend otherwise.
- **Only fake stores.** The vote was exercised against `scripts/fake-upstash.mjs` and a real local PostgreSQL for the Neon adapter, never a real Upstash, Neon or Vercel deployment: an agent holds no store credentials and does not load any. The post-deploy list in deploy.md section 4 is therefore the first test of Vercel's edge, and the store-attached lines of it are yours (the console line is in vote-runbook.md section 2).
- **First-load headroom is 0.2 KB** (635.8 of 636 KB, unchanged by this round; the budget is not raised). Measured from this build, by size and a text search of the nine scripts: the two biggest (229 and 178 KB) are React DOM and Next's client runtime, a 113 KB chunk carries no marker I could name, and the app's own code is the rest, about 117 KB. One 34 KB app chunk holds the Field guide copy, the pause card and the audio code, which are what I would look at first for lazy loading. A separate branch is meant to free about 8 KB (I did not read it), so I did not touch them and risk colliding with it. This round added nothing to the first load on purpose: the two game steps went into the lazy vote layer for that reason. Any addition to `Experience`, the store or the audio code will trip `check-first-load` until that branch lands.
