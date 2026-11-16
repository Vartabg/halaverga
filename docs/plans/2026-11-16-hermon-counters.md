# Counters on the Hermon fight

Date: 2026-11-16. Branch `codex/hermon-counters`, based on `codex/hermon-war` at 1f5a9d4.
Asked for by Garo on 2026-10-20 (counters with slow motion) and chosen again on 2026-11-16 ("Counters + test fixes").

## Goal

A lesser demon that is about to hit the angel can be answered. While it winds up its dart, or while its dart is closing, a strike
press dives the angel at that demon in a short slow motion. Today the only answers are the shield and moving; nothing rewards
reading the attack. Wardens keep their own parry and are not changed.

The same change brings four small test repairs that were reviewed in October and never landed.

## Where the code comes from

`codex/arkham-counters` e93d323..e908082, written against 508207a (which is inside hermon-war). It adds `src/game/counter.ts`,
`counterState.ts`, `bulletTime.ts`, `src/world/CounterCue.tsx` and edits Shooter, Player, celestialBattle, Battle, Suit, Scene,
BattleHud and trackpadPill, with unit tests (`tests/counter.test.ts`, `counter-queue.test.ts`) and browser specs. Its commit
20a394f contains the test repairs of `codex/integration-fixes` 6e5ea29.

Read the source patch with `git diff 508207a codex/arkham-counters -- src`.

Since 508207a the fight changed: a lesser demon now takes three cuts (`src/game/swordString.ts`), a cut holds the angel on the
demon (`strike.ts` `holdStrike`, `finishStrike`), struck demons are thrown (`thrown.ts`), flight has weight
(`momentumFlight.ts`), and wardens have a parry (`wardenCounter.ts`).

## Decisions

D1. Carry in one step. Apply the whole source diff three-way onto this branch and resolve once, instead of five cherry-picks.
One commit that names the source commits.

D2. The counter rule stays as written in October, with one new exception.
- Window: open while `battle.charging` has passed 30% of `BATTLE.windup`, or a live dart will pass within 2.5 m inside 0.6 s,
  and the attacker can be dived at (alive, not down, in sight, clear path, within `BANISH.swordReach`).
- Press: a strike press (context, sword, or a flick not aimed at a bound demon) while the window is open quenches the dart and
  is retargeted at the attacker as a sword command. `banish.ts` then handles it like any sword command, including its queue.
- Credit: only when a strike begun after the press (`strike.serial` moved on) is under way at the attacker or struck it in the
  same step (`settleCounter`). That strike is a dive, or a step-in when the attacker is already wounded and within
  `STRING.reach`. Credit breaks the charge, delays the next attack 2.2 s, plays the rebuke effect and starts slow motion. A press
  whose strike never begins is not a counter; a dart it quenched counts as a deflection. A queued counter can run out of queue
  time (0.75 s); the dart stays quenched and nothing is credited. Accepted.
