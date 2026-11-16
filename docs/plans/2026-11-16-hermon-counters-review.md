# Counters on the Hermon fight: plan review

Plan: `2026-11-16-hermon-counters.md`, first revision (uncommitted), against source at 1f5a9d4.
Reviewer: one fresh-conversation agent (mid-tier model), read-only, with no access to the planning conversation.
Reading list: `AGENTS.md`, the plan, `git diff 508207a codex/arkham-counters -- src`, and the fight sources the plan names
(Shooter, banish, banishState, strike, swordString, swordBlow, celestialBattle, Player, wardenCounter, combatFlow, encounter,
shooterFault, Battle, Suit, Scene, BattleHud, trackpadPill).
Completion: the reviewer returned a full report (12 tool uses, about 2.5 minutes). Verdict: ready after fixes.
The lead checked every finding against the source before acting on it.

## Findings and what was done

| # | Finding | Checked | Disposition |
|---|---|---|---|
| 1 | Camera effects run inside `stepShooter` on the scaled step, so shake and view punch would decay five times slower, against D4. | True: `shooterStep.ts` passed `dt` to `advanceCamFx`. | Fixed. `ctx.realDt` carries the real step; test in `slow-motion.test.ts`. |
| 2 | The fail safe covered only flight; `Suit` and `Battle` also read the scale, and the check had no home. | True. | Fixed. One accessor (`timeScale`, `gameDt`) with a wall-clock stamp; `Player` uses it too. Test added. A wall clock was chosen over the reviewer's per-reader accumulator: one place, and pause cannot trip it. |
| 3a | The keep-target rule used `stringOpen`, so after the 1.15 s window a twice-wounded demon could still lose its casting blow to a redirect. | True: `stepInTime` and `cutFor` read `wounds`, not the window. | Fixed. The rule reads `wounds >= LAST`. Test added. |
| 3b | The rule blocked a counter when the demon in the string is itself the attacker. | True. | Fixed. Never kept when the target is the attacker. Test added. |
| 3c | Undecided: an explicit tap on another demon is overridden by the retarget. | True, as in October. | Decided: kept as in October, stated in D2. |
| 3d | Prompt and press could disagree by a frame. | Moot after 3a (no clock in the rule). | `attacker` (prompt) and `source` (press) are both set in `updateCounterWindow`, before `stepBanish`. |
| 4 | `settleCounter` could credit a hold left by an earlier cut when the retargeted press is refused. | True: `strike.landed` stays true through a hold. | Fixed. Credit requires `strike.serial` to have moved since the press. Test added, and it fails without the fix. |
| 5 | "Launches" also covers a step-in; the opener is not always the cross cut; queue time-out is a free quench. | True. | Plan wording corrected (D2, D3); the time-out is accepted and stated. |
| 6 | `Player.tsx` would pass 200 lines. | Not so: the change swaps an import and adds one argument; 198 lines. | No extraction. Noted that nothing more may be added. |
| 7 | The carried queue test predates the three-cut string. | True for one assertion (one blow no longer binds). | Test updated to the opening cut. |
| 8 | A press at a guarded warden still quenches a dart. | True. | Accepted: any strike press in the window quenches, as in October. |

## Left for a device

- `limitStep` latches count physics steps, not seconds, so they keep real time during the beat. Not expected to matter in 0.8 s.
- View turning at full rate while flight steers at a fifth during the beat (stated in D4).
- Feel, timing and the phone are Garo's to judge on a preview. No physical iPhone was used.

## Not covered by the plan review

Rendering (`CounterCue.tsx`), the HUD markup, momentum-flight internals, warden attack code. Tests were not run by the reviewer.

# Code review of the finished diff

Reviewer: a second fresh-conversation agent (top-tier model), read-only, on the staged diff against 1f5a9d4 with the plan and
the table above. It returned a full report (28 tool uses, about 5 minutes). The lead checked each finding against the source.

