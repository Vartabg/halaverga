# Controls demo and vote

> 2026-09-28, Garo: "I want all different types of controls available for the demo and I want to put it up for an online vote."

Halaverga has ten ways to fly. They used to be scattered: two settings pickers in Flight settings, a separate style bar, and a vote that only knew four styles. Now every one of them can be tried from one place, and one vote covers all of them. This page is for people trying the demo and for testers. The registry behind it is `src/game/controlTypes.ts`; the vote backend is in [voting.md](voting.md).

## Where the controls are

There is one list of the ways to fly, and it lives only in the **Controls sheet**. Nothing else on the screen carries a copy of it.

- **While you play.** The top of the screen is one row, 44 px tall: the altitude readout on the left, then (only when the vote works) **Vote**, then **Controls**, then **Pause**. The **Controls** button shows the one word; the control in use is in its accessible name (`Controls: One finger`). It opens the sheet. The row only appears after you press Begin, so the start screen stays as it was.
- **Paused.** The pause card has a **Controls** row (the word, the control in use, a chevron) under Resume. It opens the same sheet over the paused game; the pause card steps aside while the sheet shows and comes back when you close it. **Flight settings** has the same row at the top: it closes the dialog as the sheet opens.
- **Field guide and Flight settings.** They are two rows on the pause card (press Pause), not buttons in the top row. Closing either returns to the pause card; **Resume flight** is always your own tap (Flight settings also has a lime **Resume** in its footer). The Field guide names the way to the sheet in words (`Controls (top row)`) and has no list.
- **On a phone** the sheet's foot also has a **Flight settings** link (it pauses and opens Flight settings), because size, left-handed and look speed live there, not in the sheet.
- **Before Begin.** The landing's header has the brand and a **Field guide** button.
- **First visit.** The start card carries a short passive note: "A demo of new ways to fly. After you begin, try each in the Controls menu, then vote." It has no button. It counts as seen when you press Begin, and only if it was on screen then, so on very short landscape screens (height 430 px or less), where it is hidden, it comes back on the next visit.

The sheet lists only your device family: five controls on a touch screen, eight on a desktop. Which family you get follows the pointer that touched last, so a touch laptop shows the touch list after you tap and the desktop list after you use the trackpad or mouse. (There is no switch for the other list any more: use that pointer.) On a phone, and in a short landscape window, the sheet is a bottom sheet (two columns in short landscape). Otherwise it is a one-column popover under the top row, 420 px wide, right-aligned, so it never covers the crosshair.

## How switching behaves

- **It is instant and it never pauses.** A running game keeps flying; a paused game stays paused. Your position and checkpoint are kept. One exception belongs to Flow itself: the first time you pick Flow on a desktop, its short "Find your flow" introduction opens and the game waits until you finish it or press Skip introduction (Flight settings can show it again). Switching to or from a control that holds the pointer (Mouse + keys, Captured, One finger + keys, Flow) does not pause either: the game asked for the release, so the browser's pointer-release event is read as expected.
- **Held input is released.** Any held key, thumb, stick, held fire and cruise are let go, so nothing carries over from the control you left. If the pointer was captured (Captured, One finger + keys, Flow), it is given back first.
- **It is saved.** The choice is remembered on this device.
- **On a touch screen**, picking a control closes the sheet so you can fly at once. On a desktop, and by keyboard, the sheet stays open until you press Esc, **Done** or click outside it, so you can compare several in a row. Esc closes the sheet and does not pause the game.
- **Opening the sheet** releases held input and moves focus to the current control. The game keeps running.
- **`?controls=<id>`** in the address applies a control for this visit only and does not save it. Any id in the tables below works. The older values `standard`, `draw`, `conduct` and `brush` still work: `standard` clears the lab (the plain touch or desktop control you had chosen), and the other three pick that control.

### Number keys on a desktop

On a desktop, keys **1 to 8** pick the controls in the order of the desktop table below (1 Cursor, 2 One finger + keys, 3 Flow, 4 Captured, 5 Mouse + keys, 6 Draw, 7 Conduct, 8 Brush). They work while paused too. They are ignored on a touch screen, with a modifier key held, on key repeat, while you type in a field, and while a panel, the Field guide or the vote card is open.

Single-key shortcuts can get in the way, so the Controls sheet carries a checkbox, **Number keys 1-8 switch controls**. It is on by default. Untick it and the digits do nothing during play. That setting is stored on this device only (its own `localStorage` key), separate from the game preferences. The digits still work while keyboard focus is inside the list of controls, whatever the setting.

## Touch: five controls

