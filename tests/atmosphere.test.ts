import { describe, expect, it } from 'vitest';
import { cloudAt, cloudCoverage, makeCloudData } from '@/world/cloudData';
import { domeFragment, domeVertex, skyBaseGlsl } from '@/world/skyShader';
import { waterFragment, waterVertex } from '@/world/waterShader';
import { CLOUD, FOG, HAZE, HEMISPHERE, SKY, SUN_DIRECTION, SUN_GLOW, SUN_POSITION, SUN_UV, SUN_XZ, directionFromUv, driftClouds, glslVec3, hexToLinear, skyBase, skyDirection, sunGlow, type Rgb } from '@/world/atmospherePalette';

const enc = (x: number) => Math.round(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055));
const screen = (c: Rgb) => c.map(enc);
const hexRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const near = (a: number[], b: number[], levels: number) => a.every((v, i) => Math.abs(v - b[i]) <= levels);
const elevation = (deg: number): Rgb => { const e = deg * Math.PI / 180; return [-SUN_XZ[0] * Math.cos(e), Math.sin(e), -SUN_XZ[1] * Math.cos(e)]; };
const saturation = (rgb: number[]) => { const hi = Math.max(...rgb), lo = Math.min(...rgb); return hi ? (hi - lo) / hi : 0; };
const luma = (rgb: number[]) => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];

describe('one sun', () => {
  it('has a unit direction parallel to its position', () => {
    expect(Math.hypot(...SUN_DIRECTION)).toBeCloseTo(1, 9);
    expect(SUN_POSITION).toEqual([-65, 100, 80]);
    const len = Math.hypot(...SUN_POSITION);
    SUN_POSITION.forEach((v, i) => expect(v / len).toBeCloseTo(SUN_DIRECTION[i], 9));
  });
  it('maps to the equirect centre the environment glow uses, and back', () => {
    const [x, y, z] = SUN_DIRECTION;
    expect(SUN_UV[0]).toBeCloseTo(Math.atan2(z, x) / (2 * Math.PI) + .5, 4);
    expect(SUN_UV[1]).toBeCloseTo(Math.asin(y) / Math.PI + .5, 4);
    directionFromUv(...SUN_UV).forEach((v, i) => expect(v).toBeCloseTo(SUN_DIRECTION[i], 3));
  });
});

describe('sky palette', () => {
  it('is exactly the haze colour at and below eye level, at every azimuth', () => {
    for (let k = 0; k < 8; k++) for (const y of [0, -.2, -1]) {
      const az = k * Math.PI / 4, flat = Math.sqrt(1 - y * y);
      expect(near(screen(skyBase([flat * Math.cos(az), y, flat * Math.sin(az)])), hexRgb(HAZE), 1)).toBe(true);
    }
  });
  it('follows the authored stops on the side away from the sun', () => {
    const stops: [number, string][] = [[0, HAZE], [10, SKY.low], [30, SKY.mid], [90, SKY.zenith]];
    for (const [deg, hex] of stops) expect(near(screen(skyBase(elevation(deg))), hexRgb(hex), 3)).toBe(true);
  });
  it('is an ash overcast: darker with height and never blue (Garo, 2026-10-06: no sunlight)', () => {
    let last = Infinity;
    for (let deg = 0; deg <= 90; deg += 5) {
      const c = screen(skyBase(elevation(deg)));
      expect(luma(c)).toBeLessThanOrEqual(last); last = luma(c);
      expect(c[2] - c[0]).toBeLessThanOrEqual(0); // no blue anywhere
      expect(saturation(c)).toBeLessThan(.18);
    }
    expect(luma(screen(skyBase(elevation(90))))).toBeLessThan(60); // a dark ceiling overhead
  });
  it('lifts the low sky toward the sun only', () => {
    const toward: Rgb = [SUN_XZ[0] * .985, .17, SUN_XZ[1] * .985], away: Rgb = [-toward[0], .17, -toward[2]];
    expect(skyBase(toward)[0]).toBeGreaterThan(skyBase(away)[0]);
  });
  it('shares one horizon colour with the fog', () => {
    expect(FOG.color).toBe(HAZE);
    expect(FOG.near).toBeLessThan(FOG.far);
    expect(FOG.far).toBeLessThan(650);
    expect(HEMISPHERE.intensity).toBe(2.5);
  });
  it('fogs thick with ash, fully by 470 m, inside the camera far plane', () => {
    const factor = (depth: number) => { const t = Math.min(1, Math.max(0, (depth - FOG.near) / (FOG.far - FOG.near))); return t * t * (3 - 2 * t); };
    expect(FOG.near).toBe(30); expect(FOG.far).toBe(470);
    expect(factor(30)).toBe(0);
    for (const depth of [470, 560, 650]) expect(factor(depth)).toBe(1);
    expect(factor(150)).toBeGreaterThan(.15); expect(factor(260)).toBeGreaterThan(.5); expect(factor(380)).toBeGreaterThan(.85);
  });
  it('writes colours as linear GLSL literals', () => {
    expect(glslVec3('#ffffff')).toBe('vec3(1.000000, 1.000000, 1.000000)');
    expect(hexToLinear('#000000')).toEqual([0, 0, 0]);
  });
});

