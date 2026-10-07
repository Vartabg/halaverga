# Landing page and pause menu · 2026-10-06

Garo, after halaverga.com went live: "next thing that needs to be addressed is the landing page and pause screen menu. they need to
be upgraded to professional standards. use fable for it"

## Where it starts

- Base: the live build (`codex/envoy-outfit` 737fc38: ruins, open map, Envoy outfit), plus `codex/screen-cleanup` merged in. That
  branch is Garo's 2026-10-02 cleanup of the same screens (one top row, one Controls place, Vote only when it works, one hint line,
  landing title and start card in one column, keyboard focus fixes); it was finished and pushed but never shipped.
- Seen on the live landing page at 800 x 1050: "after us." overlaps the expedition line and the first subtitle line; three type
  families (grotesque, italic serif, monospace) compete; the lime Begin button and the lime dot belong to neither the ash world nor
  the suit; the demo note reads like a cookie banner; the footer labels are tiny monospace.

## Direction

The interface takes the Envoy suit's language: graphite panels, bone-white type, one teal accent for focus and the primary action,
over the ash-grey world. Professional means one type system, one spacing scale, clear hierarchy, nothing overlapping at any size,
and the same polish on the pause menu as on the landing page. The words stay unless layout forces a change; any change is listed
for Garo.

## As built (2026-10-07, branch `codex/landing-pause`, Fable)

What a player sees, in plain words: the same start screen and pause menu, with the words unchanged (one addition, below), set in one
typeface on graphite plates with bone type and one teal accent on the thing to press. Nothing lime is left anywhere on the page.

### The system

- **Tokens** (`src/app/globals.css`): `--panel #1c2023` graphite, `--panel-2 #262b2f`, `--ink #eceae4` bone, `--muted #b4b9ba`, `--line #434b50`,
  `--line-strong #8b9397`, `--accent #5ee6d0` teal with `--accent-ink #0c1b1b` on it and `--accent-hover #84eedc`; a spacing scale `--s-1 … --s-8`
  (4 to 32 px) and three radii (6, 10, 14 px). Contrast on the panel: ink 13.8:1, muted 8.4:1, accent 10.9:1; accent-ink on the accent 11.5:1.
  The `--lime` token is gone. Everything it drove moved to the accent and is listed under "Moved with the token".
- **Type**: one family, Geist, self-hosted by `next/font` (`src/app/layout.tsx`: downloaded at build time, served with the static assets
  as `/_next/static/media/*.woff2`, the latin file preloaded; no request leaves the site for a font, so the privacy page stays true).
  A system sans stands behind it. The grotesque, the italic serif and Courier are gone; the readout, the stats tables and the blaster's
  chain counter use tabular figures of the one family instead of the monospace.
- **Focus**: a 3 px accent ring 5 px out with a graphite halo in the gap (`box-shadow`), so the ring keeps 3:1 over the ash sky as
  well as over a panel (1.4.11). The pills in the row keep their own two-tone rings.
- **Motion**, only under `prefers-reduced-motion: no-preference`: the title and start card settle in once (opacity, 8 px), the pause card
  and the recovery card fade in (180 ms), the status dot breathes, pressed surfaces ease. The hint slot and the vote card hold no motion.
- Over the scene, text is always bone (never muted) on the darkened scrim; muted is for panels only.

### The landing page

- `src/ui/Landing.tsx` (new) holds the brand, the title, the start card, the footer and the failed world's card; `Experience.tsx` is 185 lines.
- The title is one family: "Earth," at 700, "after us." at 300, the same size; no italic serif.
- The start card is a graphite plate (`.intro`): eyebrow with a teal status dot, the two lines, Begin (accent, 52 px), the hint line and, on
  first visits, the demo note as a muted aside with a 2 px accent rule on its left (it read as a cookie banner as a box).
- The brand and the Field guide pill sit on the row at the gutter `--gx`; the hero column and the footer share that gutter. The footer is
  12 px of the one family, tracked, bone numbers and quieter labels; the "01" tag is an outlined chip.
- Short landscape phones keep the two-column form (title left at the gutter, card right, the note hidden under 430 px tall).

### The pause menu

- A kicker **"Expedition paused"** above "Take your time.": it is the card's existing accessible name made visible, and it is now the
  region's label through `aria-labelledby` (one line, read once). The only copy addition on either screen.
