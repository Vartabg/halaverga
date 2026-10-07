# Leaving the pause card · 2026-10-07

Garo: "why cant just clicking the cursor outside of the menu allow for an exit out of it?"

Why it did not: the pause card had no backdrop. A click outside landed on the game world, which ignores clicks while paused, and
Resume was a deliberate button press because that press is also the activation gesture (it unlocks blaster audio and refuses while
the page is pinch-zoomed). Those checks can run on an outside click just as well.

## As built

- `PauseCard.tsx` renders an invisible scrim (`.pauseScrim`, the card's own layer, before the card in DOM order) under the pause
  card; a click or tap on it calls the same `onEnter` as Resume. "Leave the game?" keeps its two buttons only. The scrim also keeps a
  paused tap off the flight surface and the play controls.
- Escape toggles: `useInput` pauses on Escape only while playing; while the card shows, the card's own listener resumes.
- `tests/pause-dismiss.spec.ts`: desktop click outside and Escape both ways; a phone tap outside (a real touch through CDP).
