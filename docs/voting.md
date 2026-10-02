# In-game vote

One question: **"Which way of flying felt best?"** The player taps **Vote**, taps the one that felt best (or **Can't tell**), and taps **Send vote**. Three taps. Halaverga has ten ways to fly (see [controls-demo.md](controls-demo.md)), and touch screens and desktops vote separately: a touch player chooses among One finger, Twin stick, Draw, Conduct and Brush, a desktop player among Cursor, One finger + keys, Flow, Captured, Mouse + keys, Draw, Conduct and Brush. The vote is anonymous: no sign-in, no cookies, no text box. It is the only place the public sends us data, so it is built to be refused, capped and undone rather than trusted.

**Votes, not people.** Nothing proves that a vote came from someone who really played, and a script can vote. The design stops one address, one tunnel, one lying `tried` list and one loud hour from steering the result. It does not stop someone who spends many fresh network blocks (see "What this cannot do"). Treat the tally as a guide, not a ballot.

The vote card is the one thing in the game that leaves the device, and only when the player presses **Send vote**. The Gesture Lab measurements stay on the device.

Owner tools (kill switch, voids, audit, launch steps): [vote-runbook.md](vote-runbook.md).

## What the player sees

**What "tried" means.** A control counts as tried after 20 seconds of actual play on it (`TRIED_S`): a key or pointer held down, or input within the last 2 seconds. Opening the Controls sheet, tabbing through it or idling adds nothing. Seconds are kept per device family and control in `localStorage` (`halaverga.vote.play.v2`, checked against the round). **A vote needs at least 2 tried controls of the player's family** (`VOTE_MIN_TRIED`, one constant used by the card and the server). Two tried controls is at least 40 seconds of input, so there is no separate play-time rule.

**Five doors, one card.**

| Door | What it does |
|---|---|
| Header **Vote** button (after Begin) | Below 2 tried it reads `Vote 0/2` or `Vote 1/2` with the seconds still needed to count the control being flown (`· 14 s`); tapping it opens the card in the need-more state. From 2 tried it turns lime: `Vote: which felt best?` (`Vote` on a narrow screen). It disappears once this family has voted, and steps aside while the pause card shows (the pause card has its own vote door, and on a wide screen it covers half the chip). Its accessible name contains its visible text, the seconds included (`Vote 0/2 · 14 s`, then a spoken tail saying how many ways to fly for 20 seconds first; WCAG 2.5.3). |
| Controls sheet | **Vote: which felt best?** is the lime primary button, **Done** is the outline one. The foot line reads `Tried n of 2 needed to vote` until 2, then `Tried n of N`. Once this family's vote is sent (V7) the button is no longer lime and reads `Vote sent: see results` (it still opens the card with the thanks and the results link), and the line reads `Tried n of N`. The Field guide and Flight settings copies of the list have no vote button and always read `Tried n of N`; the pause card's copy has a door and reads like the sheet. |
| Pause card | The line `Which way of flying felt best?` sits above the button `Vote: which felt best?` once the player is eligible (2 tried, not voted, not in a Skip quiet period), and both come right under **Resume flight**, above the Controls list, so they are on screen on a phone and on a 900 px desktop (V4: below the list they sat at y 1310). Otherwise only the button shows, after the list. Both live in the Controls chunk (`ControlsSection`, `control-pause`), not in the landing page's pause card. |
| After a landing | The card opens by itself once per page load, only when the player is eligible and lands after flying. The game pauses first and the card ignores taps for 400 ms and until every finger has lifted. It never opens on a pause the player opened. |
| `/results` | Links to the game only. The game never links to `/results` before a vote. The card's own link `How your vote is counted` opens the static `/privacy` page (no tally) in a new tab. |

**The ballot.** Heading, a label saying `Touch controls` or `Desktop controls`, the sub line `Pick the one that felt best. Only the ways you have flown are listed.`, then one radio row per way the player has flown (glyph, name, one-line description; no setup hints, so no row is primed with a penalty). The rows are in a per-visitor shuffled order (seed in `halaverga.vote.seed`), the control being flown is never first, **nothing is pre-selected**, and **Can't tell** is always the last row. Under the list sits the privacy line and its link, then the status region, then **Send vote** and **Not yet**. Send is `aria-disabled` (never `disabled`, so focus never drops) until a pick exists; pressing it with no pick says `Pick one way first.` and moves focus to the first radio. Arrow keys move and select the radios, Send is a separate button, so a key can never send by itself. Escape closes as Not yet. **When the card closes, focus goes back** (V5, WCAG 2.4.3): to the flight surface when a keyboard game runs again, otherwise to the element that had focus when the card opened, and if that is gone to the pause card's vote door, then the header chip, then the Controls button (`src/ui/vote/restoreFocus.ts`); never left on the page body. The flight surface is `<main id="expedition">`, the game's own keyboard target: a running keyboard game gets it, not the chip, because Space (fly) would otherwise press the chip.

**A player who has flown fewer than two ways** sees `Fly two ways for 20 seconds each, then vote. You have flown 0 of 2 so far.` (nothing flown yet) or `Fly one more way for 20 seconds, then vote. You have flown 1 of 2 so far.`, with a one-tap **Try {Control} for 20 seconds** button (it never suggests Flow, Captured or Mouse + keys, which need a trackpad or capture the pointer) and **Keep playing**. Never a dead end.

**After Send** the card shows the family's tally line from the cached results (never before Send): the top three when ranked (`Winning head to head so far on desktop: ...`), `About n votes so far on ...` from 5 votes, or `Only a few votes so far on ...`. The line can lag by about 4 minutes and may not include the player's own vote.

**Outcome copy** (`STATUS_TEXT` in `src/ui/vote/voteClient.ts`):

| Outcome | HTTP | Text | Then |
|---|---|---|---|
| ok | 200 | `Thanks. Your vote is in.` | marks the device voted, clears the saved vote |
| later | 429 | `Voting is busy right now. Try again later.` | no mark, no automatic retry; the ballot stays open with the pick still chosen (and, when the device allows storage, the pick is saved for a resend) |
| closed | 503 | `Voting isn't open right now.` | the ballot is replaced by a Closed state |
| cross | 403 | `Open the game at its own web address, then vote.` | no mark |
| invalid | 400, 413, 415 | `This page can't send that vote. Reload the page and try again.` | saved vote cleared |
| network | 408, timeout, offline | `Couldn't send. Tap Send to try again.` | one automatic retry after 1 s, same code, then this text |
| error | 502 and other 5xx | `Couldn't send. Tap Send to try again.` | no automatic retry (the server holds 502 for 5 s) |

A 429 or 503 never marks the device as voted and never claims the vote counted. The card says the vote is in only after a 200, or when the device already voted. If the open-time check of `/api/results` says voting is closed or fails, a soft line `Voting may be paused. You can still try to send.` appears and Send still works.

**One send code per Send.** The first press mints a 32-hex code and saves the pick with it in `halaverga.vote.pending` before the first request. A retry, a reopened card or a reload reuses the same code and offers the saved pick (`Your last vote didn't send. Tap Send to try again.`) until a 200 or a 400/413/415 clears it, or 24 hours pass. The server stores a code once, so a lost reply can never count twice. **The first counted pick stands on a resend:** changing the pick after a saved one mints no new code.

After a sent vote the device does not ask again for 7 days or until the next round (`halaverga.vote.v1`, separately for touch and desktop, so a touch laptop that voted as touch is still asked as desktop). A manual Not yet or Escape records nothing. Only **Skip on an automatic open** starts a 24-hour quiet. **Clearing site data and changing network allows another vote.**

## What is sent

`POST /api/vote`, `Content-Type: application/json`, at most **512 bytes**, six fields and no free text:

```json
{"v":3,"device":"desktop","favorite":"flow","tried":["cursor","flow","brush"],"last":"brush","nonce":"3f9a0c1e5b7d42a88c6e1f0d9b3a7c25"}
```

- `v` is 3, `device` is `touch` or `desktop`, `favorite` is one of the tried ids or `tie` (Can't tell), `tried` is 2 to N unique ids of that family (N is 5 or 8), `last` is one of `tried`, `nonce` is 32 lowercase hex characters.
- Exactly those six keys. Any other key (`note`, `ratings`, `build`, `__proto__`, ...), any wrong type, a BOM, invalid UTF-8 or a nested value is 400 `bad-vote`. Over 512 bytes is 413. The ids come from `controlsFor(device)` in `src/game/controlTypes.ts`, the same registry the game reads; there is no second list.
- Every string a visitor can send is a registry id, the literal `tie` or a 32-hex code, so nothing free-form can reach a key, a value, a log or the owner's tools.
- `tried` and `last` are declared by the client and cannot be verified. Nothing trusts their size (see "How a vote is scored"), and `last` never affects the ranking: it feeds only the order check (item 6 of "How a vote is scored").

Every response is JSON with `Cache-Control: no-store`, no `Set-Cookie` and no `Access-Control-*`. Nothing echoes input.

| Status | `error` | When | Extra header |
|---|---|---|---|
| 200 | none | counted, or the same code already stored (the two look the same) | |
| 400 | `bad-vote` | any shape failure | |
| 403 | `cross-site` | `Sec-Fetch-Site` present and not `same-origin`, or an `Origin` whose host is not this request's | |
| 405 | `method` | any method but POST (`OPTIONS` answers 204 with `Allow: POST, OPTIONS`, `no-store` and no CORS headers: it lists only what is served, not every method the route file exports) | `Allow: POST` |
| 408 | `slow` | body not complete within 2 s | |
| 413 | `too-large` | over 512 bytes, declared or streamed | |
| 415 | `json-only` | not `application/json` | |
| 429 | `later` | a limit is reached (one code for all; it does not say which) | `Retry-After` = the seconds left to the next UTC midnight for the address, block and day limits (they reset then); none for the round limit and the ceiling, which do not lift by themselves |
| 502 | `store-failed` | store error or timeout, malformed store reply | `Retry-After: 5` |
| 503 | `closed` | not set up, or the kill switch is on (one code for both) | `Retry-After: 60` |

**A request with no Origin and no Sec-Fetch-Site header (curl, not a browser) passes the same-origin check.** That check stops other websites from voting through a visitor's browser. It is not an anti-bot control.

## Limits

All windows are **UTC calendar days**, never "24 hours from the first request". A vote is either counted or refused with 429 `later`; a refused vote is never stored, and the visitor is never told a vote is in when it is not.

| Limit | Default | Runtime knob (`ctl` field, allowed range) | Over it |
|---|---|---|---|
| Per network address (IPv4 /32, IPv6 /64) | **8 a day** | `unit`, 1 to 200 | 429 from the 9th attempt |
| Per network block (IPv4 /24, IPv6 /48) | **60 a day**, counting only ballots that got past the address limit | `block`, 1 to 2000 | 429 from the 61st such ballot |
| Per network over the round (IPv4 /32, IPv6 /64) | **10** counted votes per 30 days | `round`, 1 to 1000 | 429 from the 11th, no reset by day |
| Whole site | **1,200 counted votes a day** | `global`, 1 to 20000 | 429 from the 1,201st |
| Ceiling on stored votes | **6,000** | `max`, 100 to 20000 | 429 until `max` is raised |
| Network group cap | **5** counted votes per group, family and day, of which at most **2** (two fifths of `cap`, at least 1) may name the same favorite | `cap`, 2 to 100 | scaled down when the tally is read, never refused |
| Ranking floor | **300** counted votes and **12** distinct group-days (a network group code changes every UTC day, so one network on 12 days is 12; see "What this cannot do" 7) | `minv`, 10 to 1000 (the 12 is a code constant) | the family shows no ranking |
| Body | 512 bytes, 2 s | fixed | 413 / 408 |
| Handler total | 6 s, each store call gets `min(call budget, time left)` | fixed | 502 |
| Store call budget | 2 s for Upstash, 3 s for Neon (a cold Neon compute wakes on its first call) | fixed | 502 |
| Player's browser | 7 s per attempt, one retry after 1 s only on a timeout, offline or 408, same code | fixed | |

A knob that is missing, not an integer or outside its range is ignored and the default applies. An unknown `mode` value means closed. **Only `cap`, `minv` and the void set change what the reader shows.** `unit`, `block`, `global`, `round` and `max` decide only whether a new vote is stored, so turning them never changes a published number (a test asserts it).

**Instance guards, 0 store commands.** An instance counts attempts per address and per block key for the UTC day in memory, and once a key is over twice its limit (17th attempt from one address, 121st from one block; the block key counts only requests that got past the address key, so one address cannot fill its neighbours' block) it answers 429 without calling the store. The memo cannot tell a resend of a stored code from a new ballot, so the 17th attempt of a day from one address is refused even if it is a resend; an honest retry never comes near 16. The instance also latches: closed for 30 s (503), the day's global limit reached for 60 s or until UTC midnight, whichever is first, since the counters start over then (429), the ceiling reached for 60 s (429), a store error for 5 s (502). **At the end of a latch exactly one request goes to the store as a probe; every other request keeps the latched answer until the probe's whole decision is made (for a new ballot that is both gates, so a day's-limit latch is set again before anyone else may probe; half open), so a burst at the expiry costs one probe, not one round trip per request in flight.** A cold instance has no latch to answer from: the requests in flight during its first store round trip all reach the store, once each (accepted; the Firewall rules bound the flood). A refusal for one address or block does not latch the instance, so a voter is never refused by someone else's flood. After a raised limit, a key the instance already refuses stays refused on that instance until the next UTC day; the 60 s latches clear by themselves.

**Which address.** On Vercel only `x-vercel-forwarded-for` (last entry) is read; `x-forwarded-for`, `forwarded` and `x-real-ip` never are (`x-real-ip` is a plain request header anywhere that is not Vercel, so reading it would let a caller pick its own key). A request without the platform header shares the one `none` key. Off Vercel (dev, `next start`, any other host) every caller is the one address `local`, so spoofing gains nothing and a self-hosted copy stops at 8 votes a day in total. Addresses are parsed strictly: nine spellings of one address are one key, and anything unparseable goes to one shared `bad` key.

**How the counters move** (a new counter never moves for a request an earlier check already refused). Gate A (5 commands) reads the knobs, the stored-vote count and whether this code is already stored, and bumps the **address** counter. A code already stored answers 200 there, takes the address counter's increment back with one `DECR` (a second round trip, 6 commands in all) and goes no further, whether or not the round is full. Only a new ballot that passed the address limit reaches gate B (6 commands), which bumps the **block** counter (per day), the **round** counter (per network, 30 days, a bare number keyed by a hash, no vote and no address in it) and the day's global counter, and the ballot is written only if all three are within their limits. Consequences, each pinned by a test: one address can spend at most 8 of its block's 60 slots a day (it cannot lock its neighbours out with a flood); a resend or a replay never spends the address, block, round or day budget; and a host cannot wait for midnight to vote again, because the round counter keeps its count for 30 days. A ballot refused at gate B for the block or the round still bumped the counters it reached, which is bounded by the address limit.

**Store cost of one request.**

| Request | Round trips | Commands |
|---|---|---|
| Counted vote | 3 | **12** |
| A resend of the same code (answers 200, spends no budget: gate A, then one `DECR` of the address counter) | 2 | **6** |
| Refused for the address or by the ceiling (gate A) | 1 | **5** |
| Refused for the block, the round or the day's global limit (gate B) | 2 | **11** |
| Refused from an instance's memory or latch | 0 | **0** |
| Closed (first request per instance, then one probe per 30 s) | 1 | 5, then 0 for 30 s |
| Malformed, wrong type, cross-site, oversize, slow, no store, no salt | 0 | **0** |
| Results refresh, at most once per 120 s per instance | 1 | **3** |

Because the ceiling is the only storage bound, everything the poll can ever store costs at most 6,000 x 12 = 72,000 write commands, however fast it arrives.

**A shared address (CGNAT, campus, venue Wi-Fi, iCloud Private Relay) is limited together, counts for a few votes a day, and beyond its limit gets 429 until the next UTC day.** A class of 30 on one address: 8 counted, 22 refused. **On a busy day your vote may be refused; your pick is kept on the device** and Send offers it again. Why refuse and not accept silently: answering 200 for a vote that is not counted tells the visitor their vote is in when it is not, and a holding area for the owner to release by hand is a chore nobody will do, so it would fill and the votes would be lost silently anyway.

## How a vote is scored

The tally is computed each time results are read. Nothing is deleted, so the owner can void an hour or a network group, or change `cap` and `minv`.

1. **A vote is one stored entry** of 18 characters: the UTC hour, touch or desktop, the favorite (or a tie), a bitmask of the tried controls, the control flown last, and a 3-hex-character network group code. The registry order is frozen per round (a test fails if it changes without a round bump).
2. **Network groups cap.** Entries are grouped by (UTC day, network group, family). A group of `n` entries counts with scale `min(1, cap / n)`, so a group over the cap keeps its composition but counts for `cap` votes. **Favorite cap (R1):** the ballots of one group that name the same favorite weigh at most two fifths of `cap` between them (2 at the default, at least 1): a block whose ballots all name one control is the shape of stuffing and counts for 2 votes for it, not 5, while a block of mixed favorites counts in full. A Can't-tell ballot names no favorite and is only under the group cap.
3. **Every ballot weighs the same.** A pick beats every other control that ballot tried; a ballot hands out exactly 1 win-point and 1 loss-point in total, whatever `tried` claims. Example: A picked over A, B, C gives A 1 win and B and C 0.5 loss each. The same ballot claiming all 8 desktop controls gives A 1 win and seven rivals 1/7 loss each. Can't tell splits the points over every pair of tried controls (three tried: each control ends with 1/3 win and 1/3 loss).
4. **Order.** Controls are ordered by a shrunk rate, `(wins + 12) / (wins + losses + 24)`, then by comparison points, then registry order. **A control can lead only with at least 15 comparison points from at least 6 distinct group-days that gave it a win-point, and from at least a tenth of all the groups of its family**; the others follow, by the same rate. A perfect short record (5 wins, 0 losses) scores 0.59, not 1, and a handful of networks that all name one control cannot take first place. A control nobody met is last. **Exposure bias (R4):** at equal true preference the control every visitor flies (the default, tried in every ballot) has the most comparison points, so it can rank above an equally liked control that fewer visitors tried. The shrunk rate keeps the order by rate for large records, and the lead rule stops a short record from leading, but neither removes the bias. Read a small gap between the most flown control and the rest as a tie. Nothing new is published to show it: `tried` stays a rounded total.
5. **Ranked** only when the family has at least `minv` counted votes (300) and at least 12 distinct group-days (a group is one network group code on one UTC day and one family; the code changes every day by design, so the floor cannot tell one network on 12 days from 12 networks: the round limit of 10 counted ballots per network per 30 days is what bounds that). A group counts at most `cap` votes, and at most 2 for one favorite, so 300 votes need 60 groups if every group is mixed and 150 if every group is unanimous (a few more in practice, since two blocks can share one group code). The default was 100 until 2026-10-02: at 100 votes five equally liked controls sit about 34 points apart by luck alone, at 300 about 20, so a table at 100 looked surer than it was. Below the floor, `GET /api/results` carries `controls`, `order`, `tie` and `lastFlown` as `null`: no per-control number leaves the server, and `/results` shows the count and nothing else.

6. **Order and novelty: what the vote can and cannot tell.** Most ballots have one shape: the visitor starts on the default control (One finger on touch, Cursor on desktop), the card suggests one other control, and that one is flown last. A win for the control flown last may be novelty and a win for the default may be practice, and the vote cannot separate either from a real preference; nobody knows which way it leans (practice favours the default, novelty favours the challenger, so a challenger that beats a practiced default is the informative result). The suggestion is random per device, so no one control is always the challenger, but the default is always first. The stored entry keeps the tried controls and the one flown last, not the order, so the order check (`lastFlown` in `GET /api/results`, one line per ranked family on `/results`) reads the default as "flown first": among the picks of ballots that tried the default and flew another control last (Can't tell and a ballot that ends on the default carry no order and are left out) it shows the percent that went to the control flown last, the percent that went to the default, and what each would get if order did not matter (each tried control has a 1 in k chance on a ballot of k). It is published only for a ranked family with at least **200** such counted picks (`LAST_FLOWN_MIN`, where a share is within about 7 points either way), counted with the tally's own group caps, rounded down to 5 and to whole percents; no score reads it, so it is a check beside the ranking, not a correction. `scripts/vote-audit.mjs` prints the same check per family and flags a day whose last-flown share is far above the chance its own ballots give (see vote-runbook.md, section 4). **The vote measures the first 20 seconds of flying each way:** a ballot needs two controls flown for at least 20 seconds each, nothing records more, and only visitors who chose to send are counted. So it can show which controls people pick after a first short try, and a strong preference (two thirds to one third) shows within a few hundred votes; it cannot show which control is better over minutes of play, why anyone picked it, or a small difference (57 to 43 needs thousands of votes; the audit simulations disagree on how fast a strong preference shows, so take these figures as rough). Five equally liked controls sit up to about 340 / sqrt(N) points apart by luck alone (34 at 100 votes, 24 at 200, 17 at 400, 12 at 800, 9 at 1,600: the 95th percentile of the top-to-bottom spread in the 2026-10-02 audit simulation, a re-implementation of the scorer rather than the repo's code), and `/results` prints that figure for each family's own count under its table. Desktop has eight controls and the card never suggests three of them, so its least-compared controls are noisier than that figure says (about 2 comparison points each at 100 votes).

Scripted check of how far stuffing moves a contested control (a control at 50% among 100 honest two-control ballots over 60 groups, stuffers claiming all 8 controls and picking it), reproduced through the real reader: one stuffing group 54%, 7 fresh groups 67%, 25 groups 83%, 100 groups 94% (`cap 3` gives the same: its favorite cap is also 2). Before the favorite cap (fix round 2) the same attack gave 58%, 79%, 91% and 98%, and under the earliest rules (unit weight per pair, no group cap) 40 such ballots from one tunnel reached 96%. The caps price the attack per network block, not per request.

How many fresh groups it takes to put the weakest honest control in first place (a scripted check, desktop family, each attacker group sending 5 ballots that name it and claim all 8 controls; honest ballots spread over 0.8 groups each): with 100, 200, 500, 1,000 and 3,000 honest ballots, **15, 26, 43, 89 and 228 groups**; under the fix-round-1 rules (shrunk rate and a fixed six-group lead rule) 6, 11, 18, 36 and 109. It stays about a tenth of the honest groups, not a fixed handful (the default floor is now 300 votes, so the 100 and 200 rows describe a lowered `minv`). Nothing anonymous makes it dearer than that; the `cap` knob (2 at the lowest, favorite cap 1) is the owner's tool while an attack runs.

## Results

- `GET /api/results` returns `{v, round, asOf, open, families}`; `votes`, each control's `picked` and `tried`, and `tie` are the counted totals **rounded down to a multiple of 5**, so no two numbers add back up to the exact number of ballots; `rate` is `wins / (wins + losses)` in whole percent. `lastFlown` is `{n, last, first, even}` (the order check of item 6 above: `n` rounded down to 5, the rest whole percents) or `null` until the family is ranked and has 200 such picks. **Wins and losses are not published.** `open` is `false` when the owner closed voting and also when the round is full (the stored votes reached `max`), so the card says voting is closed instead of "try again later". Not published: voided or capped counts, limits, the cap, keys, builds, codes.
- `/results` is a route handler (`src/app/results/route.ts`, not a page: a page cannot set its own headers or status) that answers one server-rendered HTML document with no script and `noindex`: under the title the sentence `The vote measures the first 20 seconds of flying each way.`, then per family either `Not enough votes for a ranking yet on ...` (and `About n votes so far.` from 5; below the floor that count is all there is: no table, bar, percent or control name) or, from the floor, a table in ranking order followed by `With about n votes, two controls can end up about x points apart by luck alone.` (x is 340 / sqrt(n) in whole points, n the family's own published count) and, once it has enough picks, the order check line; last, the fixed sentence `Votes, not people. Anonymous counts, a guide, not a ballot. ...`. It links to `/privacy` and back to the game. It ignores its query string. Only `GET` (and `HEAD`) is served: `POST`, `PUT`, `PATCH` and `DELETE` answer 405 with `Allow: GET, HEAD, OPTIONS`, and `OPTIONS` answers 204 with the same list (`/api/results` is the same).
- **One shared snapshot per server process**, held on `globalThis` so the page, the JSON route and any other route bundle use the same one (`src/server/vote/shared.ts`; a plain module-level variable was one copy per route bundle), refreshed at most once per 120 s (3 store commands), by a single flight that every concurrent request awaits. A failed read is not retried for 15 s and logs `[vote] results refresh failed`: the stale snapshot is served with its honest `asOf`, but **only until it is 10 minutes old**; after that the answer is the error (502, or the failed page), so an outage or a mistyped key shows as an error, never as an old tally for ever. A reply that is well typed but not the shape of the three commands (an odd-length `HGETALL`, a knob reply that is not exactly 8 fields) counts as a store failure too, never as an empty tally. **Cache-Control:** a real tally is `public, max-age=0, s-maxage=120` (no `stale-while-revalidate`); every failure (502) and the not-set-up answer (503) of `/results` and `/api/results` is `no-store`, so a CDN cannot keep an error page. After a void or a knob change, wait about 4 minutes (120 s function plus 120 s CDN) and check `asOf`. `open` in the results follows the kill switch on the same schedule (the snapshot's age, up to about 4 minutes), while votes stop on the next vote.
- **Measured on 2026-09-29** (before `/results` became a route handler) against a production build under `next start` on a local port: a `/results` header from `next.config` did answer `public, max-age=0, s-maxage=120`, so Next does not override a config header; that is why the config no longer sets one for `/results` (it would also cover the failure pages) and the handler sets it. The Vercel edge itself has not been measured. The runbook's launch check reads it from the live domain; if Vercel differs, `/results` falls back to no caching and the Firewall rate limit carries the load.

## Storage backends

`storeFromEnv` (`src/server/vote/store.ts`) is the one place that picks a backend; the handlers only see a store with one method. **Upstash wins when its URL and token are both present; otherwise a Neon connection string in `DATABASE_URL` (or `POSTGRES_URL`); otherwise the vote is closed.** A half-present Upstash pair counts as absent. A `DATABASE_URL` that does not parse gives closed, with no fall-through to `POSTGRES_URL`. **Only a Neon host parses: `*.neon.tech`** (CODE-10). `DATABASE_URL` is also what an unrelated Postgres project sets, and its password would otherwise travel as a header to `https://<that host>/sql` while the vote created `hv_*` tables in it; any other host, an IP address, `localhost` and `127.0.0.1` give closed. Only a test can pass the injected `allowLocal` option that admits the two local names. `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL` and prefixed names are never read. The production-`https` check applies to the Upstash URL only (a Neon connection string always travels over https). No npm dependency and no driver: both backends are plain `fetch`.

| Environment name | Needed | Set by |
|---|---|---|
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | one backend needed | the Upstash integration |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | with the URL | the Upstash integration |
| `DATABASE_URL` (or `POSTGRES_URL` as a fallback name) | the other backend | the Neon integration; used only when there is no complete Upstash pair. Use the pooled string; do not use a `--prefix`. |
| `VOTE_SALT` | **required** | you: `openssl rand -hex 32` in your own terminal, at least 32 characters, never the store token. Without it voting stays closed. |
| `VOTE_ALLOW_PREVIEW` | optional | set to `1` to let a preview deployment vote. Otherwise preview is closed for both backends, so preview traffic never reaches the production store. |
| `VERCEL`, `VERCEL_ENV` | automatic | Vercel. Keys are `hv:production:...`, `hv:preview:...`, or `hv:local:...`. Keep "Automatically expose System Environment Variables" on: without them every visitor is one address and votes go to `hv:local`. |

None is ever committed and none uses a `NEXT_PUBLIC_` prefix. One cold-start log line prints words only (`[vote] config store=ok|missing salt=ok|missing|short env=<name>`).

**Upstash (Redis, REST `/multi-exec`).** Keys, all namespaced `hv:<env>:` and tagged `r3:s3` where they hold votes:

| Key | Type | Kept | Content |
|---|---|---|---|
| `vote:r3:s3` | hash | until the owner deletes it | field = the 32-hex code, value = the 18-character entry |
| `void:r3:s3` | set | until the owner deletes it | the owner's voids: an hour, or `T:<day>:<group>`, or `T:<hour>:<group>` |
| `ctl` | hash | until the owner deletes it | `mode`, `unit`, `block`, `global`, `max`, `cap`, `minv`, `round` (kill switch and knobs; not round-tagged) |
| `rl:u:<day>:<hex6>`, `rl:b:<day>:<hex6>` | counter | 25 h (90,000 s) | unit and block buckets |
| `rl:r:<hex6>` | counter | 30 days | the round bucket of a network (no day in its key) |
| `rlg:<day>` | counter | 30 days | new ballots that passed the address limit that day (audit evidence) |

**Neon (Postgres over its SQL-over-HTTP endpoint).** Three generic tables in `public`, created on the first request of each server instance (`IF NOT EXISTS`, serialised with an advisory lock): `hv_kv` (`k`, `v`, `exp`: the counters), `hv_hash` (`k`, `field`, `value`: the vote hash and `ctl`) and `hv_set` (`k`, `member`: the voids). The keys are the same strings as above, in the `k` column, so one database serves production and preview. One request is one transaction at `READ COMMITTED`, so a batch commits all or nothing, and every parameter travels as a bound value (the SQL text is a fixed set of constants). Expired rate rows are ignored at once and deleted by a cleanup that runs at most once per 10 minutes, on a vote request that touches the counters, 200 rows at a time. `pnpm test:pg` proves the SQL and the handlers against a throwaway local PostgreSQL (a unix socket only, skipped when `psql`, `initdb` or `pg_ctl` are missing, and the run then prints `PG PARITY SUITE SKIPPED` and says the Neon SQL is not proved (CODE-10: a green run that did not run must not read as a pass), about 8 s, not part of `pnpm test` or `pnpm verify`). **Unverified until the live check:** the hosted endpoint's exact behaviour (wire format, role privileges, cold start time after the compute suspends, free-plan limits). The steps that check them are in [vote-runbook.md](vote-runbook.md).

## What is stored (privacy and retention)

| Data | Where | Kept |
|---|---|---|
| The way you picked (or can't tell), the ways you tried, the one you flew last, touch or desktop, the UTC hour, a random code, and the network group code (3 hex characters, changes every day, shared by about 4,000 blocks): one 18-character entry plus its code | `vote:r3:s3` (Redis hash, or `hv_hash`) | until the owner deletes the round; the group code stays with the vote |
| Keyed hashes (HMAC with `VOTE_SALT`, plus the UTC date) of your network address (6 hex characters) and of your network block (6 hex characters), as counters | `rl:u:` and `rl:b:` keys (or `hv_kv` rows) | about a day: 25 h, then expired. Redis deletes them at expiry. On Neon they are ignored at expiry and deleted by the cleanup above, so with no votes at all an expired row can stay in the table until the next vote or until the owner drops it. |
| A keyed hash (HMAC with `VOTE_SALT`, no date, 6 hex characters) of your network address (IPv4) or /64 network (IPv6), as a counter of the votes sent from it, no vote in it | `rl:r:` key (or `hv_kv` row) | 30 days, then expired like the others |
| Counter of requests that passed those limits (no address in it) | `rlg:<day>` | 30 days |
| Attempts per keyed hash, in server memory | one server instance | one UTC day at most: dropped as soon as the instance sees the next day, and on restart |
| Seconds played per control, the voted or skipped mark, the saved unsent vote (the pick and its code, 24 h) and the ballot shuffle seed | this device's `localStorage` (`halaverga.vote.play.v2`, `halaverga.vote.v1`, `halaverga.vote.pending`, `halaverga.vote.seed`) | on the device; only the vote itself is sent, and only on Send. Blocked storage falls back to safe defaults. |

No raw address, cookie, account, user agent, note or lab measurement is stored. **Our code never logs an address, body, nonce, key or token; Vercel's platform logs do** (Vercel keeps network addresses in its own server logs under its own rules). The only server log lines are fixed words: `[vote] config ...`, `[vote] store request failed`, `[vote] results read failed`.

The card shows this line (`PRIVACY_SHORT`, `src/lib/vote/privacy.ts`) next to a link `How your vote is counted`:

> No sign-in, no cookies, no text box. Your vote keeps what you picked, tried and flew last, touch or desktop, the hour, a random code, and a daily network group code shared by about 4,000 networks.

`/privacy` (a static page, no tally, no store call, no client JavaScript; linked from the foot of `/results`) shows the full text (`PRIVACY_FULL`):

> No sign-in, no cookies, no text box. We keep the way you picked (or "can't tell"), the ways you tried, the one you flew last, touch or desktop, and the hour you voted. Each vote also keeps a random code, so a resend counts once, and a network group code: a short keyed hash of your network block that changes every day and is shared by about 4,000 different blocks, so on its own it does not identify you or link your votes across days. Votes are kept until the poll is deleted. To limit repeat votes we keep keyed hashes of your network address and of your network block for about a day, and a keyed count of how many votes were sent from your network (a number, not a vote) for up to 30 days; after that they stop counting and are deleted when the store next tidies up. The hashes use a secret key that only we hold; whoever held it could test whether a known network voted. On a busy day or from a shared network a vote can be refused (the page says so and nothing is stored). Vercel, our host, keeps its own server logs. Your lab measurements stay on this device.

Every clause was checked against the code on 2026-09-29: the entry (`src/lib/vote/entry.ts`) holds exactly the hour, device, favorite, tried mask, last and group code; the code is the hash field; the rate keys are `HMAC-SHA256(VOTE_SALT, kind|network|UTC date)` cut to 6 hex characters and expire after 90,000 s; the round key is `HMAC-SHA256(VOTE_SALT, r|network|round)` cut to 6 hex characters, holds a bare count and expires after 30 days; the group code is the same construction on the block, cut to 3 hex characters; no cookie is set or read anywhere in `src/`. Three limits of that text, stated in the open: the keyed hashes and the group code depend on `VOTE_SALT`, so **someone holding the salt could narrow a live network key to about 256 IPv4 addresses for its day, narrow a stored group code to about 4,096 blocks, and test whether a known address voted on a given day** (the round key, which has no date, would let them test that for the whole 30 days; it holds a count only and is never stored next to a vote) (keep the salt apart from the database credentials); the round's data, group codes included, stays until the owner deletes it; and Vercel's own logs are outside this app. An earlier text (round r2) said notes were deleted after about 90 days; there are no notes now.

## Rounds, schema and the key tag

`VOTE_ROUND` is `r3` and `VOTE_SCHEMA` is `3` in `src/lib/vote/ballot.ts`; every vote key carries `VOTE_KEY_TAG = r3:s3`, so a later shape change can never mix into older data. Bump the round when the controls change meaningfully or when a code change alters the vote rules, the weights or the group cap maths: the new round starts from zero and every device may vote again. Bump it in the same release as such a change, so an old deployment that still runs the old code writes to a round nobody reads.

- **r1 to r2 (2026-09-28).** r1 counted four styles with one shared favorite tally. r2 covered ten controls with a separate tally for touch and for desktop.
- **r2 to r3 (2026-09-29).** The question became "which way of flying felt best?": a pick or Can't tell instead of a favorite plus 1 to 5 ratings and an optional note; a vote needs 2 tried controls instead of 1; every ballot weighs the same; scoring is head to head; a network group code per vote lets the owner cap and void by network; limits refuse honestly with 429; the store can be Upstash or Neon; `VOTE_SALT` became required. Removed: ratings, notes, the build stamp, the `seen:` keys and the per-hour rate limit. r2 held no real votes (no store was ever connected), so the bump lost nothing; r2 keys, if any exist, are never read. A v2 body (or any body with `note`, `ratings` or `build`) answers 400 and an old open tab tells the player to reload. Every device starts r3 with zero play seconds and no vote lock.

## Response headers

`next.config.ts` builds `headers()` from `src/config/securityHeaders.ts`; the last matching entry wins for the same key, so the common group comes first.

| Group | Headers |
|---|---|
| every route | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` that denies camera, microphone, geolocation, payment, usb, serial, bluetooth, hid and browsing-topics, and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'` |
| `/api/*` | the CSP becomes `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox`, plus `Cross-Origin-Resource-Policy: same-origin` and `X-Robots-Tag: noindex`; no `Cache-Control` (each handler sets its own) and no `Access-Control-*` |
| `/results` | `X-Robots-Tag: noindex` from the config; no `Cache-Control` there: the handler sets `public, max-age=0, s-maxage=120` on a real tally and `no-store` on the 502 and 503 pages |

There is deliberately **no script CSP on the game**: it would need `'unsafe-inline'` and `'wasm-unsafe-eval'`, so it adds almost no protection (no stored or reflected user text exists), and it could break WebGPU or workers on paths not tested on a real iPhone. Framing is denied everywhere (vote-by-proxy fails in Chrome and Safari). `images.unoptimized` is on. `scripts/check-vote-build.mjs` (after `next build`) checks that the routes exist and that the built routes manifest carries these groups.

## Anti-abuse, stated honestly

What the design does: one address, one block or one tunnel counts for a bounded number of votes a day; a lying `tried` list carries no extra weight; a burst from few networks is scaled to `cap` votes per group; a burst from many networks is visible to the audit by group and can be voided by group; a vote over any limit is refused with a 429 the card explains; a flood costs 0 store commands after the first requests; nothing anyone sends is stored as text.

What this cannot do:

1. **An attacker with many fresh network blocks, at no cost.** Tor exits, free CI runners and free IPv6 tunnels give new blocks. Each fresh block adds up to 5 counted votes a day per family (figures above). Nothing anonymous stops this; only an account or a CAPTCHA would, and the card promises neither. The design makes it priced, visible and reversible.
2. **A script can vote.** No proof of play or of a human. The code is a dedupe key only.
3. **Denial of voting for a day.** About 20 fresh blocks (60 counted votes each, from 8 addresses each) use up the day's 1,200 counted votes; every later vote that day gets 429 (Retry-After to UTC midnight) and keeps its pick. Honest votes before that stay. The counters reset at the next UTC day; about 5 such days fill the 6,000 ceiling, after which `/api/results` says `open:false` until `max` is raised. A refused vote is not stored and cannot be recovered. A resend of a stored code costs none of the day's budget. **One attacker who rotates IPv6 /64s inside one /48 can fill that /48's block for the day in about 60 requests**; that closes that /48 for the rest of the UTC day and nothing else (the round counter is per /64, so it cannot lock a /48 for 30 days, F2).
4. **Shared networks beyond their limit** get 429 until the next UTC day, and a very shared network is under-weighted against home networks (the `share day` preset in the runbook is for an event).
5. **The owner has to look.** The audit and two counts are manual; there is no alerting and no public alarm.
6. **The public tally is a feedback oracle** for an attacker who watches it (rounded votes, per-control numbers once ranked, refreshed every 2 to 4 minutes). Hiding it would hide the result from honest visitors.
7. **Sixty fresh blocks can unlock the ranking at launch** (300 votes, at most 5 counted per group). Raise `minv` or watch the audit in the first hours. The floor counts group-days: the group code changes every day, so a group cannot be followed across days, and one address is bounded across days only by the round limit (10 votes), not by the floor. Small polls are noisy: in the 2026-10-02 simulation of honest ballots that follow the card's suggestions, 100 ballots give the default about 93 comparison points, each control the card suggests 25 to 30 (touch) and the three desktop controls it never suggests about 2 each, and about 14% of the ballots, all naming one control, can still take it to the top of a poll of a few hundred; the lead rule (15 comparison points from a tenth of the family's groups, at least 6), the shrunk rate and the favorite cap (2 unanimous votes per block) make that cost about a tenth of the honest groups in fresh blocks (see the figures above), not one.
8. **Hybrid devices** (touch laptops, iPads with a pointer) can be credited to the touch family, and Flow, Captured and Mouse + keys score lower with people who lack a trackpad.
9. **A whole-hour void drops the honest votes in that hour** with the bad ones; a group void does not. `cap`, `minv` and the void set re-score history by design; check `asOf` after changing them.
10. **The store outage window:** a store error holds an instance at 502 for 5 s; those votes get the `error` text and can be resent.
11. **No script CSP** (above) and **static egress** (models, textures) has no in-app ceiling: only the Firewall rules and Spend Management.
12. **Vercel, Upstash and Neon behaviours are assumptions** until the launch checks in the runbook have been run: `x-vercel-forwarded-for` set and `x-forwarded-for` overwritten, the Firewall's IPv6 grouping and rule quotas, the `/results` cache on the live domain, plan limits and prices, Spend Management, the Neon endpoint itself.
13. **Memo eviction.** An instance remembers 5,000 keys; a flood rotating more keys than that can evict one, which then costs 5 commands a request until it is refused again.
14. **The round limit is per network, not per person.** A carrier address that many phones share (CGNAT) is 10 votes per 30 days in all; after that its visitors get 429 without a Retry-After until the counter expires. An IPv6 network is counted by its /64 (one device or home), not its /48: a /48 key let 10 requests lock a whole carrier pool for 30 days (F2). The price: a free IPv6 tunnel gives its owner a /48 to rotate /64s in, so the round limit does not stop that host across days; what bounds it is the block limit (60 a day per /48), the group cap (5 counted a day, 2 for one favorite) and the lead rule. Raise `round` for an event or if the audit shows honest 429s from one carrier.
15. **A slow store can spend an honest voter's budget (C3).** Gate A is applied by the store before the reply can time out, and a counter cannot be refunded inside MULTI/EXEC, so a voter who taps Try again after each 502 spends one address slot per attempt (8 by default) with no counted vote, and the same for the block (60). Refunding after a timeout is not safe (the batch may have committed), so it is accepted: the store error latches the instance for 5 s, and the pick stays saved for after the outage.
16. **The main ceiling can overshoot under concurrency (F4).** The stored-vote count is read in gate A and the write is two round trips later, so requests already in flight all pass; the overshoot is at most the day's unspent global budget (1,200 by default), never more.

## Fallback: no store

The game never depends on the vote. With no store, no valid salt, preview without opt-in, or a non-https Upstash URL on production, `POST /api/vote` and `GET /api/results` answer 503 `closed` after 0 store commands and `/results` answers 503 (no-store) with `Voting isn't set up on this deployment yet.` The header button still shows (it cannot know), the card's open-time check learns `closed`, and Send ends in the Closed state (`Voting isn't open right now.`).

## Owner tools

- **Kill switch and knobs, no redeploy:** one `ctl` row (`mode closed`, `unit`, `block`, `global`, `max`, `cap`, `minv`, `round`). Redis console lines and the Neon SQL for each are in [vote-runbook.md](vote-runbook.md).
- **Undo, nothing is deleted:** add `T:<day>:<group>` (a network group for a day), `T:<hour>:<group>` or an hour to the void set; remove the member to restore.
- **Audit:** `node scripts/vote-audit.mjs --hours 48 --env production --yes` (read-only, Upstash, your own shell) names the network groups behind a bad hour or day and prints the void lines. For Neon, run the two audit SELECTs from the runbook.
- **Local and LAN demos.** Off Vercel every client is the single address `local`, so under the default limits the 9th vote from one local or LAN address gets 429. `node scripts/fake-upstash.mjs --demo` (a dev-only in-memory store on `127.0.0.1`, refuses to run on Vercel) seeds 40 sample touch votes from 14 network groups and presets `ctl unit 200 block 200 global 20000 round 1000 minv 30` (the default ranking floor is 300), printing `demo data seeded: 40 votes, 14 groups; ctl unit, block, global, round raised, minv 30`, so `/results` ranks at once and a person can test with up to 200 votes a day. Run the app on a production build with `KV_REST_API_URL=http://127.0.0.1:<store port> KV_REST_API_TOKEN=dev-token VOTE_SALT=<a fresh random string of at least 32 characters> pnpm exec next start --port <free port>`. The token `dev-token` belongs to the fake store only. Never use these overrides on a real deployment.
- **Live check over real HTTP:** `scripts/vote-live-check.mjs` drives a running production build against the fake store, one fresh app process per phase (`functional`, `unit`, `global`), and asserts the status codes, the headers and the exact command counts above (12, 5, 5, 11, 0, closed 5 then 0, first results read 3 then 0). Its recipe is at the top of the script. The full functional phase takes about 5 minutes; `--fast` skips the waits.

## Launch gates

Before the link goes public. None has been done, and no agent does them: they are dashboard and terminal steps, with the exact clicks in [vote-runbook.md](vote-runbook.md).

1. Connect one store, Upstash or Neon, to **Production only**.
2. Set `VOTE_SALT` (required): `openssl rand -hex 32` in your own terminal, at least 32 characters, never the store token.
3. **Vercel Firewall:** read the plan's rule and rate-limit quotas first, then create rate limits for `/api/vote` (20 per 60 s per IP, and deny non-POST) and for `/api/results` and `/results` (30 per 60 s per IP), plus the kill-switch rule K1 created disabled. **If the plan cannot rate limit `/api/vote`, do not publish the link.** Only Deny and Rate limit actions, never Challenge (it sets a cookie).
4. Deployment Protection Standard or stronger, previews included.
5. Redeploy from the dashboard, with system environment variables exposed.
6. Live checks: the headers above on the live domain, a spoofed address that does not multiply the rate keys, the kill switch, one vote from an iPhone and one from a desktop trackpad, `/results` and `/privacy`; for Neon also the hosted-endpoint check (first call, cold start, first-request race). Then reset the poll before sharing the link.

## Cost and quota

A counted vote is 12 commands, a refused one 5 or 11 until an instance memo or latch takes over, then 0 (one probe per expiry, not one per request in flight). The Upstash free plan has a monthly command allowance and Neon a storage and compute allowance; check the current numbers in the consoles (this repo has not). A poll with a vote more often than every 5 minutes keeps a Neon compute awake all day. The **Firewall rate-limit rules are the launch gate**: add them before sharing the link (see the runbook).

## Tests

- **Node** (`pnpm test`): the handler and its limits, every attack-regression row (the finding id is in each test title), the scoring, the store adapters, the results reader and cache, the pages, the headers and this documentation's numbers (`tests/vote-docs.test.ts`) run against a fake Redis that counts commands, a fake Neon and injected `fetch`. No test reaches a real database. `pnpm test:pg` adds the real-PostgreSQL parity tests.
- **Build** (`pnpm verify`): typecheck, tests, `next build`, the landing first-load budget (636 KB, printed 636.0 KB after this work; no vote code is in the first load except two changed pause-card strings) and `scripts/check-vote-build.mjs`.
- **Browser**: `tests/vote*.spec.ts` (every title starts with `@vote`; run with `-g "@vote"`) mock `/api/vote` and `/api/results` with `page.route` and cover the chip, the card states, the three taps, retry with the same code, the 429 copy, focus, the 44 px targets, axe AA, forced colours and the response CSP, in Chrome emulation.
- **NOT DONE:** voting on a real iPhone (Safari, portrait and landscape) or with a desktop trackpad; voting against a real Upstash or Neon store; the Vercel Firewall rules and the launch checks. Emulation is not iPhone validation. Record the device checks in the checklist in [gesture-lab.md](gesture-lab.md).
