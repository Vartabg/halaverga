import { describe, expect, it } from 'vitest';
import { cloudCoverage, makeCloudData } from '@/world/cloudData';
import { domeFragment, domeVertex, skyBaseGlsl } from '@/world/skyShader';
import { waterFragment, waterVertex } from '@/world/waterShader';
import { CLOUD, FOG, HAZE, HEMISPHERE, SKY, SUN_CREAM, SUN_DIRECTION, SUN_DISC, SUN_PALE, SUN_POSITION, SUN_UV, SUN_XZ, directionFromUv, driftClouds, glslVec3, hexToLinear, skyBase, type Rgb } from '@/world/atmospherePalette';

const enc = (x: number) => Math.round(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055));
const screen = (c: Rgb) => c.map(enc);
const hexRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const near = (a: number[], b: number[], levels: number) => a.every((v, i) => Math.abs(v - b[i]) <= levels);
const elevation = (deg: number): Rgb => { const e = deg * Math.PI / 180; return [-SUN_XZ[0] * Math.cos(e), Math.sin(e), -SUN_XZ[1] * Math.cos(e)]; };
const saturation = (rgb: number[]) => { const hi = Math.max(...rgb), lo = Math.min(...rgb); return hi ? (hi - lo) / hi : 0; };

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
  it('turns bluer with height and is clearly blue where a phone looks', () => {
    let last = -Infinity;
    for (let deg = 0; deg <= 60; deg += 5) {
      const [r, , b] = screen(skyBase(elevation(deg)));
      expect(b - r).toBeGreaterThan(last); last = b - r;
    }
    expect(saturation(screen(skyBase(elevation(25))))).toBeGreaterThanOrEqual(.3);
  });
  it('lifts the low sky toward the sun only', () => {
    const toward: Rgb = [SUN_XZ[0] * .985, .17, SUN_XZ[1] * .985], away: Rgb = [-toward[0], .17, -toward[2]];
    expect(skyBase(toward)[0]).toBeGreaterThan(skyBase(away)[0]);
  });
  it('shares one horizon colour with the fog', () => {
    expect(FOG.color).toBe(HAZE);
    expect(FOG.near).toBeLessThan(FOG.far);
    expect(FOG.far).toBeLessThan(650);
    expect(HEMISPHERE.intensity).toBe(1.7);
  });
  it('fogs gently near and fully by 590 m, inside the camera far plane', () => {
    const factor = (depth: number) => { const t = Math.min(1, Math.max(0, (depth - FOG.near) / (FOG.far - FOG.near))); return t * t * (3 - 2 * t); };
    expect(FOG.near).toBe(70); expect(FOG.far).toBe(590);
    expect(factor(70)).toBe(0); expect(factor(100)).toBeLessThan(.02);
    for (const depth of [590, 620, 650]) expect(factor(depth)).toBe(1);
    // aerial perspective: a smooth rise through the skyline distances (the spawn sees the three layers at about 380, 440 and 500 m)
    expect(factor(380)).toBeGreaterThan(.6); expect(factor(380)).toBeLessThan(.7);
    expect(factor(440)).toBeGreaterThan(.78); expect(factor(500)).toBeGreaterThan(.9); expect(factor(500)).toBeLessThan(1);
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
  it('draws a warm gold sun disc, never white and never orange', () => {
    expect(domeFragment).toContain(glslVec3(SUN_DISC));
    const [r, g, b] = hexRgb(SUN_DISC);
    expect(r).toBe(255); expect(g).toBeGreaterThan(215); expect(g).toBeLessThan(250);
    expect(b).toBeGreaterThan(120); expect(b).toBeLessThan(200);
    expect(r > 190 && g < 110 && b < 100).toBe(false);
  });
});

describe('sun glow and cloud scale', () => {
  it('mixes the glow gold, cream, pale, sky: an add would push the blue sky through white', () => {
    for (const hex of [SUN_DISC, SUN_CREAM, SUN_PALE]) expect(domeFragment).toContain(glslVec3(hex));
    expect(domeFragment).not.toMatch(/col \+= [^;]*pow\(s, 160/);
    const [r, g, b] = hexRgb(SUN_CREAM);
    expect(r).toBe(255); expect(g).toBeGreaterThan(220); expect(b).toBeGreaterThan(160); expect(b).toBeLessThan(215); // cream: warmer than the pale lift, never white
  });
  it('keeps the cloud plane high, so the top of a level phone frame is not magnified far beyond the horizon', () => {
    const density = (deg: number) => CLOUD.scale / (Math.sin(deg * Math.PI / 180) + CLOUD.lift); // cloud texture repeats per radian
    expect(density(10) / density(40)).toBeLessThan(2); // the old lift of .3 gave 2.6
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
  it('covers about 40 percent of the sky at the shipped threshold', () => {
    const cover = cloudCoverage(data, CLOUD.coverage);
    expect(cover).toBeGreaterThan(.32); expect(cover).toBeLessThan(.48);
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
});
