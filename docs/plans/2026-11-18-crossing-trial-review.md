# Crossing trial review

November 18, 2026 · baseline edfb283 · plan revisions 1 and 2

A fresh-context reviewer examined the proposed interception, the flight tuning, lock range, route markers and arch geometry. The initial concept allowed the existing 70 m strike to cover almost the entire distance from liftoff to the crossing. I verified the 69.9 m distance. Revision 2 starts the player farther south and limits assistance to the last part of the interception.

The implementation review identified three questions for the playable pass.

- Compare the remaining time to strike after a missed dive with the opening reached by staying high. A dive that yields both easy attempts would give the player little reason to choose.
- Allow a thumb time to release when the target enters reach. Exercise an early release, an in-range release and a canceled touch. A held key or canceled drag must not strike automatically.
- Stand the travelers on the actual arch surface. At the center it is about 14.15 m above the water datum. Frame their first steps after a success and a miss, including in portrait. The old navigation marker is below the span.

## What happened in play

In the flight simulation, a left dive opened a 1.50 s strike window roughly four seconds into the run. Holding the high right line opened a 1.28 s window nearer the arch. After flying out of the low opening, an immediate climb toward the high one still missed by more than 20 m. Flying straight and repeatedly striking let the Watcher reach the travelers at 8.1 s.

On the rendered page, a keyboard dive and a one-thumb high approach both turned the Watcher away. A portrait run initially lost sight of it. A small bearing arrow now follows the Watcher out to the screen edge while terrain still hides it behind rock. In the successful ending, the travelers walked the span and reached the far bank. In the missed ending, they turned and walked back.

Chrome and desktop WebKit exercised the production build in phone-sized layouts. Automated accessibility checks covered the opening and pause. Safari on an iPhone 18 Pro simulator also reached both endings and replayed with native touch in portrait and landscape. Physical iPhone performance and an unguided player's reaction remain open.

The production build passed its landing-page size budget at 628.2 KB. All 2,812 unit tests passed, including the movement suite. The seven browser checks for the crossing and eleven existing flight, gorge and accessibility checks all passed.

The first human playtest is simple. Let someone fly without coaching. After their first ending, see whether they choose another run and what they want to try differently. That decision will tell us more about expanding the encounter than the number of successful interceptions.
