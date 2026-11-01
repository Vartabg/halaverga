/** One source of truth for the sun and the sky palette. Plain data and pure maths: no three, no DOM, so it stays in the lazy world
 * chunk and runs in Node tests. Import it only from src/world, never from src/game or src/ui (that would pull it into the landing
 * load). Colours are authored as display hex, the colour that appears on screen; the sky is drawn display-referred. */
export type Rgb = [number, number, number];
const decode = (v: number) => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
/** sRGB hex to linear rgb: the conversion three's Color applies. */
export function hexToLinear(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [decode((n >> 16 & 255) / 255), decode((n >> 8 & 255) / 255), decode((n & 255) / 255)];
}
/** A linear colour as a GLSL vec3 literal, and a hex colour as one. */
export const glslRgb = (c: Rgb) => `vec3(${c.map(v => v.toFixed(6)).join(', ')})`;
export const glslVec3 = (hex: string) => glslRgb(hexToLinear(hex));

/** The dawn sun over Mount Hermon (Garo, 2026-10-21: the Watchers' descent, 1 Enoch 6, at first light). The direction does not
 * move: the hero, arm cannon and FX are lit from here, and the dome's dawn glow, the key light and the environment glow all read
 * this direction. Low warm light, stars still fading overhead. */
export const SUN_POSITION: [number, number, number] = [-65, 100, 80];
const sunLength = Math.hypot(...SUN_POSITION);
export const SUN_DIRECTION: Rgb = [SUN_POSITION[0] / sunLength, SUN_POSITION[1] / sunLength, SUN_POSITION[2] / sunLength];
/** The dawn key light: warm first light, clear enough to read shapes on the summit. */
export const SUN_COLOR = '#ffd9a8';
export const SUN_INTENSITY = 1.7;
/** The dawn glow toward the risen sun, as q = 1 - cos(angle to the sun): a wide warm brightening, strongest at the horizon. */
export const SUN_GLOW = { color: '#f0b27a', rate: 7, weight: .42 };
/** Equirectangular centre of the sun (three's mapping: u = atan2(z, x) / 2pi + .5, v = asin(y) / pi + .5). */
export const SUN_UV: [number, number] = [Math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0]) / (2 * Math.PI) + .5, Math.asin(SUN_DIRECTION[1]) / Math.PI + .5];
const flat = Math.hypot(SUN_DIRECTION[0], SUN_DIRECTION[2]);
/** Unit horizontal direction toward the sun. */
export const SUN_XZ: [number, number] = [SUN_DIRECTION[0] / flat, SUN_DIRECTION[2] / flat];

/** HAZE is the one horizon colour: pale dawn mist over the plain below Hermon's summit. Sea far end, fog, dome at and below eye
 * level all land on it. It is the lightest thing in a frame on purpose, so the outer ranges stand against it as dark silhouettes. */
export const HAZE = '#d9bd97';
/** The dawn firmament from the horizon up: apricot first light, lavender-grey mid sky, deep violet-blue vault overhead where the
 * stars (the Watchers) are still fading. `warm` lifts the low sky toward the risen sun. */
export const SKY = { low: '#c99e72', mid: '#7f7fa3', zenith: '#1e2440', warm: '#f7c489' };
/** Dome elevation (dir.y) of the low and mid colour stops: about 10 and 30 degrees. */
export const SKY_STOPS_H = { low: .17, mid: .5 };
/** The dawn ceiling: thin high cloud over the summit, dawn-lit tops and violet shade, coverage, texture repeats per unit of plane
 * projection, drift in uv per second, start offset, and the weather map. `lift` keeps the ceiling as fine overhead as near the horizon. */
