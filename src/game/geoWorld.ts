import { setVec, START } from './motion';
import { presentation } from './presentation';
import { runtime } from './runtime';
import { useGame } from './store';

export type GeoRegionId = 'yosemite' | 'manhattan' | 'alps' | 'hermon';
export interface SkyGate { id: number; x: number; y: number; z: number; radius: number; passed: boolean }
export interface GeoLandmark { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string }
export interface GeoRegionSpec {
  id: GeoRegionId; name: string; subtitle: string; lat: number; lng: number; altMsl: number;
  accent: string; towerColor: string; gates: Omit<SkyGate, 'passed'>[]; landmarks: GeoLandmark[];
}

const WGS84_A = 6378137.0, WGS84_E2 = 6.69437999014e-3;

export function wgs84ToEcef(latDeg: number, lngDeg: number, altM = 0): { x: number; y: number; z: number } {
  const lat = (latDeg * Math.PI) / 180, lng = (lngDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), sinLng = Math.sin(lng), cosLng = Math.cos(lng);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return { x: (n + altM) * cosLat * cosLng, y: (n + altM) * cosLat * sinLng, z: (n * (1 - WGS84_E2) + altM) * sinLat };
}

/** Returns column-major 4x4 matrix transforming ECEF delta into Three.js local meters (X=East, Y=Up, Z=South/-North). */
export function ecefToEnuMatrix(latDeg: number, lngDeg: number): number[] {
  const lat = (latDeg * Math.PI) / 180, lng = (lngDeg * Math.PI) / 180;
  const sLat = Math.sin(lat), cLat = Math.cos(lat), sLng = Math.sin(lng), cLng = Math.cos(lng);
  return [-sLng, cLat * cLng, sLat * cLng, 0, cLng, cLat * sLng, sLat * sLng, 0, 0, sLat, -cLat, 0, 0, 0, 0, 1];
}

export function meterOffsetToLatLng(baseLat: number, baseLng: number, baseAlt: number, xEast: number, yUp: number, zSouth: number) {
  const northM = -zSouth, dLat = (northM / WGS84_A) * (180 / Math.PI);
  const cosLat = Math.max(0.1, Math.cos((baseLat * Math.PI) / 180)), dLng = (xEast / (WGS84_A * cosLat)) * (180 / Math.PI);
  return { lat: Number((baseLat + dLat).toFixed(5)), lng: Number((baseLng + dLng).toFixed(5)), altMsl: Math.round(baseAlt + yUp) };
}

