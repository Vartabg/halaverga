# Hermon dawn art and elevation sources

## Terrain maps

The two 1k diffuse maps ship as `public/textures/terrain/limestone-cliff.jpg` and `snow.jpg`. They were downloaded through `api.polyhaven.com` on 2026-11-16 and re-encoded as smaller JPEGs. Both are [CC0 1.0](https://polyhaven.com/license).

- [Cliff Side](https://polyhaven.com/a/cliff_side), by James Ray Cock, Jenelle van Heerden and Dario Barresi. [Original diffuse map](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cliff_side/cliff_side_diff_1k.jpg).
- [Snow 02](https://polyhaven.com/a/snow_02), by Rob Tuytel. [Original diffuse map](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_diff_1k.jpg).

The prior sky used [Kiara 1 Dawn](https://polyhaven.com/a/kiara_1_dawn) by Greg Zaal. The new backdrop is generated in the scene. The [Mount Hermon Nature Reserve landscape photographs](https://mounthermonreserve.org/archives/769) informed its palette and the appearance of the snow and exposed limestone.

## Regional relief

SRTM data courtesy of the U.S. Geological Survey. The region's elevation samples come from [Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) in the Skadi format. See the [Tilezen attribution guidance](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Source tiles fetched 2026-11-17:

| 3601 × 3601 height grid | SHA-256 of the gzip file |
| --- | --- |
| [N33E035.hgt.gz](https://elevation-tiles-prod.s3.amazonaws.com/skadi/N33/N33E035.hgt.gz) | `0fa1708320d25ebc6b0ee7041892d40746071b983e68f774f715d70c90adac57` |
| [N33E036.hgt.gz](https://elevation-tiles-prod.s3.amazonaws.com/skadi/N33/N33E036.hgt.gz) | `76b26a3a890fa7411029b1916ba196af1a06a915fa86f9b823284ae34451dadd` |

Put both files in a local directory and run `python3 scripts/art/build_hermon_relief.py /path/to/tiles` from the repo. The script bilinearly samples both grids around the shoulder at 33.4056° N, 35.8519° E, with x increasing east and z increasing south. It rounds heights to signed 16-bit relative metres above a 2,536 m reference and encodes them in `src/world/hermonRelief.json`. The runtime joins the measured ridges to the authored play area over 780 m. The checked-in samples are sufficient to render the region offline. The flight routes, collision shape and water inside the perimeter come from the game.
