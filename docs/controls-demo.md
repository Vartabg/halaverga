# Controls demo and vote

> 2026-09-28, Garo: "I want all different types of controls available for the demo and I want to put it up for an online vote."

Halaverga has ten ways to fly. They used to be scattered: two settings pickers in Flight settings, a separate style bar, and a vote that only knew four styles. Now every one of them can be tried from one place, and one vote covers all of them. This page is for people trying the demo and for testers. The registry behind it is `src/game/controlTypes.ts`; the vote backend is in [voting.md](voting.md).

## Where the controls are

- **Controls button.** After you press Begin, a **Controls: <name>** button sits at the top centre of the screen, in the header. It opens the Controls sheet. It only shows once you have begun, so the start screen stays as it was.
- **Before Begin.** The Field guide (the button in the header) lists the same controls.
- **Paused.** The pause card and Flight settings show the same list. There is one list, so a change in any of them shows in all of them.
- **First visit.** The start card carries a short note: "A demo of new ways to fly. After you begin, try each in the Controls menu, then vote." Press **Got it** and it does not come back on this device. On very short landscape screens (height 430 px or less) the note is hidden, because the Controls button is only reachable after Begin anyway.

The sheet lists only your device family: five controls on a touch screen, eight on a desktop. Which family you get follows the pointer that touched last, so a touch laptop shows the touch list after you tap and the desktop list after you use the trackpad or mouse. In Flight settings, a touch laptop also shows a switch to reach the other list.

## How switching behaves

- **It is instant and it never pauses.** A running game keeps flying; a paused game stays paused. Your position and checkpoint are kept. One exception belongs to Flow itself: the first time you pick Flow on a desktop, its short "Find your flow" introduction opens and the game waits until you finish it or press Skip introduction (Flight settings can show it again). Switching to or from a control that holds the pointer (Mouse + keys, Captured, One finger + keys, Flow) does not pause either: the game asked for the release, so the browser's pointer-release event is read as expected.
- **Held input is released.** Any held key, thumb, stick, held fire and cruise are let go, so nothing carries over from the control you left. If the pointer was captured (Captured, One finger + keys, Flow), it is given back first.
- **It is saved.** The choice is remembered on this device, the same as choosing it in Flight settings.
- **On a touch screen**, picking a control closes the sheet so you can fly at once. On a desktop, and by keyboard, the sheet stays open until you press Esc, **Done** or click outside it, so you can compare several in a row. Esc closes the sheet and does not pause the game.
- **Opening the sheet** releases held input and moves focus to the current control. The game keeps running.
- **`?controls=<id>`** in the address applies a control for this visit only and does not save it. Any id in the tables below works. The older values `standard`, `draw`, `conduct` and `brush` still work: `standard` clears the lab (the plain touch or desktop control you had chosen), and the other three pick that control.

### Number keys on a desktop

On a desktop, keys **1 to 8** pick the controls in the order of the desktop table below (1 Cursor, 2 One finger + keys, 3 Flow, 4 Captured, 5 Mouse + keys, 6 Draw, 7 Conduct, 8 Brush). They work while paused too. They are ignored on a touch screen, with a modifier key held, on key repeat, while you type in a field, and while a panel, the Field guide or the vote card is open.

Single-key shortcuts can get in the way, so the Controls sheet and the Controls list in Flight settings carry a checkbox, **Number keys 1-8 switch controls**. It is on by default. Untick it and the digits do nothing during play. That setting is stored on this device only (its own `localStorage` key), separate from the game preferences. The digits still work while keyboard focus is inside the list of controls, whatever the setting.

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

The sheet and the Controls list in Flight settings show **Tried X of N** (N is 5 on touch, 8 on desktop) and a **Tried** badge on each control you have used. A control counts as tried after 20 seconds of actual play on it: a key or pointer held down, or input within the last two seconds. Opening the sheet, tabbing through the list, stepping through the controls one after another, or leaving the game idle counts for nothing. The counts stay on your device.

## How to vote

- Open **Vote on the controls** from the Controls sheet or from the pause card. It is always there. Opening it from the sheet pauses the game behind the card and gives it back when you close the card. Until one control has 20 seconds of play the card only says to fly a little first, so a vote always stands for something you flew.
- Pick your **favorite** and, if you like, give each control you tried a **1 to 5 rating**. You can add a short optional note.
- You can only rate controls you tried (20 seconds of play) in your own device family. If you have not tried them all, the card lists the ones you have not tried and offers **Not yet**, so you can keep playing and vote later.
- The card opens by itself only once, after you have played about three minutes in your family and tried every control of it, and only when you land after flying. It never interrupts a pause you opened. The pause card leads with the vote once you have tried three controls and played about three minutes.
- After you send a vote the game does not ask again for 7 days; after **Skip** it stays quiet for 24 hours.
- Touch and desktop are counted separately, and so are the 7-day and 24-hour marks: voting as touch on an iPad does not stop the desktop card, and the other way round.

Anonymous, unverified counts, so treat them as a guide, not a ballot. There is no sign-in and nothing proves that a vote came from someone who really played. The only limit is 20 votes per hour per network address. What the card stores and for how long: [voting.md](voting.md).

## Results

`/results` shows one table per device family (touch and desktop): for every control, the favorite votes, the share of that family's votes, how many voters tried it, and the mean rating (shown once at least three people have rated it). It is a plain server-rendered page with no scripts. It reads a cached copy that refreshes about every 30 seconds.

## Status: what is and is not checked

- **Checked**: node tests on the registry, the selection rules, the vote rules and the results shape, and browser tests in Chrome emulation (phone and desktop sizes) with the vote routes mocked.
- **NOT DONE**: the Controls sheet on iPhone Safari in both orientations; every control's feel on a real phone; a real trackpad for Cursor, One finger + keys, Flow and Captured; keys 1 to 8 on a real Mac; a second finger tapping the Controls button while a first finger holds flight (Chrome emulation would not open the sheet; iOS may behave the same, and if it does the button should open on pointerdown); leaving pointer lock on a real Mac when a control is picked (headless Chrome holds no lock, so only a unit test drives that path); voting against a real Upstash database. Emulation is not device validation, and none of these feel judgments has been made.
- **Not public yet**: the vote needs Garo's Vercel steps (Upstash, optional `VOTE_SALT`, the Firewall rule, a redeploy) before the link is shared. They are listed in [voting.md](voting.md).
- **Hidden on purpose**: the start-card note on very short landscape screens.