export const CLOUD = {
  lit: '#eeddc0', shade: '#4e4763', coverage: .18, scale: .7, lift: .55, wind: [.0045, .0012] as [number, number], offset: [.95, .05] as [number, number],
  weatherScale: .55, weatherSwing: .3,
  gaps: [] as { az: number; el: number; clear: number; fade: number }[], gapLift: 0,
};
/** Unit direction at an azimuth (degrees, clockwise from north, which is -z) and an elevation. */
export const skyDirection = (az: number, el: number): Rgb => {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
/** Fog is three's linear smoothstep on view depth, applied after tone mapping, so the colour is exactly what appears on screen.
 * Clear summit air at dawn: it starts farther out and has swallowed everything by 580 m, inside the camera far plane (650). */
export const FOG = { color: HAZE, near: 50, far: 580 };
/** The distant Hermon ranges: three layers of neighbouring peaks and watch towers outside the flyable box. `gaps` are metres from
 * the box edge to the nearest footprint on the [north, east and west, south] sides. Tints are display hex before fog, as [lit,
 * shaded]: dawn-lit rock and violet shade. `rust` is first light on the rock, `soot` the shadowed face, `foam` snow at the crest. */
export const SKYLINE = {
  seed: 2033, rust: '#d99a5f', soot: '#1c1a24', foam: '#ece7db',
  gaps: [[110, 120, 200], [170, 180, 260], [240, 250, 330]] as [number, number, number][],
  tints: [['#6d6a78', '#3f3c4c'], ['#7a7686', '#4c485c'], ['#8a8494', '#5c5768']] as [string, string][],
};
/** Drifting dawn motes (Drift.tsx): snow crystals and dust in first light, per quality level, their size in pixels at 1 m (before
 * the pixel ratio), the side of the box around the camera they fill, their colour (display hex), fall range and wind (m/s) and opacity. */
export const DRIFT = { count: { high: 2600, low: 1100 }, size: 28, box: 60, color: '#f6efdd', fall: [.3, .8] as [number, number], wind: [.6, .25] as [number, number], alpha: .55 };
/** Scene.tsx tones the ranges, archangel and water body with ACES at this exposure. */
export const EXPOSURE = 1.2;
/** The water below the summit at dawn (valley lakes seen from Hermon) before tone mapping: deep dawn blue, with valley mist and
 * warm first-light reflections drifting through it. waterShader adds the sky mirror, ripples and wake. */
export const WATER_BODY: Rgb = [.010, .018, .026];
export const WATER_MIST: Rgb = [.030, .045, .055];
export const WATER_GLOW: Rgb = [.10, .055, .022];
/** Dawn crest on the water, display hex (it is mixed in after tone mapping). */
export const WATER_CREST = '#d8c9a8';
/** three's ACES filmic curve (the Hill fit) in JS, for colours that are tone mapped in a shader and needed elsewhere as they appear. */
export function acesFilmic(c: Rgb, exposure = EXPOSURE): Rgb {
  const m = [[.59719, .35458, .04823], [.0760, .90834, .01566], [.02840, .13383, .83777]], o = [[1.60475, -.53108, -.07367], [-.10208, 1.10813, -.00605], [-.00327, -.07276, 1.07602]];
  const v = m.map(r => (r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) * exposure / .6).map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .432951) + .238081));
  return o.map(r => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))) as Rgb;
}
/** The water body as it appears on screen (display linear): the foot of a distant range mists toward the water, not toward the sky. */
export const SEA_BODY = acesFilmic(WATER_BODY);
/** Most of the light now: the dawn firmament from above, the rock and snow of the summit from below. */
export const HEMISPHERE = { sky: '#b9c4de', ground: '#746252', intensity: 2.2 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = { haze: hexToLinear(HAZE), low: hexToLinear(SKY.low), mid: hexToLinear(SKY.mid), zenith: hexToLinear(SKY.zenith), warm: hexToLinear(SKY.warm) };

/** The overcast for a unit direction, linear display-referred rgb, before the cloud ceiling. The TypeScript twin of the GLSL skyBase in
 * skyShader.ts: keep the two identical. It is exactly HAZE at and below eye level, at every azimuth, so sea, fog and dome meet without a
 * seam, and darker with height. */
export function skyBase(dir: Rgb): Rgb {
  const h = Math.max(dir[1], 0);
  let c = mix(lin.haze, lin.low, smooth(0, SKY_STOPS_H.low, h));
  c = mix(c, lin.mid, smooth(SKY_STOPS_H.low, SKY_STOPS_H.mid, h));
  c = mix(c, lin.zenith, smooth(SKY_STOPS_H.mid, 1, h));
  c = mix(c, lin.haze, Math.exp(-h * 14) * .8);
  const toSun = .5 + .5 * (dir[0] * SUN_XZ[0] + dir[2] * SUN_XZ[1]) / Math.max(Math.hypot(dir[0], dir[2]), 1e-4);
  return mix(c, lin.warm, toSun ** 3 * smooth(0, .08, h) * Math.exp(-h * 4) * .3);
}

/** The dim smear of light behind the ash where the sun is, linear display-referred: the TypeScript twin of the end of the dome
 * shader. `q` is 1 - cos(angle to the sun). A wide, weak mix toward a dull warm grey: no disc, no core, nothing white. */
export function sunGlow(base: Rgb, q: number): Rgb {
  return mix(base, hexToLinear(SUN_GLOW.color), Math.exp(-q * SUN_GLOW.rate) * SUN_GLOW.weight);
}

/** Advances the cloud drift (uv) in place. A still sky (paused, or reduced motion) does not move; a long frame counts as .04 s. It
 * never asks for a frame: play already renders every frame, and a paused resize shows the same clouds. */
export function driftClouds(offset: { x: number; y: number }, dt: number, still: boolean) {
  if (still) return;
  const step = Math.min(dt, .04);
  offset.x += CLOUD.wind[0] * step; offset.y += CLOUD.wind[1] * step;
}

/** The equirect inverse the environment map uses; (u, v) in 0..1, texel centres at (x + .5) / width. */
export function directionFromUv(u: number, v: number): Rgb {
  const az = (u - .5) * 2 * Math.PI, el = (v - .5) * Math.PI;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}