export const GEO_REGIONS: Record<GeoRegionId, GeoRegionSpec> = {
  yosemite: {
    id: 'yosemite', name: 'Yosemite Valley', subtitle: 'Half Dome & El Capitan Granite Canyon',
    lat: 37.7459, lng: -119.5332, altMsl: 1480, accent: '#ffd166', towerColor: '#7a746c',
    gates: [
      { id: 1, x: 0, y: 29, z: 24, radius: 5.2 }, { id: 2, x: -12, y: 34, z: -6, radius: 5.2 },
      { id: 3, x: 8, y: 40, z: -38, radius: 5.2 }, { id: 4, x: -14, y: 46, z: -72, radius: 5.2 },
      { id: 5, x: 6, y: 52, z: -106, radius: 5.5 }, { id: 6, x: 0, y: 58, z: -138, radius: 6.0 },
    ],
    landmarks: [
      { x: -34, y: 48, z: 10, sx: 22, sy: 96, sz: 28, color: '#6d675e' },
      { x: 36, y: 54, z: -18, sx: 24, sy: 108, sz: 30, color: '#7c756b' },
      { x: -38, y: 62, z: -56, sx: 26, sy: 124, sz: 34, color: '#645f57' },
      { x: 32, y: 68, z: -92, sx: 28, sy: 136, sz: 32, color: '#857e73' },
    ],
  },
  manhattan: {
    id: 'manhattan', name: 'Manhattan Skyline', subtitle: 'Lower Financial Canyon & Hudson Bay',
    lat: 40.7074, lng: -74.0113, altMsl: 42, accent: '#5ee6d0', towerColor: '#3a4b5c',
    gates: [
      { id: 1, x: 0, y: 28, z: 24, radius: 5.0 }, { id: 2, x: 10, y: 35, z: -8, radius: 5.0 },
      { id: 3, x: -10, y: 42, z: -40, radius: 5.0 }, { id: 4, x: 12, y: 38, z: -74, radius: 5.0 },
      { id: 5, x: -8, y: 48, z: -108, radius: 5.2 }, { id: 6, x: 0, y: 56, z: -140, radius: 5.8 },
    ],
    landmarks: [
      { x: -22, y: 45, z: 12, sx: 12, sy: 90, sz: 12, color: '#394a59' },
      { x: 22, y: 52, z: 6, sx: 14, sy: 104, sz: 14, color: '#465a6b' },
      { x: -24, y: 60, z: -26, sx: 14, sy: 120, sz: 14, color: '#2f3e4d' },
      { x: 24, y: 66, z: -58, sx: 15, sy: 132, sz: 15, color: '#4d6375' },
      { x: -22, y: 56, z: -90, sx: 14, sy: 112, sz: 14, color: '#3b4d5e' },
      { x: 22, y: 72, z: -122, sx: 16, sy: 144, sz: 16, color: '#526a7d' },
    ],
  },
  alps: {
    id: 'alps', name: 'Swiss Alps · Matterhorn', subtitle: 'Zermatt Glacial Horn & Thermal Cols',
    lat: 45.9766, lng: 7.6585, altMsl: 3260, accent: '#7ce8ff', towerColor: '#b8c7d6',
    gates: [
      { id: 1, x: 0, y: 30, z: 24, radius: 5.2 }, { id: 2, x: -14, y: 38, z: -10, radius: 5.2 },
      { id: 3, x: 14, y: 46, z: -44, radius: 5.2 }, { id: 4, x: -10, y: 54, z: -78, radius: 5.4 },
      { id: 5, x: 10, y: 62, z: -112, radius: 5.5 }, { id: 6, x: 0, y: 70, z: -144, radius: 6.0 },
    ],
    landmarks: [
      { x: -30, y: 55, z: 4, sx: 20, sy: 110, sz: 20, color: '#9fb0c2' },
      { x: 32, y: 64, z: -30, sx: 22, sy: 128, sz: 22, color: '#b5c4d4' },
      { x: -34, y: 72, z: -68, sx: 24, sy: 144, sz: 24, color: '#8fa1b3' },
      { x: 28, y: 80, z: -108, sx: 26, sy: 160, sz: 26, color: '#c4d2e0' },
    ],
  },
  hermon: {
    id: 'hermon', name: 'Mount Hermon', subtitle: 'Sunlit Dawn Massif & Cedar Ridges',
    lat: 33.4162, lng: 35.8570, altMsl: 2814, accent: '#ffae42', towerColor: '#8c7d6b',
    gates: [
      { id: 1, x: 0, y: 28, z: 24, radius: 5.2 }, { id: 2, x: 12, y: 33, z: -8, radius: 5.2 },
      { id: 3, x: -12, y: 39, z: -40, radius: 5.2 }, { id: 4, x: 10, y: 45, z: -74, radius: 5.2 },
      { id: 5, x: -10, y: 51, z: -108, radius: 5.5 }, { id: 6, x: 0, y: 58, z: -140, radius: 6.0 },
    ],
    landmarks: [
      { x: -32, y: 42, z: -12, sx: 18, sy: 84, sz: 18, color: '#8c7d6b' },
      { x: 32, y: 46, z: -48, sx: 20, sy: 92, sz: 20, color: '#7d6f5f' },
    ],
  },
};

export const geoRuntime = {
  regionId: 'yosemite' as GeoRegionId,
  gates: GEO_REGIONS.yosemite.gates.map(g => ({ ...g, passed: false })) as SkyGate[],
  gatesCleared: 0, skimMeters: 0, skimActive: false, thermalTimer: 0,
  banner: 'YOSEMITE VALLEY • THREAD THE 6 SKY-GATES',
  liveLat: 37.7459, liveLng: -119.5332, liveAltMsl: 1500,
  tilesMode: 'curated' as 'curated' | 'google3d',
  tileStatus: 'offline-curated' as 'offline-curated' | 'connecting' | 'streaming',
  streamedGlbUrls: [] as string[],
};

