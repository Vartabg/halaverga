import { describe, expect, it } from 'vitest';
import { domeFragment, domeVertex, skyBaseGlsl } from '@/world/skyShader';
import { FOG, HAZE, HEMISPHERE, SKY, SUN_DIRECTION, SUN_POSITION, SUN_UV, SUN_XZ, directionFromUv, glslVec3, hexToLinear, skyBase, type Rgb } from '@/world/atmospherePalette';

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
});
