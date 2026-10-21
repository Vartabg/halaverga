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

/** The hidden sun. Since 2033 an ash overcast has stood over Halaverga (Garo, 2026-10-06: "there was no sunlight"): there is no disc
 * and no hard light, only a dim brighter patch in the cloud where the sun is. It does not move: the hero, arm cannon and FX are lit
 * from here, and the dome's glow, the key light and the environment glow all read this direction. */
export const SUN_POSITION: [number, number, number] = [-65, 100, 80];
const sunLength = Math.hypot(...SUN_POSITION);
export const SUN_DIRECTION: Rgb = [SUN_POSITION[0] / sunLength, SUN_POSITION[1] / sunLength, SUN_POSITION[2] / sunLength];
/** The key light through the overcast: flat, cool and weak (a third of the old sun), so shapes read without hard shadows. */
export const SUN_COLOR = '#e2be92';
export const SUN_INTENSITY = 1.4;
/** The glow behind the firmament where the hidden throne burns, as q = 1 - cos(angle to the sun): a wide smoldering smear, never a disc. */
export const SUN_GLOW = { color: '#b5885c', rate: 7, weight: .42 };
/** Equirectangular centre of the sun (three's mapping: u = atan2(z, x) / 2pi + .5, v = asin(y) / pi + .5). */
export const SUN_UV: [number, number] = [Math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0]) / (2 * Math.PI) + .5, Math.asin(SUN_DIRECTION[1]) / Math.PI + .5];
const flat = Math.hypot(SUN_DIRECTION[0], SUN_DIRECTION[2]);
/** Unit horizontal direction toward the sun. */
export const SUN_XZ: [number, number] = [SUN_DIRECTION[0] / flat, SUN_DIRECTION[2] / flat];

/** HAZE is the one horizon colour: the smoldering bronze-ash of the Chasm of Dudael. Sea far end, fog, dome at and below eye level all
 * land on it. It is the lightest thing in a frame on purpose, so the Watcher monoliths stand against it as dark silhouettes. */
export const HAZE = '#8a6b54';
/** The firmament from the horizon up: smoldering bronze haze, copper-umber low sky, dark crimson-obsidian vault overhead. `warm` lifts
 * the low sky toward the hidden throne light. No blue anywhere. */
export const SKY = { low: '#755744', mid: '#523b2f', zenith: '#2b1e19', warm: '#a67b56' };
/** Dome elevation (dir.y) of the low and mid colour stops: about 10 and 30 degrees. */
export const SKY_STOPS_H = { low: .17, mid: .5 };
/** The chasm ceiling: thin and thick storm-cloud colours, coverage, texture repeats per unit of plane projection, drift in uv per
 * second, start offset, and the weather map. `lift` keeps the ceiling as fine overhead as near the horizon. */
export const CLOUD = {
  lit: '#785a47', shade: '#33241e', coverage: .2, scale: .7, lift: .55, wind: [.0045, .0012] as [number, number], offset: [.95, .05] as [number, number],
  weatherScale: .55, weatherSwing: .3,
  gaps: [] as { az: number; el: number; clear: number; fade: number }[], gapLift: 0,
};
/** Unit direction at an azimuth (degrees, clockwise from north, which is -z) and an elevation. */
export const skyDirection = (az: number, el: number): Rgb => {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
/** Fog is three's linear smoothstep on view depth, applied after tone mapping, so the colour is exactly what appears on screen. Thick
 * chasm mist: it starts close and has swallowed everything by 470 m, well inside the camera far plane (650). */
export const FOG = { color: HAZE, near: 30, far: 470 };
/** The distant Watcher monoliths: three layers standing in the abyssal sea outside the flyable box. `gaps` are metres from the box edge
 * to the nearest footprint on the [north, east and west, south] sides. Tints are display hex before fog, as [lit, shaded]: carved
 * bronze-basalt and scorched obsidian. `rust` is molten bronze veins, `soot` charred obsidian, `foam` brimstone crust at the waterline. */
export const SKYLINE = {
  seed: 2033, rust: '#b86828', soot: '#161110', foam: '#7a5638',
  gaps: [[110, 120, 200], [170, 180, 260], [240, 250, 330]] as [number, number, number][],
  tints: [['#5e493c', '#332620'], ['#685244', '#3d2f28'], ['#735c4e', '#483830']] as [string, string][],
};
/** Drifting chasm embers (Ash.tsx): sparks per quality level, their size in pixels at 1 m (before the pixel ratio), the side of the box
 * around the camera they fill, their colour (display hex), drift speed range and wind (m/s) and opacity. */
export const ASH = { count: { high: 2600, low: 1100 }, size: 28, box: 60, color: '#e8b468', fall: [.5, 1.3] as [number, number], wind: [.6, .25] as [number, number], alpha: .65 };
/** Scene.tsx tones the monoliths, archangel and abyssal sea body with ACES at this exposure. */
export const EXPOSURE = 1.2;
/** The abyssal sea (Rivers of Fire, 1 Enoch 17) before tone mapping: dark obsidian-wine (#241916 on screen), with submerged crimson
 * magma currents and molten brimstone veins drifting through it. waterShader adds the bronze sheen, sulfur crust, ripples and wake. */
export const WATER_BODY: Rgb = [.032, .016, .014];
export const WATER_SICK: Rgb = [.085, .028, .014];
export const WATER_RUST: Rgb = [.12, .062, .016];
/** Brimstone crust on the abyssal water, display hex (it is mixed in after tone mapping). */
export const WATER_SCUM = '#8c623e';
/** three's ACES filmic curve (the Hill fit) in JS, for colours that are tone mapped in a shader and needed elsewhere as they appear. */
export function acesFilmic(c: Rgb, exposure = EXPOSURE): Rgb {
  const m = [[.59719, .35458, .04823], [.0760, .90834, .01566], [.02840, .13383, .83777]], o = [[1.60475, -.53108, -.07367], [-.10208, 1.10813, -.00605], [-.00327, -.07276, 1.07602]];
  const v = m.map(r => (r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) * exposure / .6).map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .432951) + .238081));
  return o.map(r => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))) as Rgb;
}
/** The sea body as it appears on screen (display linear): the foot of a distant monolith mists toward the water, not toward the sky. */
export const SEA_BODY = acesFilmic(WATER_BODY);
/** Most of the light now: the bronze firmament from above, the dark ember-lit abyss from below. */
export const HEMISPHERE = { sky: '#b89472', ground: '#4a2e20', intensity: 2.5 };

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