let chimeCtx: AudioContext | null = null;
function playGateChime(step: number) {
  if (typeof window === 'undefined' || useGame.getState().muted) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!chimeCtx) chimeCtx = new Ctx();
    if (chimeCtx.state === 'suspended') void chimeCtx.resume();
    const now = chimeCtx.currentTime, osc = chimeCtx.createOscillator(), gain = chimeCtx.createGain();
    const note = [523.25, 659.25, 783.99, 1046.5, 1174.66, 1318.5][(step - 1) % 6];
    osc.type = 'triangle'; osc.frequency.setValueAtTime(note, now); osc.frequency.exponentialRampToValueAtTime(note * 1.25, now + 0.28);
    gain.gain.setValueAtTime(0.14, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain); gain.connect(chimeCtx.destination); osc.start(now); osc.stop(now + 0.33);
  } catch { /* ignore headless audio errors */ }
}

export function selectGeoRegion(id: GeoRegionId, launchFlight = false) {
  const spec = GEO_REGIONS[id];
  Object.assign(geoRuntime, {
    regionId: id, gates: spec.gates.map(g => ({ ...g, passed: false })), gatesCleared: 0, thermalTimer: 0,
    banner: `${spec.name.toUpperCase()} • THREAD THE 6 SKY-GATES`,
  });
  const gps = meterOffsetToLatLng(spec.lat, spec.lng, spec.altMsl, runtime.position.x, runtime.position.y, runtime.position.z);
  geoRuntime.liveLat = gps.lat; geoRuntime.liveLng = gps.lng; geoRuntime.liveAltMsl = gps.altMsl;
  if (launchFlight) {
    setVec(runtime.position, START.x, 26, 48); setVec(presentation.position, START.x, 26, 48); setVec(runtime.velocity, 0, 2.5, -12);
    runtime.yaw = 0; runtime.pitch = 0.05; runtime.poseEpoch++; useGame.setState({ flying: true, landing: false });
  }
}

export function stepGeoWorld(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, flying: boolean, dt: number) {
  const spec = GEO_REGIONS[geoRuntime.regionId];
  const gps = meterOffsetToLatLng(spec.lat, spec.lng, spec.altMsl, pos.x, pos.y, pos.z);
  geoRuntime.liveLat = gps.lat; geoRuntime.liveLng = gps.lng; geoRuntime.liveAltMsl = gps.altMsl;
  geoRuntime.thermalTimer = Math.max(0, geoRuntime.thermalTimer - dt);
  const spd = Math.hypot(vel.x, vel.y, vel.z);
  const nearWall = spec.landmarks.some(l => Math.abs(pos.x - l.x) < l.sx * 0.5 + 10 && Math.abs(pos.z - l.z) < l.sz * 0.5 + 10);
  geoRuntime.skimActive = flying && spd >= 9.0 && (pos.y <= 25.5 || nearWall);
  if (geoRuntime.skimActive) geoRuntime.skimMeters += spd * dt;
  if (!flying) return;
  for (const g of geoRuntime.gates) {
    if (g.passed || Math.hypot(pos.x - g.x, pos.y - g.y, pos.z - g.z) > g.radius + 1.8) continue;
    g.passed = true; geoRuntime.gatesCleared++; geoRuntime.thermalTimer = 1.25;
    vel.y = Math.max(vel.y + 4.5, 5.5); vel.x *= 1.15; vel.z *= 1.15; playGateChime(geoRuntime.gatesCleared);
    geoRuntime.banner = geoRuntime.gatesCleared >= 6 ? `ALL 6 ${spec.name.toUpperCase()} SKY-GATES AWAKENED!` : `SKY-GATE ${geoRuntime.gatesCleared}/6 AWAKENED • THERMAL BOOST!`;
  }
}

export async function fetchGoogle3dTileUrls(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) { geoRuntime.tileStatus = 'offline-curated'; return []; }
  geoRuntime.tileStatus = 'connecting';
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey.trim())}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json(), uri: string | undefined = json?.root?.content?.uri ?? json?.root?.children?.[0]?.content?.uri;
    geoRuntime.tileStatus = 'streaming';
    geoRuntime.streamedGlbUrls = uri && uri.endsWith('.glb') ? [`https://tile.googleapis.com${uri.startsWith('/') ? '' : '/'}${uri}`] : [];
    return geoRuntime.streamedGlbUrls;
  } catch {
    geoRuntime.tileStatus = 'offline-curated'; geoRuntime.streamedGlbUrls = []; return [];
  } finally {
    clearTimeout(timer);
  }
}
