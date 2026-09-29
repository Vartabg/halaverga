# Approved first flight

Build one fictional flooded modern hillside district, catastrophe 2033 and arrival 2113. Connect a damaged terrace, water corridor, collapsed elevated roadway and tower roof. Render modern concrete, glass, exposed structural frames, rooftop equipment, damaged cars, road markings and restrained vegetation with violet shadows, teal water and warm architectural accents.

Next.js, TypeScript, R3F/Three.js WebGL2, Rapier, CSS Modules and Zustand. Implement walking, lift, assisted flight, toggle surge, water skimming, hover and cancellable assisted landing. Shared desktop/touch intent; one stable first/third-person camera controller. Phone has move/look regions and two actions. Desktop WASD/mouse, Space lift/land, Shift surge, keyboard view controls, Escape pause.

One local, clearly fictional terminal record and location identifier. Persist settings and safe checkpoint. HTML instructions, textual route/discovery alternative, keyboard access, reduced motion, loading/error/context-loss recovery. Pause when hidden; preserve position and clear touches on orientation change.

Muse independently reviews movement; Gemini independently reviews rendering. Codex integrates, tests, commits and pushes through task-lifecycle. Dedicated Vercel playtest URL and QR, previous deployment URLs retained. Target 60 fps on iPhone 15-class Safari with stable 30 fps fallback; record actual device and p50/p95/stalls over five minutes. Validate collisions, landing cancellation, rotation, pause/resume, keyboard, VoiceOver, zoom, reduced motion and contrast. Physical iPhone performance and player enjoyment require the user's real-device playtest; never claim emulator results satisfy them.

## User correction · 2026-09-11

The user uses Chrome on their phone. Chrome on iPhone is now the primary mobile review target. The original split controls and Surge button above are superseded by [the one-thumb control revision](thumb-controls.md).

The user subsequently confirmed that the observed phone session was Safari. Safari is the current device-review target; Chrome remains supported.

## Desktop controls · 2026-09-24

Garo reported the desktop controls broken after the suit blaster work and asked for the ones he had before the gun. The desktop default is the free-cursor trackpad from 7945430 again: click the open scene to lift and cruise, move the pointer to steer, hold near an edge to keep turning, two-finger scroll changes speed, click again to brake and hover, drag while hovering to look, aim at a flat surface and click Land; WASD/arrows/R/F/Space/Shift/Escape/E on the keyboard. The one change for shooting, blaster on: while hovering or on the ground a click fires and a drag looks, so W or Space starts flying (Space from the ground). Phone twin-stick controls stayed touch-only until 2026-09-26 (below). Details: [DECISIONS.md](../DECISIONS.md) and [the shooter plan](2026-09-22-shooter.md#controls).

## Turning · 2026-09-25

Garo: "a problem i'm having is doing a 360 deg turn with the character when flying. also there needs to be an easier way to switch between different methods in lab. also is there a way to get feedback from public by putting this out and having a poll or vote?" The 360 was hard in every mode: Phone Standard (one look swipe turned less than half a circle), Desktop Standard (the edge-hold turn faded and stopped), Lab Draw and Conduct (no way to wrap all the way round) and Lab Brush (each stroke carved only part of a turn).

- **Phone Standard** (twin sticks, the default until 2026-09-26; now the opt-in Two thumbs): look acceleration is on by default, so a fast swipe turns further (a 350 px swipe in 200 ms turns about 270°, was 104°) while slow aiming is unchanged. A thumb that arrives fast at the outer edge, or at the other band (a thin strip on the stick-zone line in landscape, the opposite screen edge in portrait), and rests there keeps turning (two bands, so left and right both work); a flick that stops mid-pad never does (review 2026-09-25). On a narrow portrait phone fast swipes turn further again (the extra gain scales with 700 px / width). One-thumb: a thumb near the edge keeps turning (at 3.5 rad/s until 2026-09-26; main's 1.5 rad/s since).
- **Desktop Standard**: the edge hold keeps turning for as long as it is held. Hovering the header keeps the cruise going but holds the view still (the lab bar and the header buttons sit inside the top edge band, review 2026-09-25), a side exit from the window keeps turning for up to 6 s, and a top or bottom exit flies straight after 1 s.
- **Conduct**: a finger in the outer 10% turns at up to 4.2 rad/s (about 1.6 s per 360) and wraps without limit; the centre stays precise.
- **Draw**: draw a circle to turn around; a spring drawn upward climbs as it turns.
- **Brush**: a big loop (radius 70 px or more) is a whirl that spins you round (360 in about 1.3 s), even around drones, and its ink turns pink before release; same-direction swipes stack into one turn (240 px is a full swipe, so four make 360 in any orientation).
- Travel follows fast view turns (carve), so the hero does not skid sideways after a quick turn. The body banks a little more into fast turns.
- Reduced motion: every rate-driven turn stays at 2.5 rad/s or less, bank and the whirl spin are off, and look acceleration is off. Direct drags follow the finger 1:1.
- **Lab switcher**: a one-tap Standard · Draw · Conduct · Brush bar at the top of the screen during play, plus keys 1-4 on a desktop. It never pauses. The pause card and Flight settings keep the full picker and the rating.
- **Public feedback**: an anonymous in-game vote card after trying styles (favorite plus optional 1-5 ratings), with results at `/results`. See [voting.md](../voting.md).
- Measured 360 times (node math on the real modules, `tests/turn-360.test.ts`): twin 0.75 s landscape and about 1.1 s portrait, one thumb 1.80 s (until 2026-09-26; main's 4.19 s from the rest since, 3.5 s after a slide to the edge), desktop 1.47 s, Conduct 1.62 s, Brush whirl 1.30 s and four stacked swipes 2.07 s, Draw 1.70 s once the hero reaches the circle (3.3-3.6 s from pen-down, because the first 150° of the line fly as before). None of this has been felt on the iPhone, a Mac trackpad or a windowed browser yet. Snap turns are not built; they are a follow-up that needs Garo on the device.

## One-finger flight back · 2026-09-26

Garo's post-mortem: the one-finger flight from the start was the part he liked; the shooting and the drones made it "go haywire" and he got "stuck and can't turn back around". His decision: "bring back one-finger flight as the phone default, with shooting as tap-a-drone on top, and remove the friction and speed cap from flight". One change for him to judge on his iPhone:

- **Phone Standard** is main 7945430's one thumb again (controls version 6; Two thumbs is the opt-in): hold to lift and cruise, slide to aim, drag farther for speed, hold near an edge to keep turning at 1.5 rad/s (about 4.2 s per 360), release to hover; a second contact is left move / right look. Verified against 7945430 and the drift restored (edge zone, rate, no slew, no carve, no Fire owner).
- **Tap a drone to blast** (the Lab's pick and aimed 3-shot burst): a quick tap, a second finger's tap while flying; empty space does nothing. No Fire or Aim button, no auto-fire, no crosshair on classic touch.
- **Shooting is out of the flight path on every device**: no look friction (only the ADS zoom gain), no hip-fire speed cap; ADS hover stays for a held Q.
- Desktop is unchanged from the 2026-09-24 restore. Details: [DECISIONS.md](../DECISIONS.md), [touch-controls.md](../touch-controls.md).