describe('sky shader strings', () => {
  it('build the GLSL twin from the same palette', () => {
    for (const hex of [HAZE, SKY.low, SKY.mid, SKY.zenith, SKY.warm]) expect(skyBaseGlsl).toContain(glslVec3(hex));
    expect(skyBaseGlsl).toContain('vec3 skyBase(vec3 dir)');
  });
  it('draw the dome display-referred, from the camera, pinned to the far plane', () => {
    expect(domeFragment).toContain('#include <colorspace_fragment>');
    expect(domeFragment).not.toContain('tonemapping_fragment');
    expect(domeFragment).toContain('normalize(vWorld - cameraPosition)');
    expect(domeVertex).toContain('gl_Position.z = gl_Position.w');
  });
  it('draws no sun disc: there is no sunlight, only a dull smear in the cloud', () => {
    expect(domeFragment).not.toMatch(/disc|SUN_GOLD|SUN_CORE/);
    expect(domeFragment).toContain(glslVec3(SUN_GLOW.color));
    const glow = hexRgb(SUN_GLOW.color);
    expect(luma(glow)).toBeLessThan(170); expect(saturation(glow)).toBeLessThan(.3);
  });
});

describe('sun glow and cloud scale', () => {
  it('smears the light toward the hidden sun: brighter toward it, never a ring, never white', () => {
    const base = skyBase(SUN_DIRECTION), at = (deg: number) => screen(sunGlow(base, 1 - Math.cos(deg * Math.PI / 180)));
    let last = Infinity;
    for (let deg = 0; deg <= 45; deg += .5) { const l = luma(at(deg)); expect(l).toBeLessThanOrEqual(last + .5); last = l; }
    expect(luma(at(0))).toBeLessThan(150); // dim even at its centre
    expect(luma(at(25)) - luma(screen(base))).toBeGreaterThan(2); // and wide: still lifting the sky 25 degrees out
    expect(domeFragment).not.toMatch(/col \+= /); // mixed, not added
  });
  it('keeps the cloud plane high, so the top of a level phone frame is not magnified far beyond the horizon', () => {
    const sin = (deg: number) => Math.sin(deg * Math.PI / 180), a = CLOUD.lift;
    const across = (deg: number) => 1 / (sin(deg) + a); // cloud texture repeats per radian of view, along the horizon
    const up = (deg: number) => (1 + a * sin(deg)) / (sin(deg) + a) ** 2; // and up the frame
    expect(across(10) / across(40)).toBeLessThan(1.8); // a lift of .3 gave 2.0
    expect(up(10) / up(40)).toBeLessThan(2.5); // a lift of .3 gave 3.5, the "four times" smear at the top of a phone frame
    expect(domeFragment).toContain('dir.xz / (h + CLOUD_LIFT)');
  });
});