| # | Finding | Checked | Disposition |
|---|---|---|---|
| 1 | A counter pressed during another strike waits in the queue up to 0.75 s while the 0.9 s wind-up runs on, so the dart can be thrown before credit, and the angel then dives into it with the prompt showing again. | True. | Fixed. Credit quenches every live dart the attacker threw; the prompt is not offered again while that counter is pending. Test added. |
| 2 | Counters worked on the ground: the battle stands still when not flying, so the prompt stayed up and a press was credited with no dive. | True. | Fixed. `updateCounterWindow` opens no window unless flying. Test added. |
| 3 | Shake strength decayed in real time but its wobble still ran on the slowed game clock, turning a shake into a sway. | True. | Fixed. `stepShooter` keeps a real-time clock for the shake once a real step is given; without one it is bit-for-bit as before. Tests added. |
| 4 | The centre prompt could overlap the warden panel on short screens (estimated from CSS, not measured). | Plausible. | Resolved by moving the prompt to the dart warning's slot at 68% of the height, which it replaces while it shows and which already lives with the warden panel. Frames checked at 390x844 and 844x390. |
| 5 | The speed readout and streaks stay at full dive strength during the beat. | True, by design of the scaled step. | Kept; stated in D4 for Garo to judge. |
| 6 | The prompt is a status line that appears at every attack; a screen reader hears it each time. | True; the dart warning it replaces behaves the same way. | Kept at parity. Not improved here. |
| 7 | The vignette switched on and off instead of fading. | True. | Fixed. Opacity follows the scale in fifths with a short transition; none under reduced motion (no slow motion happens there at all). |
| 8 | `canDive` ignores what is on screen, so a counter can dive at an attacker behind the camera. | True, as in October. | Kept: answering an attack from behind is what a counter is for; the ring's edge arrow points at it. |
| 9 | Notes on the carried `suit-clips.spec.ts` block (a comment and an unbounded loop). | See the browser results below. | See below. |

The reviewer judged these sound: index freshness, the fail safe, pause, reduced motion toggled mid-beat, unmount, the real-time
hit-stop, that C is the trigger and the trigger strikes, and that nothing new reaches the landing page's first load.

# Found by running the real game

- Both counter specs timed out at their first click: they looked for October's "Begin expedition" button and "Holy fire"
  setting. Updated to "Ascend Mount Hermon" and "The fight (demons and the sword)". Unit tests could not show this.
- A live probe (a throwaway spec reading the fight's state through a temporary hook, both removed before commit) showed the
  window opening on a charging demon about 22 m away, the press credited, the charge broken and the ward untouched, at
  1440x1000, 390x844 and 844x390.
- The first captured frame showed two cues naming different demons: the gold ring on the attacker and the HUD's STRIKE ring on
  the usual target. Fixed: the HUD ring follows the counter and reads COUNTER.
- The lead's own warden rule (keep every press aimed at a warden) was too broad and was narrowed before it shipped; see D2.

# Checks run on the finished tree (2026-11-16)

- `pnpm typecheck`, `pnpm test` (236 files, 2731 tests), `pnpm build`, first-load budget (626.6 KB of 629 KB) and the vote build
  check: all pass. The build stopped once with Next.js's notice that 16.4.3 has a known vulnerability (GHSA-mfr8-8qww-v76h,
  moderate, fixed in 16.4.5) and passed when run again, as the notice says to do. The upgrade is a separate change and is not
  made here.
- Browser, system Chrome against a production build of this tree, one worker: `counter.spec.ts`, `counter-lifecycle.spec.ts`,
  `celestial-battle.spec.ts`, `desktop-restore.spec.ts`, `simple-hints.spec.ts`, `suit-clips.spec.ts` and
  `accessibility.spec.ts` pass (28 tests).
- `suit-clips.spec.ts`: the base branch's own copy fails on this flight (a turn reads `cruise`, not `bank-right`). The October
  repair gets past that; its last block wanted three telemetry samples inside the 8 to 15 m/s band, which the 2026-11-11 flare
  no longer allows (it stops within about 16 m), so it now wants at least one sample there and every one to read cruise, with
  a time limit on the loop.
- `counter-lifecycle.spec.ts` uses the shared pause helpers (`lab-browser.ts`) instead of October's pause-card selectors.
- `shooter-desktop.spec.ts` was also run: 4 pass, 5 fail. Those five are the "shooter-desktop 5" the base branch records as
  inherited from before the sword fight (they expect the old bracer shots). Not caused by this change and not fixed here.
- The full browser suite (about 540 tests, over an hour, with about 90 inherited failures on the base) was not run.
- Frames were captured and looked at for the ring, the prompt, the COUNTER target ring and the slow-motion vignette at
  1440x1000, 390x844 and 844x390 in desktop Chrome. That is emulation: the phone's own controls (the hold-to-fly button, the
  Strike button, "Tap" wording) were not on screen, and no physical iPhone was used.
