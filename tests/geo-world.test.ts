import { beforeEach, describe, expect, it } from 'vitest';
import {
  decodeTerrariumRgb,
  ecefToEnuMatrix,
  fillProceduralDem,
  GEO_REGIONS,
  geoRuntime,
  latLngToTileXY,
  meterOffsetToLatLng,
  selectCustomGps,
  selectGeoRegion,
  stepGeoWorld,
  wgs84ToEcef,
} from '@/game/geoWorld';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

describe('Google Maps 3D World, DEM Elevation, & Wingsuit Sky-Gate Engine', () => {
  beforeEach(() => {
    useGame.setState({ flying: false, landing: false, muted: true });
    runtime.position.x = 0;
    runtime.position.y = 20;
    runtime.position.z = 68;
    selectGeoRegion('yosemite', false);
  });

  it('converts WGS84 (lat, lng, alt) into ECEF, builds an orthonormal ENU matrix, and decodes Terrarium DEM tiles', () => {
    const ecef = wgs84ToEcef(GEO_REGIONS.yosemite.lat, GEO_REGIONS.yosemite.lng, GEO_REGIONS.yosemite.altMsl);
    const radius = Math.hypot(ecef.x, ecef.y, ecef.z);
    expect(radius).toBeGreaterThan(6_360_000);
    expect(radius).toBeLessThan(6_390_000);

    const mat = ecefToEnuMatrix(GEO_REGIONS.manhattan.lat, GEO_REGIONS.manhattan.lng);
    expect(mat).toHaveLength(16);
    expect(Math.hypot(mat[0], mat[4], mat[8])).toBeCloseTo(1, 5);
    expect(Math.hypot(mat[1], mat[5], mat[9])).toBeCloseTo(1, 5);
    expect(Math.hypot(mat[2], mat[6], mat[10])).toBeCloseTo(1, 5);

    const tile = latLngToTileXY(36.0544, -112.1401, 12);
    expect(tile.zoom).toBe(12);
    expect(tile.x).toBeGreaterThan(0);
    expect(tile.y).toBeGreaterThan(0);
    expect(decodeTerrariumRgb(128, 0, 0)).toBe(0);
    expect(decodeTerrariumRgb(133, 200, 0)).toBe(1480);
  });

  it('populates distinct 64x64 regional DEM heightmaps and supports custom GPS coordinates', () => {
    const yos = new Float32Array(64 * 64);
    const nyc = new Float32Array(64 * 64);
    fillProceduralDem('yosemite', 37.7459, -119.5332, yos);
    fillProceduralDem('manhattan', 40.7081, -74.0113, nyc);
    // Yosemite outer canyon wall is much taller than Manhattan flat island surface
    expect(Math.max(...yos)).toBeGreaterThan(Math.max(...nyc) + 40);

    selectCustomGps(36.0544, -112.1401, 'Grand Canyon');
    expect(geoRuntime.regionId).toBe('custom');
    expect(GEO_REGIONS.custom.lat).toBeCloseTo(36.0544, 4);
    expect(GEO_REGIONS.custom.lng).toBeCloseTo(-112.1401, 4);
  });

  it('updates live GPS coordinates as the player flies in local Three.js meters', () => {
    const startGps = meterOffsetToLatLng(40.7074, -74.0113, 42, 0, 0, 0);
    const northEastGps = meterOffsetToLatLng(40.7074, -74.0113, 42, 250, 120, -500);
    expect(northEastGps.lat).toBeGreaterThan(startGps.lat);
    expect(northEastGps.lng).toBeGreaterThan(startGps.lng);
    expect(northEastGps.altMsl).toBe(162);
  });

  it('handles wingsuit dive-to-speed conversion, skim multiplier, and 6-gate course timer', () => {
    selectGeoRegion('yosemite', true);
    const firstGate = geoRuntime.gates[0];
    const vel = { x: 0, y: 0, z: -14 };

    stepGeoWorld({ x: firstGate.x, y: firstGate.y, z: firstGate.z }, vel, true, 0.05);
    expect(firstGate.passed).toBe(true);
    expect(geoRuntime.gatesCleared).toBe(1);
    expect(geoRuntime.courseRunning).toBe(true);
    expect(vel.y).toBeGreaterThanOrEqual(5.5);
    expect(Math.abs(vel.z)).toBeGreaterThan(15);

    // High-speed dive increases horizontal speed without NaN
    const diveVel = { x: 0, y: -4.5, z: -14 };
    stepGeoWorld({ x: 0, y: 22.0, z: 10 }, diveVel, true, 0.2);
    expect(geoRuntime.diving).toBe(true);
    expect(Math.abs(diveVel.z)).toBeGreaterThan(14);
    expect(geoRuntime.skimActive).toBe(true);
    expect(geoRuntime.skimMultiplier).toBeGreaterThan(1.0);

    // Braking / low horizontal speed descent never triggers dive thrust or NaN
    const brakeVel = { x: 0, y: -3.0, z: -0.2 };
    stepGeoWorld({ x: 0, y: 25.0, z: 10 }, brakeVel, true, 0.1);
    expect(geoRuntime.diving).toBe(false);
    expect(brakeVel.z).toBeCloseTo(-0.2, 5);
  });
});