| Control | How it works | Needs |
|---|---|---|
| One finger (**Default**) | Hold to fly, slide to steer, tap a drone to blast it. | A touch screen. |
| Twin stick | Left thumb moves, right thumb looks; buttons rise, descend and aim. | A touch screen and both thumbs. |
| Draw | Draw a line to fly it. Draw a circle to turn around. | A touch screen. |
| Conduct | Rest a finger (or the pointer) to steer. Stir to speed up. | A touch screen. |
| Brush | Swipe to turn, loop big to whirl around. Circle drones to lock on. | A touch screen. |

One finger and Twin stick are the two schemes described in [touch-controls.md](touch-controls.md). Draw, Conduct and Brush are the Gesture Lab controls ([gesture-lab.md](gesture-lab.md)); with the blaster on they use Tap to Blast, so a tap on a drone shoots it. Twin stick does not: it aims with the right thumb and fires with auto-fire or its Fire button, so a tap on a drone does nothing there. That difference is by design, not a bug.

On a short landscape phone (852 x 393) the sheet is wider and lists the five controls in two columns, so all of them show without scrolling. On a smaller window (750 x 340) the sheet scrolls by touch while the game keeps running; the footer's shadow shows there is more above it. On a desktop window at least 721 px wide the eight controls also sit in two columns.

## Desktop: eight controls

| Key | Control | How it works | Hint | Needs |
|---|---|---|---|---|
| 1 | Cursor (**Default**) | Space to fly, then move to steer. Click fires, drag looks. | Blaster off: a click starts flying instead. | Trackpad or mouse; the pointer stays visible. |
| 2 | One finger + keys | Trackpad or mouse looks, W A S D flies, click fires. | Click the scene first to start looking. | Trackpad or mouse, and the keyboard; the pointer is captured. |
| 3 | Flow | Slide to look, two-finger scroll to glide, press to brake. | Built for a trackpad. First time: a short intro. | A trackpad; the pointer is captured. |
| 4 | Captured | Click to cruise with unlimited turning; the pointer hides. | Esc gives the pointer back. | Trackpad or mouse; the pointer is captured. |
| 5 | Mouse + keys | Click to capture the mouse, W A S D to move, click to fire. | Esc gives the mouse back. | A mouse or trackpad, and the keyboard; the pointer is captured. |
| 6 | Draw | Draw a line to fly it. Draw a circle to turn around. | | Trackpad or mouse. |
| 7 | Conduct | Rest a finger (or the pointer) to steer. Stir to speed up. | | Trackpad or mouse. |
| 8 | Brush | Swipe to turn, loop big to whirl around. Circle drones to lock on. | | Trackpad or mouse. |

- **Captured pointer.** In One finger + keys, Flow, Captured and Mouse + keys the browser hides the pointer while you fly and gives it back when you press Esc (Flow also frees it with a two-finger click, see [flow-trackpad.md](flow-trackpad.md)). Esc also pauses the game. Choosing a control from the sheet releases the pointer for you.
- **Cursor** is the desktop default. Fuller detail on each profile: [first-flight.md](plans/first-flight.md), [simple-controls.md](simple-controls.md), [flow-trackpad.md](flow-trackpad.md).
- Draw, Conduct and Brush are the same controls as on touch, driven by the pointer. Their details are in [gesture-lab.md](gesture-lab.md).

## Tried X of N

The sheet and the pause card show **Tried X of N** (N is 5 on touch, 8 on desktop; the sheet also puts a **Tried** badge on each control you have used). A control counts as tried after 20 seconds of actual play on it: a key or pointer held down, or input within the last two seconds. Opening the sheet, tabbing through the list, stepping through the controls one after another, or leaving the game idle counts for nothing. Below 2 tried the line reads **Tried n of 2 needed to vote**, and the **Controls** button carries two small dots, one filled for each way counted (see below). The counts stay on your device.

## How to vote

The question is **"Which way of flying felt best?"** and it takes three taps.

