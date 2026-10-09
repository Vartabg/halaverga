# Screen cleanup (task `screen-cleanup`)

Owner brief (Garo): fewer buttons on top, one Controls place, a Vote button that only shows when it works, one preview link.

Built unit by unit, one small commit each. Flight-feel changes are separate commits titled `FEEL:` and are a few lines of CSS with their own pinned tests, so each can be undone by hand (see "Undoing a FEEL change by hand" below; a plain `git revert` of them conflicts with later commits).
The decisions, the one flight-feel change (the top strip flies, the commit titled `FEEL: top strip passes touches through to the flight surface`) and the copy Garo must confirm are recorded in the "Screen cleanup" entry of [DECISIONS.md](DECISIONS.md).

## What Garo does with the link (three steps)

His whole job, in plain words. Everything else in this file is the agents' record.

1. **Fly the top.** Open the link, tap Begin, fly with one thumb, slide the thumb across the top strip (it steers now), and with that thumb still flying tap Pause with the other thumb.
2. **Try a second way and vote.** Open Controls, pick a second way, fly each way for 20 seconds, watch the two dots fill, and when the Vote button shows up beside Controls, tap it.
3. **Two yes or no answers.** Is the screen cleaner? Are the words OK?

The words he will meet while playing, and the only ones to show him: `Controls`, `Vote`, `Drag to fly`, `Vote is ready · Which way of flying felt best?` and `One way flown. Try another for 20 s, then vote.` (not the accessible names, not the error and loading strings, which are in the copy list for the record).

Not on his list, on purpose: the Home Screen app, landscape, the twin look drag, and pasting the screen diagnostics back (he refuses dashboard chores). They stay below as the agents' record, honestly NOT DONE.

Vote shows up only if the link's ballot is open. Check `/api/results` first (next section). If the link has to stay closed, tell him in one plain line: "Vote will not show on this link." Showing a line about it inside the sheet instead of silence is possible, but those would be new words, so it waits for his OK.

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

## Layers (what lives on each z-index)

Every z-index in the app is one of nine named layers, defined once in `src/app/globals.css` (`tests/layout-tokens.test.ts` fails on any other value). Back to front; the order is the one the game had before the cleanup, only the numbers changed (the paint order at 70,490 sampled points in 70 screen states was identical before and after):

| Layer | z | What is on it |
|---|---|---|
| `--z-world` | -3 | the 3D canvas |
| `--z-veil` | -1 | the vignette |
| `--z-surface` | 1 | the flight surface, the Gesture Lab surface and the crosshair (it paints over them, in DOM order, and under the lab ink) |
| `--z-hud` | 2 | passive overlays, all `pointer-events:none`: the readout, the desktop legend, the Flow and Simple HUD panels, the lab ink |
| `--z-play` | 3 | play controls: the touch layer and twin cluster, the stick ring, Lift/Land, the tap pad, the lab's hold and ghost guides |
| `--z-sheet` | 4 | the Controls sheet and its backdrop: above play, under the top row, so one tap on Pause still pauses and closes it. Not in the first spec's table: the sheet left the top row's stacking context when it became a sibling of the header |
| `--z-bar` | 5 | the top row and the hint slot |
| `--z-card` | 6 | the pause card, "Leave the game?" and the recovery card |
| `--z-vote` | 7 | the vote scrim and card |

Outside the scale: the skip link keeps its literal 100 (it must beat everything), the vote card's sticky footer keeps its local 1 inside the card, and native `<dialog>`s (Field guide, Flight settings, Flow welcome) sit in the browser's top layer above all of it. The two Gesture Lab guides set `zIndex: 'var(--z-play)'` inline. The remap is not a commit that can be reverted alone any more (later commits edit the same CSS lines, and `git revert` of it conflicts in `Experience.module.css` and `tests/layout-tokens.test.ts`). It does not need to be: the numbers live in one place, so a layer that misbehaves is fixed by changing its value in `globals.css` (the test pins the order). The paint order was identical before and after, so there is nothing to undo.

## The agents' record: the seven iPhone checks (all NOT DONE)

Everything built here was checked in Chrome emulation, node tests and real DevTools touches. None of it is iPhone validation. Portrait and landscape, Safari tab and Home Screen app; record each as done or not done. Garo's three steps above cover 1 to 3 in a Safari tab; the rest stay open:

1. The top row is one line, and sliding a thumb across the strip beside the altitude number steers (the one flight-feel change). With the first thumb flying, a second finger tapping Pause pauses, and tapping Controls opens the sheet once. Chrome sends no click for a second touch, so both buttons act on the second finger's pointerup; the code and the emulated test are in place, but whether an iPhone sends the same events is not proven.
2. Controls opens as a bottom sheet, a row pick closes it, and it opens from the pause card and comes back with Done.
3. Two ways flown for 20 s each: the two dots fill, the hint says the vote is ready, the Vote pill appears left of Controls and nothing else moves. Before that there is no Vote button.
4. One hint line under the row, gone after its time.
5. Lift/Land is where it was and one-finger flight feels the same.
6. Twin stick: a look drag that starts near the top still works.
7. Real safe-area insets: the Flight settings screen diagnostics values pasted back.

## Undoing a FEEL change by hand

There are two, each a few lines of CSS with its own tests. A `git revert` of their commits conflicts with later work, so undo them like this and run `pnpm typecheck && pnpm test`.

**The top strip flies on touch** (commit `FEEL: top strip passes touches through to the flight surface`).
1. `src/ui/Experience.module.css`: delete the two rules `html[data-input=touch] .header[data-play]{pointer-events:none}` and `... button{pointer-events:auto}` under the "FEEL: on touch" comment, and put in their place one rule that makes the old dead block again without touching the header's own box (so the Vote pill's wrap at large text still works): `:global(html[data-input=touch]) .header[data-play]::before{content:'';position:absolute;top:0;bottom:0;right:0;width:calc(100vw - 2 * var(--gx))}`.
2. `tests/layout-tokens.test.ts`: delete the `describe('FEEL: on touch the top strip passes touches through ...')` block.
3. `tests/layout-audit.ts`: set `TOP_STRIP_FLIES` to `false` (the surface grid then lets the header block count as a hit on touch).
4. `tests/screen-touch-sheet.spec.ts`: delete the test "a finger held in the strip beside the readout flies ...", the only test that asserts the feel.

**The desktop keeps the whole-row header box** (commit `FEEL: a mouse keeps the whole-row header ...`). It restores what the base had, so it is not meant to be undone: it keeps the trackpad's hover freeze (which keys on `header`) over the strip beside the readout. To undo: delete the `@media(min-width:601px){...html[data-input=mouse] .header[data-play]...}` rule, its `describe` in `tests/layout-tokens.test.ts`, the header-width check in `tests/layout-audit.ts` (the "desktop header box" line) and the strip test in `tests/trackpad.spec.ts`.

## Large text with the Vote pill

With the Vote pill in the row on a phone at 150 or 200 percent text, the pill wraps under Controls instead of the readout losing the altitude number (the row is then 96 px tall: `--row-extra`, which `--hdr` adds so anything under the row clears the pill). 320 px wide at 200 percent cannot fit the number beside Controls and Pause even without the pill; it is clipped there, never put over a button. Emulated text scaling multiplies every element's font size and is not iPhone or Android text scaling.