- Resume is the one accent, full width. Under it one list of full-width rows with chevrons: Vote when it works, Controls with its tried line,
  Field guide, Flight settings with its "Size, left-handed, look speed" line; then "Best played sideways." (portrait touch) and the Home
  Screen tip. The DOM order (Resume, Vote, Controls, Field guide, Flight settings) and every keyboard and focus behaviour are unchanged.
- Short landscape (550 px and under): the card is two columns, kicker, title and Resume left, the rows right, so nothing scrolls on an
  844 x 390 or 667 x 375 phone. "Leave the game?" keeps its two buttons on the same plate.
- The panels it opens share the system: dialogs (Field guide, Flight settings, Flow welcome) are graphite plates with a 22 px title and a
  44 px round close, section labels as small tracked caps over a hairline, accent segment toggles and checkboxes, graphite inputs, chevron
  disclosures, and the sticky Resume footer as before; the Controls sheet and the vote card take the same colours and radii.

### Moved with the token (nothing lime left)

Begin and Resume; the Vote pill and the sheet's Vote; the Controls button's border, open state and focus; checked rows and the Tried badge in
the Controls list; the vote card's picked row, Send, tally and focus rings; the pause card's nudged Vote door; segment toggles, checkboxes
and range sliders in Flight settings; the Field guide's eyebrow, links and the district map's route and pins (`public/district-map.svg`,
regenerated colours in `tests/navigation.test.ts`); the hint slot's plate; the readout's slash; the twin cluster's held buttons, boost ring
and focus; Lift/Land pressed; the tap pad pressed; the Flow panel and welcome; the Gesture Lab table focus; links, selection and the global
focus ring; the `/results` and `/privacy` pages' bars and links (`resultsCss.ts`) and their theme colour; the manifest and theme colours.
The blaster's cyan (`#58e1ff`: muzzle, lab ink, heat ring, list glyph ink) is the world's, not the interface's, and stays.

### Copy changes

- Pause card: kicker `Expedition paused` added (the card's accessible name, now visible). No other word on either screen changed.

### Verification (system Chrome emulation and node; not an iPhone)

- `pnpm typecheck` clean; `pnpm test` 2349 passed (186 files); `pnpm build` clean; `node scripts/check-first-load.mjs` 8 scripts,
  **628.2 KB** of the 629 KB budget (the base measured 627.6 KB in 8 scripts: the split and the new class names cost 0.6 KB; the font adds
  no script); `node scripts/check-vote-build.mjs` clean.
- Browser specs: see the counts in the final report of the task (the targeted set, then the whole `pnpm test:browser`).
- Tests changed because they pinned the old look, and only those: `tests/controls-picker.test.ts` (the slate `#3b5a62` fill, the cream
  `#f5f0dc` edge and the `#142d34e6` / `#132a30` plates become `#3a4247`, `#eceae4`, `#1c2023e6` / `#1c2023`; `var(--lime)` becomes
  `var(--accent)`; the Tried badge's `#1a3029` becomes `#0c1b1b`), `tests/vote-chip.test.ts`, `tests/vote-card-states.test.ts`,
  `tests/vote-fix-round1b.test.ts` (the `#e3ffad` hover becomes `#84eedc`), `tests/controls-one-place.spec.ts`, `tests/vote-doors.spec.ts`,
  `tests/vote.spec.ts`, `tests/vote-low.spec.ts` and `tests/hint-slot.spec.ts` (the lime's `rgb(212, 241, 151)` becomes the accent's
  `rgb(94, 230, 208)`), `tests/navigation.test.ts` (the map generator's colours). No behaviour or accessibility assertion was weakened.

### Screenshots (desktop Chrome emulation, not an iPhone)

`docs/art/landing-pause/{before,after}-{landing,pause}-{1440x1000,390x844,844x390,320x568}.jpg`, taken with
`node scripts/shoot-landing-pause.mjs <server> docs/art/landing-pause <tag>` against a production server; `before` is the merged base
f28ce1e. The phones are rendered at 2x. These show the layout and the look; the seven iPhone checks of `docs/screen-cleanup.md` stay
NOT DONE until Garo flies the link.

### For Garo's eye

- The kicker "Expedition paused": keep, or drop it (one line in `PauseCard.tsx`; the label then goes back to `aria-label`).
- Geist is fetched from Google Fonts at build time by `next/font` (Vercel and this Mac both reach it). A build on a machine with no network
  fails with "Failed to fetch `Geist` from Google Fonts"; the system fallback stack is one line away in `layout.tsx` if that is ever a problem.
- The Field guide's map keeps its teal water; only its route, pins and panel moved to the tokens.