- **Fly at least two ways for 20 seconds each** (the count is per device family). Until then there is no Vote button anywhere. The **Controls** button carries two small dots, one filled for each way counted (their text is in its accessible name: `Controls: One finger: vote unlocks after two ways, 1 of 2 tried`), and the sheet and the pause card say `Tried n of 2 needed to vote` in plain words. The first way to reach 20 s puts one line in the hint under the top row, once per page load: `One way flown. Try another for 20 s, then vote.`
- **When it works, a lime Vote appears.** That is: two ways flown, this family has not voted, and the ballot is not known to be closed. The **Vote** pill sits beside **Controls** (the dots are gone; **Controls** keeps its width). The sheet's foot gets a lime **Vote** beside **Done**, and the pause card gets a **Vote** button under Resume. All three have the accessible name `Vote: Which way of flying felt best?` and open the same card; opening it from the sheet or the pause card keeps the game paused behind it and gives it back when you close the card. The moment it turns on, the hint says `Vote is ready · Which way of flying felt best?` once per page load (only if you watched it happen). The page checks the ballot once per page load, as soon as two ways are flown: a closed ballot hides all three buttons; offline or an unreadable answer keeps them and the card says `Voting may be paused. You can still try to send.`
- After you have voted, no Vote button shows; the sheet's foot says `Vote sent: see results`.
- **Tap the one that felt best, or Can't tell, then tap Send vote.** Only the ways you have flown are listed. Nothing is pre-selected, the order is shuffled per visitor, and the tally shows only after you send. There are no ratings, no note and no text box. A **Send** with no pick says `Pick one way first.`
- The card opens by itself once per page load, when you land after flying and have flown two ways, unless you already voted or skipped. It never interrupts a pause you opened; the pause card puts the line `Which way of flying felt best?` above its Vote button once you are eligible.
- After you send a vote the game does not ask again for 7 days. **Skip** on an automatic open keeps it quiet for 24 hours; **Not yet** or Escape on a card you opened yourself records nothing.
- Touch and desktop are counted separately, and so are the 7-day and 24-hour marks: voting as touch on an iPad does not stop the desktop card, and the other way round.
- If your send fails the pick stays on your device and the card offers it again (`Your last vote didn't send. Tap Send to try again.`). A resend can never count twice, and the first counted pick stands.
- **Limits:** 8 votes a day per network address, 60 a day per network block, 10 per network over 30 days, 1,200 a day for the whole site (UTC days). Past a limit the card says `Voting is busy right now. Your pick is kept. Try again later.` and nothing is stored. A shared network (school, venue Wi-Fi, a carrier address) is limited together, counts for only a few votes a day, and beyond its limit gets that message until the next UTC day.

Anonymous, unverified counts, so treat them as a guide, not a ballot: votes, not people. There is no sign-in, a script can vote, and clearing site data and changing network allows another vote. What is stored and for how long, in words: [voting.md](voting.md) and the `/privacy` page.

## Results

`/results` shows, for touch and desktop separately, `Not enough votes for a ranking yet` and a rounded count until the family has at least 300 counted votes from at least 12 different networks; below that it shows nothing else (no table, bars or percentages). From 300 it shows a table in ranking order: for each control how often it was picked out of how often it was tried and its head-to-head percentage, plus the `Can't tell` count and one line saying how far apart two controls can end up by luck alone at that many votes (about 340 divided by the square root of the votes, in points: 20 at 300 votes, 12 at 800; larger when the least-compared control that shows a percent has few tries). A control tried fewer than 30 times shows `too few votes to tell` instead of a percent, which is what happens to the desktop controls the card never suggests. From 200 counted picks that carry an order, it also shows the order check: how often the control flown last won against the control everyone starts on, and what each would get if every control tried were liked equally, with a plain note that order and liking cannot be told apart from those numbers. Under the title it says a vote needs at least 20 seconds of flying each way it compares and does not include how long you flew. Every vote weighs the same, one network counts for only a few votes a day (5 by default), and the order uses a cautious estimate, so a control with few comparisons cannot jump to first. The vote total is rounded down to a multiple of 5. It is a plain server-rendered page with no scripts and reads a copy cached for 120 seconds, so a change can take up to about 4 minutes to show. `/privacy` explains how a vote is counted.

## Status: what is and is not checked

- **Checked**: node tests on the registry, the selection rules, the vote rules and the results shape, and browser tests in Chrome emulation (phone and desktop sizes) with the vote routes mocked.
- **NOT DONE**: the Controls sheet on iPhone Safari in both orientations; every control's feel on a real phone; a real trackpad for Cursor, One finger + keys, Flow and Captured; keys 1 to 8 on a real Mac; a second finger tapping the Controls button while a first finger holds flight (Chrome sends no click for a second touch, so the button now opens on that finger's pointerup, `src/ui/secondFingerTap.ts`; the emulated test passes, an iPhone is not proven); leaving pointer lock on a real Mac when a control is picked (headless Chrome holds no lock, so only a unit test drives that path); voting on a real iPhone (Safari, portrait and landscape) and with a desktop trackpad; voting against a real Upstash or Neon store. Emulation is not device validation, and none of these feel judgments has been made.
- **Not public yet**: the vote needs Garo's Vercel steps (a store, Upstash or Neon, the required `VOTE_SALT`, the Firewall rule, a redeploy) before the link is shared. They are listed in [vote-runbook.md](vote-runbook.md).
- **Hidden on purpose**: the start-card note on very short landscape screens.
- **Screen cleanup (the top row, the one Controls place, the Vote that shows only when it works, the one hint line):** checked in Chrome emulation only (layout, overlap, target size, axe, forced colours, real DevTools touches); the checks on a real iPhone are listed in [screen-cleanup.md](screen-cleanup.md) and are NOT DONE.
