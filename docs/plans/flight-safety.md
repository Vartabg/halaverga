# Composed flight and district navigation

User feedback: the character shakes at speed and movement can enter places that trap the player. Replace event-driven banking with a composed launch/cruise/braking pose, align suit and camera to a shared interpolated physics position, and preserve one camera owner.

The navigable district will have deliberate exterior building volumes, an explicit perimeter and ceiling, advance clearance checks, contact-corrected velocity, checked landing paths and validated checkpoints. Interiors are outside this first milestone. Keep the boulevard, viaduct opening and marked roofs reachable. Show an unobtrusive suit clearance cue when assistance intervenes.

Verify on real Rapier geometry: full-speed wall/roof contact, tangential sliding, perimeter corners, entering broken building facades, departure after blocking, valid/invalid checkpoints, complete route clearance and landing. Validate animation convergence and camera/suit synchronization at multiple render rates. Run the existing keyboard, one-thumb, recovery and accessibility browser regressions, then inspect rendered motion and deploy the revised playtest. Muse independently reviews geometry risks; Codex verifies its recommendations.

The current phone is Safari, as corrected by the user. Browser emulation does not constitute physical iPhone verification or a claim of AAA production quality.
