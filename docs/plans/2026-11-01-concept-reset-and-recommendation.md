# Concept Reset & Strategic Recommendation (2026-11-01)

## 1. Audience, Purpose & Core Feeling
- **Who it is for:** A player on iPhone Safari (portrait or landscape) or a Mac trackpad opening a link for an immediate, tactile flight session.
- **What they should feel & discover:** Weightless momentum, carving turns through 3D space, skimming close to terrain/structures to build speed, and the satisfaction of mastering flight with a single thumb, cursor, or drawn gesture.
- **Core Rule:** Nothing may ever trap the player on a static platform, clutter the screen with multi-row button decks, or slow/clamp flight steering.

---

## 2. Accepted vs. Rejected vs. Open Record

### Accepted (Proven & Preserved)
- **One-Finger Phone Flight & Free-Cursor Trackpad Cruise:** Rate-controlled one-thumb flight on mobile (`classic`) and click-to-cruise pointer steering on desktop (`free`), where the entire screen is the flight surface (`docs/DECISIONS.md` #48, #54, #62).
- **10-Control Lab & Head-to-Head Public Vote:** Instant switching between Classic, Twin-Stick, Cursor, Flow, Draw (3D path/helix drawing), Conduct, and Brush, paired with the `Which way of flying felt best?` ballot.
- **21-Bone Procedural Flight Rig + Articulated Wings + Soft Limit-Escape:** Facing-invariant turn banking (`suitRoll.ts`), speed-tiered poses (`flightClips.ts`), feathered wing aerodynamics (`FeatherWings.tsx`), and automatic wall/hill/ceiling turn-away (`limitSteer.ts`).
- **Minimal 44px Single-Row Header:** Altitude/telemetry pill on top-left, Controls + Pause on top-right, and one passive hint slot (`docs/DECISIONS.md` #63–67).

### Rejected (Retired Concepts — Do Not Re-Skin)
- **Isometric 2.5D Turn-Based / Prototype Lab Boss Duel (`GowArena`, `GowHud`):** Rejected 2026-11-01. Sidelined the 3D flight engine in favor of a cramped 20m circle and a bottom card deck.
- **Grounded Hack-and-Slash Melee (`GowWarrior`):** Clashed with the flight physics and camera boom.
- **Flight-Clamping Shooter Mechanics:** Any combat that slows airspeed or applies look-friction (`docs/DECISIONS.md` #54).
- **Heavy Narrative Lore Frames (2033 Ruined City & 1 Enoch Semjaza Boss):** Over-determined the tone without serving the core act of flying.

### Open (The Decision Before Us)
- What **world identity** and **concrete action $\rightarrow$ result loop** best serves our 3D flight engine?

---

## 3. Three Meaningfully Different Approaches (Action $\rightarrow$ Result)

### Approach A (Recommended): **Sky-Currents & Wind-Gate Awakening (Pure Aerial Flow, *Journey* / *Superflight* / *Sky* Spirit)**
- **Setting & Story:** A silent, sunlit high-altitude archipelago of ancient wind-monoliths, canyon arches, and floating cloud-sanctuaries (*zero combat, zero lore dumps—pure mythic-architectural atmosphere*).
- **What the Player Does (Action) $\rightarrow$ What Results:**
  1. **Skim Terrain & Thread Arches (Near-Miss Boost):** Diving close along mountain ridges, skimming water, or threading through stone arches builds **Resonance / Airspeed Surge** (visual wing-trail flare + harmonic wind chord + speed boost).
  2. **Awaken Wind-Rings & Thermal Spires:** Flying through dormant sky-rings or canyon gates ignites them in gold/cyan light, opening upward **Thermal Wind Geysers** that launch you 80m higher into the upper cloud deck and awaken the archipelago skyward.
  3. **Seamless Control-Lab Playground:** Every control mode (One-Finger, Trackpad Flow, Draw-a-Helix, Brush-Whirl) has natural physical targets—arches to thread, thermals to ride, and rings to chain.

### Approach B: **High-Speed Aerial Interceptor (Tap-to-Lock Sky Dogfighting, *Panzer Dragoon* / *Rez* Spirit)**
- **Setting & Story:** High-altitude sky-patrol over a flooded megalithic bay where autonomous sky-constructs weave through the canyons.
- **What the Player Does (Action) $\rightarrow$ What Results:**
  1. **Unrestricted Flight First:** You fly at full speed (`8–34 m/s`) with zero speed caps or look friction.
  2. **Tap / Sweep to Lock & Release Homing Volley:** Tapping targets on mobile (or sweeping the cursor across them on desktop) paints lock-on reticles and fires homing arc-streaks (`tapBlast.ts` / `Shooter.tsx`) that shatter airborne targets in harmonic chains while you keep banking at full speed.

### Approach C: **Living Gesture & Wind Canvas (Expressive Aerial Choreography, *Flower* / *Okami* Spirit)**
- **Setting & Story:** You are the wind itself (or a winged spirit) restoring color and motion to a frozen mountain valley.
- **What the Player Does (Action) $\rightarrow$ What Results:**
  1. **Flight Path Paints the World:** Wherever you bank, loop, or dive, your wake leaves persistent 3D ribbon currents in the air and awakens dormant cedar groves, village lanterns, and stone shrines below as you pass within 15m of them.
  2. **Gesture Maneuvers Trigger World Blooms:** Drawing a loop (`Draw`), whirling (`Brush`), or diving into a flare sends a radial wind-wave across the terrain that lights up the valley sector by sector.