- New exception, "the press keeps its target" (`counter.ts` `keepsTarget`): the press is not retargeted when its own target (the
  explicit `cmdTarget`, else `swordString.pressTarget`) is one blow from being cast down (a lesser demon with `wounds >= LAST`,
  whether or not the string's window is still open; a warden whose armour is broken) or is a warden left open by a dodge or a
  parry (`wardenCounter.ts` `wardenExposed`). Never when that target is the attacker itself: that press is the counter. A kept
  press still quenches a dart in flight (a deflection) and otherwise does what it did before. Reason: a redirect must never
  take away a finishing blow or an earned opening. A warden that is neither is an ordinary target and the counter comes first:
  the first version of this rule kept every press aimed at a warden, which would have switched counters off whenever a warden
  happened to be nearest the middle of the view.
- Wardens never open the window themselves: `stepBattle` skips them and their darts live in `wardens.bolts`. The exception only
  decides where the press goes; nothing is added to `canDive`.
- A tap on some other living demon while the window is open is still a counter, as in October: the prompt says a tap counters.
- The prompt and the ring follow the same rule for an untargeted press. `counterState.attacker` is the demon such a press would
  dive at (it drives the ring's marker and the "counter!" prompt); `counterState.source` is the attacker whatever the press would
  do, so a tap on it still counters. A dart with no dive to offer keeps its ring and the existing dart warning, not the prompt.
  The prompt is not offered again for an attacker whose counter is already on its way.
- While a counter is offered the HUD's target ring (`CombatTarget`) sits on the attacker and reads COUNTER, so every cue on
  screen names the same demon. The prompt takes the dart warning's place on screen (it replaces that line while it shows).
- No window opens while the angel is on the ground: the battle stands still there and no dive could run.
- A credited counter also quenches any dart its attacker threw while the press waited in the queue.

D3. The counter's strike is an ordinary cut on the attacker: the string's opener (the cross cut) on a fresh demon, the next
cut on a wounded one. No extra damage. The demon the angel left keeps
its wounds under the existing recover rule.

D4. Slow motion. Curve unchanged: scale 0.2, in over 0.06 s, held 0.45 s, out over 0.3 s (real seconds). Reduced motion: none.
- Scaled (game time): `Shooter` `ctx.dt` and `stepBanish` (demons, wardens, thrown bodies, timers), `stepBattle` (darts),
  the angel's animation in `Suit`, and the movement part of `Player`'s physics step (momentum flight, limits, strike motion).
- Real time: look and turn input, the camera and its own effects (shake, view punch and kick: `stepShooter` passes
  `ctx.realDt` to `advanceCamFx` and keeps the shake's own clock, `ctx.shakeT`), the HUD, sky and ambient effects, the sword
  trail and the speed streaks. The speed readout and the streaks show the game's speed, so they stay at dive strength while
  the picture moves slowly. For Garo to judge.
- Known consequence: during the beat the view turns at full rate while flight steers at a fifth of it. For Garo to judge.

D5. Hit-stop does not stretch. `strike.freeze` counts down in real time, so a 0.055 s freeze stays 0.055 s inside slow motion
instead of 0.275 s. `strikeStep` and `strikeVelocity` take an optional real step that defaults to `dt`.

D6. Names. The time-scale module is `src/game/slowMotion.ts`. Comments describe the mechanic and name no other game.

D7. Fail safe. Every reader of the scale (`Player`, `Suit`, `Battle`) goes through `slowMotion.ts` `timeScale` / `gameDt`.
`stepSlowMotion` stamps the wall clock each frame; a reader more than 0.25 s after the last stamp gets 1. So a fault in the
fight (which stops its frame callback before the component unmounts) cannot leave flight or the angel's animation slow. Mount
and unmount also reset it. Pause holds the scale; a paused frame still stamps.

D8. Out of scope: warden parry, new inputs, phone layout, attack cadence, any merge to main, any deploy.

## Files

New: `src/game/counter.ts`, `counterState.ts`, `slowMotion.ts`, `src/world/CounterCue.tsx`, `tests/counter*.ts` (the October
tests plus `counter-string.test.ts`), `tests/slow-motion.test.ts`, `tests/simple-hints-support.ts`.
Edited: `src/game/Shooter.tsx`, `Player.tsx`, `celestialBattle.ts` (`Bolt.src`), `strike.ts` (D5), `shooterStep.ts` and
`shooterShots.ts` (`ctx.realDt`, `ctx.shakeT`), `wardenCounter.ts` (`wardenExposed`), `src/ui/CombatTarget.tsx`, `src/world/Battle.tsx`,
`Suit.tsx`, `Scene.tsx`, `src/ui/BattleHud.tsx`, `BattleHud.module.css`, `trackpadPill.ts` ("C TO STRIKE": C is the trigger,
and the trigger strikes), and the repaired tests.
Every source file stays under 200 lines (`Player.tsx` is 198 with this change; nothing more may be added to it).

## Order each frame (Shooter, priority -25)

`stepSlowMotion(real)` gives the scale, then `stepShooter` with scaled `ctx.dt`, then while not paused: `updateFlowPaths`,
`updateCounterWindow` (real step), `tryCounter`, `stepBanish` (scaled), `settleCounter`.

## What can go wrong

- A press redirected off a string mid-way (cuts one or two). Accepted: the prompt and ring say what the press will do, the
  left demon keeps its wounds, and a cut already under way finishes first because the command is queued.
- The attacker dies or leaves sight between press and launch. `settleCounter` reports "dropped"; no credit, no slow motion.
- Slow motion and a warden attack overlap. Wardens step inside `stepBanish`, so they slow with everything else.
- Slow motion stuck after a fault. Covered by D7.
- Flashing. The cue pulses at 2.5 Hz as a smooth sine and holds steady under reduced motion; the vignette's opacity follows
  the scale in fifths.

## Acceptance checks

1. `pnpm verify` passes (typecheck, all unit tests, production build, first-load budget, vote build check).
2. Unit tests cover: the window opening and closing; retarget and credit; a dropped counter; the keep-target exception for a
   casting blow (window open and closed) and for a warden; the prompt hidden when the press keeps its target; a tap on the
   attacker; the attacker being the demon in the string; no credit from a hold left by an earlier cut; credit for a step-in;
   `Bolt.src`; the slow-motion curve, reduced motion, reset and the 0.25 s fail safe; hit-stop lasting its own length under a
   scale of 0.2; camera shake decaying in real time.
3. Browser specs `counter.spec.ts`, `counter-lifecycle.spec.ts` and the four repaired specs pass in system Chrome. The two
   counter specs were written for October's screens; their start button and setting label are updated to today's.
4. Captured frames show the ring, the prompt and the slow-motion vignette at phone portrait and landscape sizes.
5. Not checked by this work: a physical iPhone. Feel is Garo's to judge on a preview.

## Review

Independent plan review on 2026-11-16, before the refit, and an independent code review of the finished diff after it:
`2026-11-16-hermon-counters-review.md`. This plan is the revision after both.