describe('cloud data', () => {
  const data = makeCloudData(256, 2113);
  const diff = (a: (i: number) => number, b: (i: number) => number, n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(a(i) - b(i)); return s / n; };
  it('is deterministic and opaque', () => {
    expect(Buffer.from(makeCloudData(256, 2113)).equals(Buffer.from(data))).toBe(true);
    expect(Buffer.from(makeCloudData(256, 7)).equals(Buffer.from(data))).toBe(false);
    expect(data.length).toBe(256 * 256 * 4);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error('alpha must be opaque');
  });
  it('tiles: the seam is no rougher than the interior', () => {
    for (let ch = 0; ch < 3; ch++) {
      const px = (x: number, y: number) => data[(y * 256 + x) * 4 + ch];
      const interior = diff(i => px(100, i), i => px(101, i), 256), seam = diff(i => px(0, i), i => px(255, i), 256);
      const interiorRows = diff(i => px(i, 100), i => px(i, 101), 256), seamRows = diff(i => px(i, 0), i => px(i, 255), 256);
      expect(seam).toBeLessThanOrEqual(interior * 1.5 + 1); expect(seamRows).toBeLessThanOrEqual(interiorRows * 1.5 + 1);
    }
  });
  it('covers almost the whole sky at the shipped threshold: the ash never clears', () => {
    expect(cloudCoverage(data, CLOUD.coverage)).toBeGreaterThan(.88);
  });
});

describe('the first frame sky', () => {
  const data = makeCloudData(256, 2113);
  it('hides the sun and keeps the ceiling closed all around', () => {
    expect(cloudAt(data, SUN_DIRECTION)).toBeGreaterThan(.35);
    let sky = 0, cloud = 0;
    for (let a = 0; a < 360; a += 3) for (const e of [15, 30, 45, 60]) { sky++; if (cloudAt(data, skyDirection(a, e)) > .35) cloud++; }
    expect(cloud / sky).toBeGreaterThan(.88);
    expect(CLOUD.gaps).toHaveLength(0); expect(CLOUD.gapLift).toBe(0); // white text reads on a dark ceiling
  });
});

describe('cloud drift', () => {
  it('moves while playing, by at most .04 s of wind per frame', () => {
    const o = { x: 0, y: 0 };
    driftClouds(o, .016, false);
    expect(o.x).toBeCloseTo(CLOUD.wind[0] * .016, 12); expect(o.y).toBeCloseTo(CLOUD.wind[1] * .016, 12);
    driftClouds(o, 5, false);
    expect(o.x).toBeCloseTo(CLOUD.wind[0] * (.016 + .04), 12);
  });
  it('holds still when paused or under reduced motion', () => {
    const o = { x: .3, y: .1 };
    driftClouds(o, .016, true); driftClouds(o, 2, true);
    expect(o).toEqual({ x: .3, y: .1 });
  });
});

describe('water shader', () => {
  it('takes the scene fog after the colour space chunk, so the sea ends in the same haze as the city', () => {
    expect(waterVertex).toContain('#include <fog_pars_vertex>'); expect(waterVertex).toContain('#include <fog_vertex>');
    expect(waterVertex).toContain('vec4 mvPosition = viewMatrix * world');
    expect(waterFragment).toContain('#include <fog_pars_fragment>');
    expect(waterFragment.indexOf('#include <fog_fragment>')).toBeGreaterThan(waterFragment.indexOf('#include <colorspace_fragment>'));
    expect(waterFragment).not.toContain('smoothstep(110., 360.'); // the private far blend is gone
  });
  it('fades every ripple octave once it is finer than a pixel, and keeps the sky reflection display-referred', () => {
    for (const phase of ['a', 'b', 'c']) expect(waterFragment).toContain(`fwidth(${phase})`);
    expect(waterFragment).toContain('skyBase(reflected)');
  });
  it('is poisoned: oily slicks, scum and chemical patches, and no sun glint', () => {
    for (const part of ['slick', 'scum', 'sick', 'rust', 'irid']) expect(waterFragment).toContain(part);
    expect(waterFragment).not.toMatch(/glint|pow\(max\(dot\(reflected, uSun\)/);
    expect(waterFragment).not.toMatch(/\bsin\(p\.[xy] \* \d+\.\d+ \+ \d/); // the noise hash is sine free
  });
});
