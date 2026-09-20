# Reclaimed boulevard · environment benchmark

Art direction agreed with Garo, 19 September 2026. Implement one convincing
playable view before expanding the treatment to the whole district.

## The picture

An elevated highway has ruptured across a flooded modern boulevard. Trees rise
through exposed office floors; vines descend from broken ledges. Warm afternoon
sun catches pale fractured concrete and yellow-green leaves above cool, blue-green
water. The open water leads the eye and the player beneath the highway toward a
taller ruined office building. Nature has occupied the city for eighty years.

This remains the fictional modern hillside city destroyed in 2033 and visited in
2113. The original restrained-vegetation direction in first-flight.md is superseded
by this user-approved lush reclamation benchmark. Flight controls, character,
cameras, arrival terrace and marked roof remain part of the playable contract.

## Reference hierarchy

| Reference | What we take from it |
| --- | --- |
| [The Last of Us Part II](https://www.playstation.com/en-gb/games/the-last-of-us-part-ii/) | Recognizable modern structures, exposed floors, traces of ordinary life and damage that changes silhouettes. |
| [Horizon Forbidden West](https://blog.playstation.com/2021/05/27/14-minutes-of-new-gameplay-for-horizon-forbidden-west/) | Warm/cool separation, coastal water, lush vegetation and a legible landmark. |
| [Houtouwan](https://www.si.edu/object/abandoned-chinese-village-nature-reclaimed%3Ayt_QaJO50M1Ptk) | Vegetation anchored to roofs, crevices and terraces; uneven coverage of hillside buildings. A real abandoned village, not an apocalypse. |

Reference images inform composition and material relationships; no game assets
are extracted or copied. Licensed source assets and derivative processing are
recorded separately.

## Acceptance and rejection

- From the normal arrival/flight camera, water provides a clear route and the
  broken highway is a readable landmark. Test desktop and portrait framing.
- Architecture still reads as damaged modern offices and transport infrastructure.
  Fractures, exposed structure and debris interrupt repeated rectangular masses.
- Vegetation has branches, varied silhouettes and leaf detail. Trees, shrubs and
  hanging growth occupy plausible surfaces and leave the route readable.
- Concrete has surface variation at human scale. Warm highlights, cool shaded
  recesses and atmospheric depth separate foreground, landmark and skyline.
- Reject cube-shaped trees, uninterrupted identical towers, uniformly green
  facades, flat light, arbitrary plants suspended in space, or a cinematic picture
  that the playable camera cannot reproduce.

## Review method

Capture the same arrival camera at 1440×1000 and 393×852 before and after, plus an
actual flight approach. Review composition first, then silhouette, materials and
vegetation. Fix visible failures internally before requesting the user's reaction.
The benchmark establishes direction; it does not certify AAA production quality.

Budget for this browser proof: at most 600,000 submitted triangles and 45 draw
calls in the sampled route, at most 10 MB of added runtime assets, default DPR
1–1.5. Measure desktop frame times and retain a low-quality tier. Physical iPhone
Safari performance and touch enjoyment require a real device session.

Existing building interiors are exterior-only collision volumes. Decorative
plants do not create new navigable interiors. Keep the established terrace,
underpass and roof route clear, and run the collision/landing tests.

## Reproduce the assets and review

Run these from the task checkout. Downloads go to a disposable cache outside the
repository and are checked against provider MD5 and recorded SHA-256 hashes.

```sh
python3 scripts/environment/fetch-assets.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/environment/prepare-assets.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/environment/bake-ivy.py
node scripts/environment/prepare-textures.mjs
```

Blender 4.0.2 was used for the derivatives. The tree source is separated by
material, its trunk/branches decimated, and 7,200 complete leaves sampled with
enlargement to retain canopy coverage. The plant source contains nine specimens;
its unlit RGBA bake is used as a nine-cell atlas in clustered, crossed leaf cards.
All derivative inputs are CC0; see sources.json and asset-processing.json.

For a running production server:

```sh
PLAYTEST_URL=http://127.0.0.1:3476 REVIEW_OUTPUT=/tmp/halaverga-environment-review node scripts/review-environment.mjs
PLAYTEST_URL=http://127.0.0.1:3476 PROFILE_OUTPUT=/tmp/halaverga-environment-profile PROFILE_SECONDS=300 node scripts/profile.mjs
```

The public review page is `/docs/art/reclaimed-boulevard/index.html`. Captures
use the real controls and camera, starting from a fresh browser context. The
before images are from c9ab444. Current runtime source and asset hashes are in
verified-inputs.json; review findings and dispositions are in REVIEW.md.
