import { describe, expect, it } from 'vitest';
import { FOG, HAZE, SKY, SUN, SUN_DIRECTION, SUN_POSITION, VALLEY_FOG, directionFromUv, glslRgb, glslVec3, skyBase, skyDirection, terrainHaze } from '@/world/atmospherePalette';
import { domeFragment, domeVertex, skyBaseGlsl, terrainHazeGlsl } from '@/world/skyShader';
import { waterFragment, waterVertex } from '@/world/waterShader';

describe('Hermon dawn', () => {
  it('has one low east-southeast sun for the dome, key light and reflection', () => {
    const [x, y, z] = SUN_DIRECTION;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    expect(Math.asin(y) * 180 / Math.PI).toBeCloseTo(SUN.elevation, 9);
    expect(Math.atan2(x, -z) * 180 / Math.PI).toBeCloseTo(SUN.azimuth, 9);
    expect(SUN.elevation).toBeLessThan(8);
    expect(x).toBeGreaterThan(.9);
    const len = Math.hypot(...SUN_POSITION);
    const sample = directionFromUv(Math.atan2(z, x) / (2 * Math.PI) + .5, Math.asin(y) / Math.PI + .5);
    for (const [i, value] of SUN_DIRECTION.entries()) {
      expect(SUN_POSITION[i] / len).toBeCloseTo(value, 9);
      expect(sample[i]).toBeCloseTo(value, 9);
    }
    expect(skyBaseGlsl).toContain(`SUN_DIR = ${glslRgb(SUN_DIRECTION)}`);
  });
  it('focuses the warm glow in the east and keeps the western horizon and zenith blue', () => {
    const toward = skyBase(skyDirection(SUN.azimuth, 0));
    const away = skyBase(skyDirection(SUN.azimuth + 180, 0));
    const zenith = skyBase(skyDirection(SUN.azimuth, 90));
    expect(toward[0]).toBeGreaterThan(toward[2]);
    expect(toward[0] - away[0]).toBeGreaterThan(.22);
    expect(away[2] - away[0]).toBeGreaterThan(.1);
    expect(zenith[2] - zenith[0]).toBeGreaterThan(.12);
    for (const color of [HAZE, SKY.low, SKY.mid, SKY.zenith, SKY.warm]) expect(skyBaseGlsl).toContain(glslVec3(color));
    expect(FOG.color).toBe(HAZE);
  });
  it('draws the solar disc behind the terrain with a sharp but antialiased edge and fading stars', () => {
    const radius = (2 * Math.sin(SUN.radius * Math.PI / 360)).toFixed(7);
    expect(domeVertex).toContain('gl_Position.z = gl_Position.w');
    expect(domeFragment).toContain('normalize(vWorld - cameraPosition)');
    expect(domeFragment).toContain(`float radius = ${radius}`);
    expect(domeFragment).toContain('fwidth(separation)');
    expect(domeFragment).toContain('stars(dir)');
    expect(domeFragment).toContain('#include <colorspace_fragment>');
    expect(domeFragment).not.toContain('tonemapping_fragment');
  });
});

describe('distance haze', () => {
  it('keeps summit air clear and thickens the lower gorge across the same distance', () => {
    expect(terrainHaze(0, 0, 0)).toBe(0);
    expect(terrainHaze(240, 100, 100)).toBeLessThan(.04);
    expect(terrainHaze(240, 0, 0)).toBeGreaterThan(.3);
    const across = terrainHaze(240, 100, -7);
    expect(across).toBeGreaterThan(terrainHaze(240, 100, 100));
    expect(across).toBeCloseTo(terrainHaze(240, -7, 100), 12);
    expect(terrainHaze(240, 0, .01)).toBeCloseTo(terrainHaze(240, 0, 0), 3);
  });
  it('keeps middle ridges visible and absorbs the farthest terrain into the horizon', () => {
    expect(terrainHaze(2000, 120, -400)).toBeLessThan(.3);
    expect(terrainHaze(9500, 120, -700)).toBeGreaterThan(.4);
    expect(terrainHaze(38_000, 120, -2000)).toBe(1);
    expect(terrainHazeGlsl).toContain(VALLEY_FOG.reach.toFixed(1));
    expect(terrainHazeGlsl).toContain('skyBase(vec3(az.x, 0., az.y))');
  });
});

describe('gorge water', () => {
  it('uses the shared sky and haze in linear display space after tone mapping', () => {
    expect(waterVertex).toContain('projectionMatrix * viewMatrix * world');
    expect(waterFragment).toContain(skyBaseGlsl);
    expect(waterFragment).toContain(terrainHazeGlsl);
    expect(waterFragment).toContain('skyBase(reflected)');
    expect(waterFragment).toContain('dot(reflected, SUN_DIR)');
    const toneMapped = waterFragment.indexOf('#include <tonemapping_fragment>');
    const bounced = waterFragment.indexOf('aerated(mix(');
    expect(toneMapped).toBeLessThan(bounced);
    expect(bounced).toBeLessThan(waterFragment.indexOf('#include <colorspace_fragment>'));
  });
  it('fades ripples and the player wake once they are finer than a pixel', () => {
    for (const phase of ['a', 'b', 'c', 'ripple']) expect(waterFragment).toContain(`fwidth(${phase})`);
    expect(waterFragment).toContain('length(p - wake)');
  });
});
