# Flight study decisions

- One-thumb flight remains the primary touch input. Release brakes to hover; the separate Surge button stays removed.
- A second scene contact selects left movement/right view automatically. Roles are assigned by horizontal position, then retained by pointer identity. Both anchors reset on handoff; releasing either thumb returns to neutral one-thumb control until the remaining contact slides. Ground takeoff requires movement, so looking with two neutral contacts does not launch the suit.
- Only the active flight surface owns multi-touch browser gestures. Native page pinch zoom remains available after pausing and in the guide. Cancellation, a third scene contact, pause and rotation clear movement; a third-contact interruption requires all contacts to lift before restarting.
- Suit and camera share Rapier's interpolated presentation anchor. Visual banking follows travel direction, independently of pointer-event sampling.
- This district supports exterior exploration. Building collision volumes follow the full lower shell and stepped broken roof; upper-story voids are not playable interiors.
- Collision safety combines advance shape casts, stopping-distance limits, contact-normal velocity correction, final kinematic sweeps and physical perimeter colliders. Assisted landing requires support, clearance and a clear approach.
- Invalid saved positions recover to a checked landing. The user confirmed Safari for the current phone playtest; Chrome remains supported.
