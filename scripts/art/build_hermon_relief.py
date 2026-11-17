#!/usr/bin/env python3
"""Sample two local Mapzen Skadi tiles into the Hermon perimeter mesh's height rows."""

import argparse
import base64
import gzip
import json
import math
from pathlib import Path
import struct

ORIGIN = (33.4056, 35.8519)  # latitude, longitude of the shoulder, south of the summit
BOUNDS = (-420, 420, -430, 300)  # min x, max x, min z, max z in metres
SPACING = 5
REACH = 38000
SIDE = 3601
NORTH_METRES = 111200
EAST_METRES = NORTH_METRES * math.cos(math.radians(ORIGIN[0]))
OUTPUT = Path(__file__).resolve().parents[2] / "src/world/hermonRelief.json"


def elevation(tiles, lat, lon):
    """Bilinear sample of the surrounding signed, big-endian SRTM heights."""
    south, west = math.floor(lat), math.floor(lon)
    name = f"N{south:02d}E{west:03d}"
    tile = tiles[name]
    row = (south + 1 - lat) * (SIDE - 1)
    col = (lon - west) * (SIDE - 1)
    r0, c0 = min(SIDE - 2, math.floor(row)), min(SIDE - 2, math.floor(col))
    samples = [
        struct.unpack_from(">h", tile, 2 * (r * SIDE + c))[0]
        for r in (r0, r0 + 1) for c in (c0, c0 + 1)
    ]
    if -32768 in samples:
        raise ValueError(f"No elevation for {lat:.6f}, {lon:.6f} in {name}")
    a, b, c, d = samples
    u, v = col - c0, row - r0
    return ((1 - u) * a + u * b) * (1 - v) + ((1 - u) * c + u * d) * v


def rows():
    """Keep the near ridges close to the DEM's resolution, then thin the distant rings."""
    def spacing(distance):
        return round(25 + distance * .04 + max(0, distance - 2600) * .055)

    cuts = [(0, SPACING), (14, 11), (30, 20)]
    d = 52
    while d < REACH:
        step = spacing(d)
        cuts.append((d, step))
        d += step
    cuts.append((REACH, spacing(REACH)))
    x0, x1, z0, z1 = BOUNDS
    return [(d, math.ceil((x1 - x0 + 2 * d) / s), math.ceil((z1 - z0 + 2 * d) / s))
            for d, s in cuts]


def perimeter(distance, width, depth):
    """Clockwise rectangle with one vertex per corner."""
    x0, x1, z0, z1 = BOUNDS
    outer = [(x0 - distance, z0 - distance), (x1 + distance, z0 - distance),
             (x1 + distance, z1 + distance), (x0 - distance, z1 + distance)]
    for side, (ax, az) in enumerate(outer):
        bx, bz = outer[(side + 1) % 4]
        count = width if side % 2 == 0 else depth
        for i in range(count):
            yield ax + (bx - ax) * i / count, az + (bz - az) * i / count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tile_directory", type=Path)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    tiles = {name: gzip.decompress((args.tile_directory / (name + ".hgt.gz")).read_bytes())
             for name in ("N33E035", "N33E036")}
    if any(len(tile) != 2 * SIDE ** 2 for tile in tiles.values()):
        raise ValueError(f"Expected {SIDE} by {SIDE} heights per tile.")
    datum = round(elevation(tiles, *ORIGIN)) - 50
    mesh_rows = rows()
    heights = [round(elevation(tiles, ORIGIN[0] - z / NORTH_METRES, ORIGIN[1] + x / EAST_METRES) - datum)
               for row in mesh_rows for x, z in perimeter(*row)]
    doc = {
        "origin": ORIGIN, "datum": datum, "bounds": BOUNDS, "spacing": SPACING,
        "rows": mesh_rows,
        "heights": base64.b64encode(struct.pack(f"<{len(heights)}h", *heights)).decode(),
    }
    args.output.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{len(heights)} elevation samples, datum {datum} m, range {min(heights)} to {max(heights)} m")


if __name__ == "__main__":
    main()
