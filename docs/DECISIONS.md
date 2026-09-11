# Flight study decisions

- One-thumb flight remains the primary touch input. Release brakes to hover; the separate Surge button stays removed.
- Suit and camera share Rapier's interpolated presentation anchor. Visual banking follows travel direction, independently of pointer-event sampling.
- This district supports exterior exploration. Building collision volumes follow the full lower shell and stepped broken roof; upper-story voids are not playable interiors.
- Collision safety combines advance shape casts, stopping-distance limits, contact-normal velocity correction, final kinematic sweeps and physical perimeter colliders. Assisted landing requires support, clearance and a clear approach.
- Invalid saved positions recover to a checked landing. The user confirmed Safari for the current phone playtest; Chrome remains supported.
