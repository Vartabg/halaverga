# Archangel character design

In the Hermon playtest, players see the archangel mostly from behind at laptop and phone sizes. They should be able to pick out their own character immediately against snow and distinguish him from the bronze-and-oxblood Watchers as he takes off and strikes.

The approved setting remains Mount Hermon at dawn, with the descent in 1 Enoch 6 as the premise for a fictional fight. The established body has olive skin, realistic proportions, a halo and pale feathered wings. The opening screenshot showed the plain pale garment merging with the folded wings and snow. The user rejected that generic appearance. Garment details and wing markings are open design choices.

## Direction

- A woven fighting garment has a recognizable silhouette on takeoff and gives the player a visual counterpart to the Watchers' armor. Use a fitted one-shoulder indigo chiton, staggered split panels, flax-colored borders, a warm bronze-colored fastening and a leather guard on the free arm. Pale coverts give way to blue-gray flight feathers, visible both folded and spread. Keep bronze and ivory as accents.
- A heavier armored figure would change the upper-body outline, but repeats the Watchers' silhouette and encroaches on the wing roots. A long mantle would be legible from behind, but would hide the legs and require cloth motion through turns and strikes. Use the woven garment and plumage direction.

## Implementation and evidence

- Reuse the baked body's weighted shell, split skirt and texture palette in `scripts/real_bodies`. Derive hidden skin from the same coverage test as the asymmetric shell. Shape the neckline and panel lengths for the archangel. Pack the trim, guard and fastening with the chiton and sandals, retaining the material name used by the hem-motion shader. A dedicated UV row limits sway to the skirt panels. The left guard leaves the game's right forearm cannon mount free.
- Paint the distal flight feathers in their existing vertex colors with strength tapered across adjacent feathers. Opt in when building the player wing. Keep bone axes, hinge poses, span, silhouette and two skinned wing draws. Compare the coarse Watcher colors to the base.
- Regenerate `public/models/archangel.glb` with the approved local Blender sources, record the new asset metadata and garment authorship, and check that the Watcher GLB and the archangel's animation and joint contracts match the baseline. Retain four archangel body materials, 1024 px texture limit and the existing first-load and combined GLB budgets.
- Compare matched chase frames at laptop, phone portrait and short landscape sizes. Below or beside the folded wings, the garment should show as an indigo area with a visible hem. The blue-gray feather band should read on the ground and in flight. Check the shoulder, straps and wing roots in three-quarter view, leg clearance and slit opening through takeoff and a deep strike, and sandal contact after landing. Run the asset, grounding, wing, flight and sword checks and the standard verify gate.

The local playtest includes the terrace and entry framing from `849b2ad`. The character patch is based on main at `edfb283`, so it can be integrated independently of the entry work.
