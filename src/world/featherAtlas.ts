// Procedural feather atlas (original, generated at load). Five feather kinds side by side, base at v=0, tip at v=1, the narrow
// outer vane on the left (u=0) of each column and the rachis at RACHIS[kind]:
//   0 emarginated outer primary (notched inner vane), 1 primary, 2 secondary (blunt notched tip), 3 covert (rounded), 4 marginal.
// colour: barb lines, a bright rachis and a darker downy base, as luminance; alpha: the vane outline with frayed barb tips and a
// few splits. normal: barbs as fine ridges angled toward the tip, the rachis as a raised spine. Alpha-tested, never blended.
import { DataTexture, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace } from 'three';

export const KINDS = 5, COLUMN = 128, HEIGHT = 512;
export const FEATHER = { emarginated: 0, primary: 1, secondary: 2, covert: 3, marginal: 4 } as const;
/** Rachis position across each column (0 = outer edge). Flight feathers are strongly asymmetric; coverts nearly symmetric. */
export const RACHIS = [.3, .34, .42, .48, .5] as const;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Half-widths (0..1 of the vane's available side) of the outer and inner vanes at height v. */
function vanes(kind: number, v: number): [outer: number, inner: number] {
  const base = smooth(0, .12, v);
  if (kind <= 1) {
    const tip = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, v - .72) / .28, 2)));
    const notch = kind === 0 ? 1 - .42 * smooth(.48, .6, v) * (1 - smooth(.62, .7, v)) - .3 * smooth(.6, .72, v) : 1;
    return [(.35 + .65 * base) * (.82 + .18 * (1 - v)) * tip, (.3 + .7 * base) * notch * tip];
  }
  if (kind === 2) {
    const tip = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, v - .8) / .2, 2)));
    return [(.4 + .6 * base) * tip, (.35 + .65 * base) * tip];
  }
  const round = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, v - (kind === 3 ? .5 : .35)) / (kind === 3 ? .5 : .65), 2)));
  return [(.55 + .45 * base) * round, (.55 + .45 * base) * round];
}

export function featherAtlas() {
  const width = COLUMN * KINDS, colour = new Uint8Array(width * HEIGHT * 4), normal = new Uint8Array(width * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < width; x++) {
    const kind = Math.floor(x / COLUMN), u = (x % COLUMN + .5) / COLUMN, v = (y + .5) / HEIGHT, r0 = RACHIS[kind];
    const outer = u < r0, side = outer ? (r0 - u) / r0 : (u - r0) / (1 - r0), [vo, vi] = vanes(kind, v), half = outer ? vo : vi;
    // Barbs run from the rachis toward the tip at ~35-55 degrees; their spacing sets ridge, fray and split patterns.
    const slope = (outer ? .9 : .7) * (kind >= 3 ? .8 : 1), barb = (v * 150 - side * slope * 34) * (kind >= 3 ? .7 : 1);
    const ridge = Math.sin(barb * Math.PI * 2), barbId = Math.floor(barb);
    const fray = .045 * (hash(barbId, kind) - .5) + .035 * Math.max(0, ridge) * smooth(.75, 1, side / Math.max(half, 1e-3));
    const split = hash(Math.floor(barb / 3), kind * 7 + (outer ? 1 : 2)) > .93 && side > .25 && v > .2 ? smooth(.5, .9, Math.abs(Math.sin(barb * Math.PI))) : 1;
    const edge = half - fray;
    const down = 1 - smooth(.02, .16, v); // the downy base: soft, irregular, half covered by the next layer anyway
    // A soft edge ramp, so alpha-to-coverage feathers the outline instead of cutting it.
    let alpha = smooth(edge + .01, edge - .07, side) * split;
    if (down > 0 && hash(x * 3, y * 5) < down * .55) alpha *= .2;
    const rachis = Math.max(0, 1 - Math.abs(u - r0) * COLUMN / (2.2 - 1.4 * v)) * (v < .985 ? 1 : 0);
    alpha = Math.max(alpha, rachis > .2 ? 1 : 0);
    const lum = (.86 + .028 * ridge * (1 - rachis) + .03 * (hash(barbId, 11) - .5)) * (.72 + .28 * smooth(0, .35, v)) + .12 * rachis - .05 * hash(barbId, 3);
    const o = (y * width + x) * 4, l = Math.round(255 * Math.min(1, lum));
    colour[o] = l; colour[o + 1] = l; colour[o + 2] = Math.round(l * .985); colour[o + 3] = Math.round(255 * alpha);
    // Tangent-space normal: barb ridges tilt across the vane, the rachis bulges, and each vane arches slightly.
    const nx = (outer ? 1 : -1) * ((.06 + .05 * hash(barbId, 5)) * ridge * slope + .5 * rachis * Math.sign(r0 - u) + .12 * (1 - side)), ny = .1 * ridge;
    const nz = Math.sqrt(Math.max(.05, 1 - nx * nx - ny * ny));
    normal[o] = Math.round(128 + 127 * nx); normal[o + 1] = Math.round(128 + 127 * ny); normal[o + 2] = Math.round(128 + 127 * nz); normal[o + 3] = 255;
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new DataTexture(data, width, HEIGHT, RGBAFormat); t.wrapS = ClampToEdgeWrapping; t.wrapT = RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4; if (srgb) t.colorSpace = SRGBColorSpace; t.needsUpdate = true;
    return t;
  };
  return { colour: make(colour, true), normal: make(normal, false) };
}
/** Atlas u for a card's lateral coordinate s in [0,1] (outer edge to inner edge) of feather kind k. */
export const atlasU = (kind: number, s: number) => (kind + .02 + .96 * s) / KINDS;
