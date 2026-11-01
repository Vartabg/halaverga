import { beforeEach, describe, expect, it } from 'vitest';
import {
  ecefToEnuMatrix,
  GEO_REGIONS,
  geoRuntime,
  meterOffsetToLatLng,
  selectGeoRegion,
  stepGeoWorld,
  wgs84ToEcef,
} from '@/game/geoWorld';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

describe('Google Maps 3D World & Sky-Gate Coordinate Engine', () => {
  beforeEach(() => {
    useGame.setState({ flying: false, landing: false, muted: true });
    runtime.position.x = 0;
    runtime.position.y = 20;
    runtime.position.z = 68;
    selectGeoRegion('yosemite', false);
  });

  it('converts WGS84 (lat, lng, alt) into ECEF and builds an orthonormal ENU matrix', () => {
    const ecef = wgs84ToEcef(GEO_REGIONS.yosemite.lat, GEO_REGIONS.yosemite.lng, GEO_REGIONS.yosemite.altMsl);
    const radius = Math.hypot(ecef.x, ecef.y, ecef.z);
    expect(radius).toBeGreaterThan(6_360_000);
    expect(radius).toBeLessThan(6_390_000);

    const mat = ecefToEnuMatrix(GEO_REGIONS.manhattan.lat, GEO_REGIONS.manhattan.lng);
    expect(mat).toHaveLength(16);
    // Column 0 (East), Column 1 (Up), Column 2 (South) should each have unit length
    const eastLen = Math.hypot(mat[0], mat[4], mat[8]);
    const upLen = Math.hypot(mat[1], mat[5], mat[9]);
    const southLen = Math.hypot(mat[2], mat[6], mat[10]);
    expect(eastLen).toBeCloseTo(1, 5);
    expect(upLen).toBeCloseTo(1, 5);
    expect(southLen).toBeCloseTo(1, 5);
  });

  it('updates live GPS coordinates as the player flies in local Three.js meters', () => {
    const startGps = meterOffsetToLatLng(40.7074, -74.0113, 42, 0, 0, 0);
    const northEastGps = meterOffsetToLatLng(40.7074, -74.0113, 42, 250, 120, -500);
    expect(northEastGps.lat).toBeGreaterThan(startGps.lat);
    expect(northEastGps.lng).toBeGreaterThan(startGps.lng);
    expect(northEastGps.altMsl).toBe(162);
  });

  it('switches across all 4 Real-World Drop Zones, awakens Sky-Gates with thermal boost, and tracks proximity skimming', () => {
    for (const id of ['yosemite', 'manhattan', 'alps', 'hermon'] as const) {
      selectGeoRegion(id, true);
      expect(geoRuntime.regionId).toBe(id);
      expect(geoRuntime.gates).toHaveLength(6);
      expect(geoRuntime.gatesCleared).toBe(0);
      expect(useGame.getState().flying).toBe(true);
    }

    selectGeoRegion('yosemite', true);
    const firstGate = geoRuntime.gates[0];
    const pos = { x: firstGate.x, y: firstGate.y, z: firstGate.z };
    const vel = { x: 0, y: 0, z: -14 };

    stepGeoWorld(pos, vel, true, 0.05);
    expect(firstGate.passed).toBe(true);
    expect(geoRuntime.gatesCleared).toBe(1);
    expect(vel.y).toBeGreaterThanOrEqual(5.5);
    expect(Math.abs(vel.z)).toBeGreaterThan(15);
    expect(geoRuntime.banner).toContain('SKY-GATE 1/6 AWAKENED');

    // Proximity skim near terrain (y <= 25.5 at speed >= 9 m/s)
    stepGeoWorld({ x: 0, y: 22.0, z: 10 }, { x: 0, y: 0, z: -15 }, true, 0.2);
    expect(geoRuntime.skimActive).toBe(true);
    expect(geoRuntime.skimMeters).toBeGreaterThan(2);
  });
});
