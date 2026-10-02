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

/** The sun. It does not move: the hero, arm cannon and FX are tuned against it. Light, dome, water glint, environment glow all read this. */
export const SUN_POSITION: [number, number, number] = [-65, 100, 80];
const sunLength = Math.hypot(...SUN_POSITION);
export const SUN_DIRECTION: Rgb = [SUN_POSITION[0] / sunLength, SUN_POSITION[1] / sunLength, SUN_POSITION[2] / sunLength];
export const SUN_COLOR = '#ffe6b2';
/** The sun's disc as it appears on screen: warm gold, soft edged, never white and never orange, a lighter core inside a deeper gold rim.
 * The glow around it is a mix, not an add (an add pushes blue sky through white): the disc, then cream, then a wide warm white lift
 * that fades into the sky. The lift is a white, not a blue: a blue to cream mix passes through a dirty grey, a white to cream mix does not. */
export const SUN_DISC = '#ffe39a';
export const SUN_CORE = '#fff3c4';
export const SUN_CREAM = '#ffecbc';
export const SUN_PALE = '#f7f6ee';
/** How the glow mixes in, as q = 1 - cos(angle to the sun): a wide white lift, a cream that closes in tighter, then the disc (gold
 * between its two q, a lighter core inside `core`). Used by the dome shader and by sunGlow(), its twin. */
export const SUN_GLOW = { pale: { rate: 60, weight: .85 }, cream: { rate: 420, weight: .85 }, disc: [.00011, .00042] as [number, number], core: .0003 };
/** Equirectangular centre of the sun (three's mapping: u = atan2(z, x) / 2pi + .5, v = asin(y) / pi + .5). */
export const SUN_UV: [number, number] = [Math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0]) / (2 * Math.PI) + .5, Math.asin(SUN_DIRECTION[1]) / Math.PI + .5];
const flat = Math.hypot(SUN_DIRECTION[0], SUN_DIRECTION[2]);
/** Unit horizontal direction toward the sun. */
export const SUN_XZ: [number, number] = [SUN_DIRECTION[0] / flat, SUN_DIRECTION[2] / flat];

/** HAZE is the one horizon colour: sea far end, fog, dome at and below eye level all land on it. */
export const HAZE = '#d3e0e4';
export const SKY = { low: '#a9cbe3', mid: '#7fb0dc', zenith: '#3f7fc4', warm: '#f2e6cc' };
/** Dome elevation (dir.y) of the low and mid colour stops: about 10 and 30 degrees. */
export const SKY_STOPS_H = { low: .17, mid: .5 };
/** Clouds: lit and shaded colours, density threshold, texture repeats per unit of plane projection, drift in uv per second, start
 * offset, and the weather map (its scale in the plane, and how far it moves the threshold: banks where it is high, gaps where low).
 * `lift` is the plane's height in the projection dir.xz / (h + lift): a higher one keeps the clouds overhead as fine as the ones near
 * the horizon (a low one magnifies the top of a level phone frame about four times and smears it). */
export const CLOUD = {
  lit: '#fbf8ee', shade: '#bccbdc', coverage: .45, scale: .84, lift: .55, wind: [.003, .001] as [number, number], offset: [.725, .525] as [number, number],
  weatherScale: .55, weatherSwing: .3,
};
/** Fog is three's linear smoothstep on view depth, applied after tone mapping, so the colour is exactly what appears on screen. The
 * far end stays under the camera far plane (650): the sea's far-plane clip always lands in full haze. */
export const FOG = { color: HAZE, near: 70, far: 590 };
/** The distant skyline: three layers standing in the sea outside the flyable box. `gaps` are metres from the box edge to the nearest
 * tower face on the [north, east and west, south] sides. Tints are display hex before fog, as [lit, shaded]: the split is wide on
 * purpose because fog compresses it to about a fifth. Each layer is paler and cooler than the nearer one. `crown` is roof green. */
export const SKYLINE = {
  seed: 2033, crown: '#4f6f4a',
  gaps: [[110, 120, 200], [170, 180, 260], [240, 250, 330]] as [number, number, number][],
  tints: [['#a0a198', '#586a76'], ['#939fa2', '#64767f'], ['#93a5b0', '#778992']] as [string, string][],
};
/** Scene.tsx tones the city, hero and sea body with ACES at this exposure. */
export const EXPOSURE = 1.2;
/** The sea body before tone mapping (deep teal): waterShader adds shimmer, wake and glint to it. */
export const WATER_BODY: Rgb = [.018, .16, .145];
/** three's ACES filmic curve (the Hill fit) in JS, for colours that are tone mapped in a shader and needed elsewhere as they appear. */
export function acesFilmic(c: Rgb, exposure = EXPOSURE): Rgb {
  const m = [[.59719, .35458, .04823], [.0760, .90834, .01566], [.02840, .13383, .83777]], o = [[1.60475, -.53108, -.07367], [-.10208, 1.10813, -.00605], [-.00327, -.07276, 1.07602]];
  const v = m.map(r => (r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) * exposure / .6).map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .432951) + .238081));
  return o.map(r => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))) as Rgb;
}
/** The sea body as it appears on screen (display linear): the foot of a distant tower mists toward the water, not toward the sky. */
export const SEA_BODY = acesFilmic(WATER_BODY);
export const HEMISPHERE = { sky: '#c0dbed', ground: '#647c7a', intensity: 1.7 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = { haze: hexToLinear(HAZE), low: hexToLinear(SKY.low), mid: hexToLinear(SKY.mid), zenith: hexToLinear(SKY.zenith), warm: hexToLinear(SKY.warm) };

/** The clear sky for a unit direction, linear display-referred rgb. The TypeScript twin of the GLSL skyBase in skyShader.ts: keep the
 * two identical. It is exactly HAZE at and below eye level, at every azimuth, so sea, fog and dome meet without a seam. */
export function skyBase(dir: Rgb): Rgb {
  const h = Math.max(dir[1], 0);
  let c = mix(lin.haze, lin.low, smooth(0, SKY_STOPS_H.low, h));
  c = mix(c, lin.mid, smooth(SKY_STOPS_H.low, SKY_STOPS_H.mid, h));
  c = mix(c, lin.zenith, smooth(SKY_STOPS_H.mid, 1, h));
  c = mix(c, lin.haze, Math.exp(-h * 22) * .78);
  const toSun = .5 + .5 * (dir[0] * SUN_XZ[0] + dir[2] * SUN_XZ[1]) / Math.max(Math.hypot(dir[0], dir[2]), 1e-4);
  return mix(c, lin.warm, toSun ** 3 * smooth(0, .08, h) * Math.exp(-h * 5) * .35);
}

/** The glow around the sun over a clear sky, linear display-referred: the TypeScript twin of the end of the dome shader (no cloud
 * veil). `q` is 1 - cos(angle to the sun). */
export function sunGlow(base: Rgb, q: number): Rgb {
  const gold = hexToLinear(SUN_DISC), core = hexToLinear(SUN_CORE), cream = hexToLinear(SUN_CREAM), pale = hexToLinear(SUN_PALE);
  let c = mix(base, pale, Math.exp(-q * SUN_GLOW.pale.rate) * SUN_GLOW.pale.weight);
  c = mix(c, cream, Math.exp(-q * SUN_GLOW.cream.rate) * SUN_GLOW.cream.weight);
  return mix(c, mix(core, gold, smooth(0, SUN_GLOW.core, q)), 1 - smooth(SUN_GLOW.disc[0], SUN_GLOW.disc[1], q));
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
