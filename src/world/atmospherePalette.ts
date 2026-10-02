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
/** A hex colour as a linear GLSL vec3 literal. */
export const glslVec3 = (hex: string) => `vec3(${hexToLinear(hex).map(v => v.toFixed(6)).join(', ')})`;

/** The sun. It does not move: the hero, arm cannon and FX are tuned against it. Light, dome, water glint, environment glow all read this. */
export const SUN_POSITION: [number, number, number] = [-65, 100, 80];
const sunLength = Math.hypot(...SUN_POSITION);
export const SUN_DIRECTION: Rgb = [SUN_POSITION[0] / sunLength, SUN_POSITION[1] / sunLength, SUN_POSITION[2] / sunLength];
export const SUN_COLOR = '#ffe6b2';
/** The sun's disc as it appears on screen: warm gold, soft edged, never white and never orange. */
export const SUN_DISC = '#ffeeaa';
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
 * offset, and the weather map (its scale in the plane, and how far it moves the threshold: banks where it is high, gaps where low). */
export const CLOUD = {
  lit: '#f4f4ee', shade: '#aebbc8', coverage: .45, scale: .5, wind: [.003, .001] as [number, number], offset: [.18, .62] as [number, number],
  weatherScale: .55, weatherSwing: .3,
};
export const FOG = { color: HAZE, near: 95, far: 330 };
/** The distant skyline: three layers standing in the sea outside the flyable box. `gaps` are metres from the box edge to the nearest
 * tower face on the [north, east and west, south] sides. Tints are display hex before fog, as [lit, shaded]: the split is wide on
 * purpose because fog compresses it to about a fifth. Each layer is paler and cooler than the nearer one. `crown` is roof green. */
export const SKYLINE = {
  seed: 2033, crown: '#4f6f4a',
  gaps: [[110, 120, 200], [170, 180, 260], [240, 250, 330]] as [number, number, number][],
  tints: [['#889aa6', '#5a6c78'], ['#8496a2', '#64767f'], ['#93a5b0', '#778992']] as [string, string][],
};
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
  c = mix(c, lin.haze, Math.exp(-h * 18) * .8);
  const toSun = .5 + .5 * (dir[0] * SUN_XZ[0] + dir[2] * SUN_XZ[1]) / Math.max(Math.hypot(dir[0], dir[2]), 1e-4);
  return mix(c, lin.warm, toSun ** 3 * smooth(0, .08, h) * Math.exp(-h * 5) * .35);
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
