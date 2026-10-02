# Screen cleanup (task `screen-cleanup`)

Owner brief (Garo): fewer buttons on top, one Controls place, a Vote button that only shows when it works, one preview link.

Built unit by unit, one small commit each. Flight-feel changes are separate, revertable commits.
The decisions and any copy Garo must confirm are recorded in `docs/DECISIONS.md` by the last unit.

## Before the preview link goes out: is the ballot open?

The Vote pill, the Controls sheet's Vote and the pause card's Vote show only while the ballot is open. The page asks `/api/results` once, as soon as two ways are flown; a 503 or `open:false` hides all three (offline or a 500 keeps them, and the card says voting may be paused). A build with no store is closed, and so is a Vercel preview without `VOTE_ALLOW_PREVIEW=1`. On a closed link a player sees the two dots and then nothing, so the "Vote shows up after two ways" check cannot pass there. The code has no override for this and must not get one.

1. Ask the link: `curl -s -w '\n%{http_code}\n' <link>/api/results` must end in `200` and the body must say `"open":true`. A plain `next start` says `503`.
2. A link served from the Mac: run the dev-only fake store and point the build at it (the recipe in [vote-runbook.md](vote-runbook.md) section 5). The fake store and its `dev-token` are local to the Mac, and the salt is a throwaway made on the spot; no real store, token or salt is ever used for a playtest link.

   ```
   node scripts/fake-upstash.mjs --port <store port> &
   KV_REST_API_URL=http://127.0.0.1:<store port> KV_REST_API_TOKEN=dev-token \
   VOTE_SALT=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") \
     pnpm exec next start --hostname 0.0.0.0 --port <free port>
   ```

   Checked on the screen-cleanup build (served on 127.0.0.1, store on port 3475): with this the route answers `200` and `"open":true`, and a phone-sized page with two ways flown shows the pill; on the same build without it the route answers `503` and the page shows no pill and no dots.
3. A Vercel preview: a throwaway second store connected to Preview only, with its own `VOTE_SALT` and `VOTE_ALLOW_PREVIEW=1` (the runbook's "Optional extras"). If neither is done, tell Garo plainly that the Vote button will not show on this link.

## Left for DECISIONS.md (the last unit writes it)

- Large text on a phone with the Vote pill: the pill wraps under Controls (the row is 96 px tall, `--row-extra`, which `--hdr` adds so anything under the row clears it) rather than the readout losing the altitude number. 320 wide at 200 percent cannot fit the number beside Controls and Pause even without the pill; it is clipped there, never put over a button.
