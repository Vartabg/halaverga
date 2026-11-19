/** Shared Hermon dawn parameters. RGB values passed to shaders are linear. */
export type Rgb = [number, number, number];
const decode = (v: number) => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
export function hexToLinear(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [decode((n >> 16 & 255) / 255), decode((n >> 8 & 255) / 255), decode((n & 255) / 255)];
}
export const glslRgb = (c: Rgb) => `vec3(${c.map(v => v.toFixed(6)).join(', ')})`;
export const glslVec3 = (hex: string) => glslRgb(hexToLinear(hex));

/** Azimuth clockwise from north (-z), elevation above the horizon. */
export function skyDirection(az: number, el: number): Rgb {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
export const SUN = { azimuth: 108, elevation: 5.5, radius: .266 } as const;
export const SUN_DIRECTION = skyDirection(SUN.azimuth, SUN.elevation);
export const SUN_POSITION = SUN_DIRECTION.map(value => value * 180) as Rgb;
export const SUN_COLOR = '#ffe3b9', SUN_INTENSITY = 2.14;
export const HAZE = '#c1d2dc';
export const SKY = { low: '#a2c0d7', mid: '#7aa1c6', zenith: '#4876a6', warm: '#ffcf9d' };
export const SKY_STOPS_H = { low: .18, mid: .52 };
export const SUN_GLOW = { rate: 12, weight: .61, vertical: 3.7 };
export const DAWN_BELT = { color: '#f3bea8', strength: .41 };
export const HEMISPHERE = { sky: '#d1dbe5', ground: '#b5ab94', intensity: 1.6 };
export const EXPOSURE = 1.04;
export const FAR_PLANE = 56_000;
/** Scene fog covers local props. The terrain and water calculate their own height-dependent aerial perspective. */
export const FOG = { color: HAZE, near: 100, far: 630 };
export const HORIZON_FADE = [18_000, 37_500] as const;
export const VALLEY_FOG = { depth: 21, density: .00155, air: .000062, reach: 460 };
export const DRIFT = { count: { high: 950, low: 440 }, size: 19, box: 60, color: '#e6edf1',
  fall: [.3, .8] as [number, number], wind: [.6, .25] as [number, number], alpha: .24 };
export const WATER_BODY: Rgb = [.012, .023, .027];
export const WATER_CREST = '#c4d4dc';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = { haze: hexToLinear(HAZE), low: hexToLinear(SKY.low), mid: hexToLinear(SKY.mid), zenith: hexToLinear(SKY.zenith),
  warm: hexToLinear(SKY.warm), belt: hexToLinear(DAWN_BELT.color) };
/** Linear display color, sampled in the dome, the water and the environment light. */
export function skyBase(dir: Rgb): Rgb {
  const h = Math.max(dir[1], 0);
  let c = mix(lin.haze, lin.low, smooth(0, SKY_STOPS_H.low, h));
  c = mix(c, lin.mid, smooth(SKY_STOPS_H.low, SKY_STOPS_H.mid, h));
  c = mix(c, lin.zenith, smooth(SKY_STOPS_H.mid, 1, h));
  const sunward = dir[0] * SUN_DIRECTION[0] + h * SUN_DIRECTION[1] + dir[2] * SUN_DIRECTION[2];
  const belt = smooth(.008, .066, h) * (1 - smooth(.11, .24, h)) * (.72 - .28 * sunward);
  c = mix(c, lin.belt, belt * DAWN_BELT.strength);
  return mix(c, lin.warm, Math.exp(-(1 - sunward) * SUN_GLOW.rate - h * SUN_GLOW.vertical) * SUN_GLOW.weight);
}
/** Average density of an exponential valley layer along a sloping sightline. */
function valleyAir(fromY: number, toY: number) {
  const low = Math.min(fromY, toY), high = Math.max(fromY, toY), rise = high - low;
  if (high <= 0) return 1;
  if (rise < .1) return Math.exp(-Math.max(0, (fromY + toY) * .5) / VALLEY_FOG.depth);
  const above = VALLEY_FOG.depth * (Math.exp(-Math.max(0, low) / VALLEY_FOG.depth) - Math.exp(-high / VALLEY_FOG.depth));
  return (above - Math.min(0, low)) / rise;
}
export function terrainHaze(distance: number, fromY: number, toY: number) {
  const length = Math.max(0, distance), inValley = Math.min(length, VALLEY_FOG.reach);
  const end = fromY + (toY - fromY) * inValley / Math.max(length, .001);
  const transmittance = Math.exp(-length * VALLEY_FOG.air - inValley * VALLEY_FOG.density * valleyAir(fromY, end));
  return 1 - transmittance * (1 - smooth(...HORIZON_FADE, length));
}
/** Unit direction at the given equirectangular texel coordinates. */
export function directionFromUv(u: number, v: number): Rgb {
  const az = (u - .5) * 2 * Math.PI, el = (v - .5) * Math.PI;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}
