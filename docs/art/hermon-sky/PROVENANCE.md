# Hermon dawn art: provenance

All art in this folder's scope comes from Poly Haven (https://polyhaven.com), downloaded through its public API
(`api.polyhaven.com`) on 2026-11-16. Poly Haven licenses every asset CC0 (public domain): https://polyhaven.com/license
(the API returns no per-asset licence field). Each asset's own page was also fetched on 2026-11-16 and states it:
https://polyhaven.com/a/kiara_1_dawn, https://polyhaven.com/a/cliff_side and https://polyhaven.com/a/snow_02 each carry the line
"CC0 1.0 Universal - public domain dedication, no attribution required". The player approved
downloading free CC0 art from Poly Haven only. Raw downloads were kept outside the repo and never executed.

| Asset | Page | File downloaded | Size | Used for |
|---|---|---|---|---|
| Kiara 1 Dawn (Greg Zaal), HDRI | https://polyhaven.com/a/kiara_1_dawn | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/kiara_1_dawn_4k.hdr | 25,413,182 B | sky and distant range |
| Cliff Side (James Ray Cock, Jenelle van Heerden, Dario Barresi), texture | https://polyhaven.com/a/cliff_side | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cliff_side/cliff_side_diff_1k.jpg | 859,756 B | layered limestone-like rock, diffuse only |
| Snow 02 (Rob Tuytel), texture | https://polyhaven.com/a/snow_02 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_diff_1k.jpg | 325,497 B | snow, diffuse only |

Candidate HDRIs were judged from Poly Haven's small preview thumbnails (about 400 KB each, not kept). Total downloaded for
use: about 26.6 MB.

## What ships and how it was made

- `public/textures/sky/hermon-dawn.jpg` (2048x1024 equirect JPEG, quality 85): made by `scripts/art/paint_hermon_sky.py`
  (Blender 4.0.2, headless; the raw HDRI path is its argument). Steps: exposure and filmic tone map, a dawn grade, zenith
  deepened toward the palette's violet-blue, the low sky and the whole lower hemisphere faded to the constant HAZE `#d6c2d0`
  (the fog colour; its rust-red far range is graded to lavender-grey), Kuwahara filter (anisotropic) in the compositor, sparse fading stars added. "Painted" means a painterly
  filter over a real photograph, not a hand painting.
- `src/world/backdropData.ts`: the sun's position in the image, written by the same script.
- `public/textures/terrain/limestone-cliff.jpg` and `snow.jpg`: the 1k diffuse maps, re-encoded smaller (no other change).
- The raw HDRI is not in the repo.
- The scene draws the backdrop as a sky sphere that follows the camera, and builds its environment light from a 256x128 copy.
