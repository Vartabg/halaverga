import { decodeTerrariumRgb, fetchTerrariumDem, fillProceduralDem, latLngToTileXY } from './geoDem';
import { START, setVec } from './motion';
import { presentation } from './presentation';
import { runtime } from './runtime';
import { useGame } from './store';

export { decodeTerrariumRgb, fillProceduralDem, latLngToTileXY };
export type GeoRegionId = 'yosemite' | 'manhattan' | 'alps' | 'hermon' | 'custom';
export interface SkyGate { id: number; x: number; y: number; z: number; radius: number; passed: boolean; }
export interface GeoLandmark { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; }
export interface GeoRegionSpec {
  id: GeoRegionId; name: string; subtitle: string; lat: number; lng: number; altMsl: number;
  accent: string; towerColor: string; fogColor: string;
  gates: Omit<SkyGate, 'passed'>[]; landmarks: GeoLandmark[];
}

const WGS84_A = 6378137.0, WGS84_E2 = 0.00669437999014;

export function wgs84ToEcef(latDeg: number, lngDeg: number, altMeters: number) {
  const lat = (latDeg * Math.PI) / 180, lng = (lngDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), sinLng = Math.sin(lng), cosLng = Math.cos(lng);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return { x: (n + altMeters) * cosLat * cosLng, y: (n + altMeters) * cosLat * sinLng, z: (n * (1 - WGS84_E2) + altMeters) * sinLat };
}

export function ecefToEnuMatrix(latDeg: number, lngDeg: number): number[] {
  const lat = (latDeg * Math.PI) / 180, lng = (lngDeg * Math.PI) / 180;
  const sLat = Math.sin(lat), cLat = Math.cos(lat), sLng = Math.sin(lng), cLng = Math.cos(lng);
  return [-sLng, -sLat * cLng, cLat * cLng, 0, cLng, -sLat * sLng, cLat * sLng, 0, 0, cLat, sLat, 0, 0, 0, 0, 1];
}

export function meterOffsetToLatLng(baseLat: number, baseLng: number, baseAlt: number, dx: number, dy: number, dz: number) {
  const dLat = -dz / 111320, cosLat = Math.max(0.1, Math.cos((baseLat * Math.PI) / 180)), dLng = dx / (111320 * cosLat);
  return { lat: +(baseLat + dLat).toFixed(5), lng: +(baseLng + dLng).toFixed(5), altMsl: Math.round(baseAlt + dy) };
}

export const GEO_REGIONS: Record<GeoRegionId, GeoRegionSpec> = {
  yosemite: {
    id: 'yosemite', name: 'Yosemite Valley', subtitle: 'El Capitan & Merced River Canyon • 37.7459° N, 119.5332° W',
    lat: 37.7459, lng: -119.5332, altMsl: 1480, accent: '#ffd166', towerColor: '#8d7f71', fogColor: '#c9a682',
    gates: [{ id: 1, x: 0, y: 27, z: 22, radius: 5.2 }, { id: 2, x: -9, y: 31, z: -12, radius: 5.2 }, { id: 3, x: 8, y: 26, z: -48, radius: 5.0 }, { id: 4, x: -6, y: 34, z: -85, radius: 5.0 }, { id: 5, x: 5, y: 29, z: -122, radius: 5.2 }, { id: 6, x: 0, y: 38, z: -158, radius: 6.0 }],
    landmarks: [{ x: -34, y: 45, z: -18, sx: 22, sy: 90, sz: 44, color: '#7a7067' }, { x: 36, y: 50, z: -68, sx: 24, sy: 100, sz: 48, color: '#8a7e72' }, { x: -30, y: 42, z: -120, sx: 20, sy: 84, sz: 40, color: '#6e655f' }],
  },
  manhattan: {
    id: 'manhattan', name: 'Manhattan Skyline', subtitle: 'Lower Manhattan Skyscraper Canyon • 40.7081° N, 74.0113° W',
    lat: 40.7081, lng: -74.0113, altMsl: 42, accent: '#5ee6d0', towerColor: '#3a4c66', fogColor: '#24344d',
    gates: [{ id: 1, x: 0, y: 28, z: 24, radius: 4.8 }, { id: 2, x: 10, y: 33, z: -10, radius: 4.8 }, { id: 3, x: -10, y: 27, z: -45, radius: 4.8 }, { id: 4, x: 8, y: 36, z: -82, radius: 4.8 }, { id: 5, x: -6, y: 30, z: -118, radius: 4.8 }, { id: 6, x: 0, y: 42, z: -155, radius: 5.8 }],
    landmarks: [{ x: -25, y: 54, z: 2, sx: 14, sy: 108, sz: 14, color: '#394b63' }, { x: 25, y: 60, z: -26, sx: 15, sy: 120, sz: 15, color: '#2f4057' }, { x: -24, y: 66, z: -62, sx: 16, sy: 132, sz: 16, color: '#425670' }, { x: 24, y: 56, z: -98, sx: 15, sy: 112, sz: 15, color: '#34465e' }],
  },
  alps: {
    id: 'alps', name: 'Swiss Alps — Matterhorn', subtitle: 'Zermatt Hörnli Ridge • 45.9763° N, 7.6586° E',
    lat: 45.9763, lng: 7.6586, altMsl: 3260, accent: '#7bdff2', towerColor: '#9fb4c7', fogColor: '#8fb4d9',
    gates: [{ id: 1, x: 0, y: 30, z: 20, radius: 5.4 }, { id: 2, x: -12, y: 35, z: -16, radius: 5.2 }, { id: 3, x: 11, y: 31, z: -52, radius: 5.2 }, { id: 4, x: -9, y: 39, z: -88, radius: 5.2 }, { id: 5, x: 7, y: 34, z: -125, radius: 5.4 }, { id: 6, x: 0, y: 45, z: -162, radius: 6.2 }],
    landmarks: [{ x: -32, y: 56, z: -22, sx: 24, sy: 112, sz: 34, color: '#8ea2b5' }, { x: 34, y: 62, z: -74, sx: 26, sy: 124, sz: 36, color: '#a3b7ca' }],
  },
  hermon: {
    id: 'hermon', name: 'Mount Hermon Summit', subtitle: 'Levant Anti-Lebanon Massif • 33.4162° N, 35.8570° E',
    lat: 33.4162, lng: 35.8570, altMsl: 2814, accent: '#ffbe55', towerColor: '#8c7d6b', fogColor: '#cdb496',
    gates: [{ id: 1, x: 0, y: 26, z: 26, radius: 5.2 }, { id: 2, x: -8, y: 32, z: -6, radius: 5.2 }, { id: 3, x: 8, y: 38, z: -40, radius: 5.2 }, { id: 4, x: 0, y: 44, z: -74, radius: 5.5 }, { id: 5, x: -10, y: 51, z: -108, radius: 5.5 }, { id: 6, x: 0, y: 58, z: -140, radius: 6.0 }],
    landmarks: [{ x: -32, y: 42, z: -12, sx: 18, sy: 84, sz: 18, color: '#8c7d6b' }, { x: 32, y: 46, z: -48, sx: 20, sy: 92, sz: 20, color: '#7d6f5f' }],
  },
  custom: {
    id: 'custom', name: 'Custom Earth DEM', subtitle: 'Global AWS Terrarium Elevation Stream',
    lat: 36.0544, lng: -112.1401, altMsl: 1850, accent: '#ff9f1c', towerColor: '#9c6644', fogColor: '#c29576',
    gates: [{ id: 1, x: 0, y: 28, z: 22, radius: 5.2 }, { id: 2, x: -9, y: 32, z: -14, radius: 5.2 }, { id: 3, x: 9, y: 28, z: -50, radius: 5.2 }, { id: 4, x: -7, y: 35, z: -86, radius: 5.2 }, { id: 5, x: 6, y: 31, z: -122, radius: 5.2 }, { id: 6, x: 0, y: 40, z: -158, radius: 6.0 }],
    landmarks: [{ x: -32, y: 46, z: -24, sx: 22, sy: 92, sz: 36, color: '#8d5b3e' }, { x: 34, y: 50, z: -76, sx: 24, sy: 100, sz: 38, color: '#9e6b4b' }],
  },
};

const initialDem = new Float32Array(64 * 64);
fillProceduralDem('yosemite', GEO_REGIONS.yosemite.lat, GEO_REGIONS.yosemite.lng, initialDem);

export const geoRuntime = {
  regionId: 'yosemite' as GeoRegionId,
  gates: GEO_REGIONS.yosemite.gates.map(g => ({ ...g, passed: false })) as SkyGate[],
  gatesCleared: 0, skimMeters: 0, skimActive: false, skimMultiplier: 1.0, diving: false, thermalTimer: 0,
  courseRunning: false, courseTimeSec: 0, bestTimeSec: null as number | null, airspeedKmh: 0,
  banner: 'YOSEMITE VALLEY • THREAD THE 6 SKY-GATES',
  liveLat: 37.7459, liveLng: -119.5332, liveAltMsl: 1500,
  demHeights: initialDem, demVersion: 1, demStatus: 'procedural' as 'procedural' | 'streaming' | 'live-dem',
  tilesMode: 'curated' as 'curated' | 'google3d',
  tileStatus: 'offline-curated' as 'offline-curated' | 'connecting' | 'streaming',
  streamedGlbUrls: [] as string[],
};

function readBestTime(id: GeoRegionId): number | null {
  if (typeof window === 'undefined') return null;
  const raw = Number(window.localStorage.getItem(`halaverga:geo-pb:${id}`));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

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

export const streamRealWorldDem = (lat: number, lng: number) => fetchTerrariumDem(lat, lng, geoRuntime, GEO_REGIONS[geoRuntime.regionId]);

export function selectGeoRegion(id: GeoRegionId, launchFlight = false) {
  const spec = GEO_REGIONS[id];
  fillProceduralDem(id, spec.lat, spec.lng, geoRuntime.demHeights);
  Object.assign(geoRuntime, {
    regionId: id, gates: spec.gates.map(g => ({ ...g, passed: false })), gatesCleared: 0, skimMultiplier: 1.0, diving: false,
    thermalTimer: 0, courseRunning: false, courseTimeSec: 0, bestTimeSec: readBestTime(id), demVersion: geoRuntime.demVersion + 1,
    demStatus: 'procedural', banner: `${spec.name.toUpperCase()} • THREAD THE 6 SKY-GATES`,
  });
  const gps = meterOffsetToLatLng(spec.lat, spec.lng, spec.altMsl, runtime.position.x, runtime.position.y, runtime.position.z);
  geoRuntime.liveLat = gps.lat; geoRuntime.liveLng = gps.lng; geoRuntime.liveAltMsl = gps.altMsl;
  void streamRealWorldDem(spec.lat, spec.lng);
  if (launchFlight) {
    setVec(runtime.position, START.x, 26, 48); setVec(presentation.position, START.x, 26, 48); setVec(runtime.velocity, 0, 2.5, -12);
    runtime.yaw = 0; runtime.pitch = 0.05; runtime.poseEpoch++; useGame.setState({ flying: true, landing: false });
  }
}

export function selectCustomGps(lat: number, lng: number, label = 'Custom GPS') {
  GEO_REGIONS.custom.lat = Math.max(-85, Math.min(85, Number(lat) || 0));
  GEO_REGIONS.custom.lng = Math.max(-180, Math.min(180, Number(lng) || 0));
  GEO_REGIONS.custom.name = label; selectGeoRegion('custom', true);
}

export function stepGeoWorld(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, flying: boolean, dt: number) {
  const spec = GEO_REGIONS[geoRuntime.regionId], gps = meterOffsetToLatLng(spec.lat, spec.lng, spec.altMsl, pos.x, pos.y, pos.z);
  geoRuntime.liveLat = gps.lat; geoRuntime.liveLng = gps.lng; geoRuntime.liveAltMsl = gps.altMsl;
  geoRuntime.thermalTimer = Math.max(0, geoRuntime.thermalTimer - dt);
  const hSpd = Math.hypot(vel.x, vel.z), spd = Math.hypot(hSpd, vel.y);
  geoRuntime.airspeedKmh = Math.round(spd * 3.6);
  const nearWall = spec.landmarks.some(l => Math.abs(pos.x - l.x) < l.sx * 0.5 + 11 && Math.abs(pos.z - l.z) < l.sz * 0.5 + 11) || (geoRuntime.regionId !== 'hermon' && Math.abs(pos.x) > 16);
  geoRuntime.skimActive = flying && spd >= 8.5 && (pos.y <= 26.0 || nearWall);
  if (geoRuntime.skimActive) { geoRuntime.skimMeters += spd * dt; geoRuntime.skimMultiplier = Math.min(5.0, +(geoRuntime.skimMultiplier + dt * 0.55).toFixed(2)); }
  else geoRuntime.skimMultiplier = Math.max(1.0, +(geoRuntime.skimMultiplier - dt * 0.25).toFixed(2));
  geoRuntime.diving = flying && hSpd > 3.5 && vel.y < -1.8;
  if (geoRuntime.diving && hSpd < 34) {
    const boost = Math.min(34, hSpd + (-vel.y - 1.5) * 2.4 * dt) / hSpd; vel.x *= boost; vel.z *= boost;
  } else if (flying && vel.y > 1.2 && hSpd > 15.5) vel.y = Math.min(12, vel.y + (hSpd - 15) * 0.35 * dt);
  if (geoRuntime.courseRunning && flying) geoRuntime.courseTimeSec = +(geoRuntime.courseTimeSec + dt).toFixed(2);
  if (!flying) return;
  for (const g of geoRuntime.gates) {
    if (g.passed || Math.hypot(pos.x - g.x, pos.y - g.y, pos.z - g.z) > g.radius + 1.8) continue;
    g.passed = true; geoRuntime.gatesCleared++; geoRuntime.thermalTimer = 1.25;
    if (geoRuntime.gatesCleared === 1 && !geoRuntime.courseRunning) { geoRuntime.courseRunning = true; geoRuntime.courseTimeSec = 0; }
    vel.y = Math.max(vel.y + 4.5, 5.5); vel.x *= 1.15; vel.z *= 1.15; playGateChime(geoRuntime.gatesCleared);
    if (geoRuntime.gatesCleared >= 6) {
      geoRuntime.courseRunning = false;
      const eff = +Math.max(1.0, geoRuntime.courseTimeSec / (1 + (geoRuntime.skimMultiplier - 1) * 0.08)).toFixed(2);
      if (!geoRuntime.bestTimeSec || eff < geoRuntime.bestTimeSec) {
        geoRuntime.bestTimeSec = eff; if (typeof window !== 'undefined') window.localStorage.setItem(`halaverga:geo-pb:${geoRuntime.regionId}`, String(eff));
      }
      geoRuntime.banner = `ALL 6 SKY-GATES AWAKENED • ${eff}S (${geoRuntime.skimMultiplier.toFixed(1)}X)!`;
    } else geoRuntime.banner = `SKY-GATE ${geoRuntime.gatesCleared}/6 • ${geoRuntime.skimMultiplier.toFixed(1)}X FLOW!`;
  }
}

export async function fetchGoogle3dTileUrls(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) { geoRuntime.tileStatus = 'offline-curated'; return []; }
  geoRuntime.tileStatus = 'connecting';
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 3500);
  const absUrl = (u: string) => u.startsWith('http') ? u : `https://tile.googleapis.com${u.startsWith('/') ? '' : '/'}${u}`;
  try {
    const res = await fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey.trim())}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json(), uris: string[] = [];
    const visit = (n: { content?: { uri?: string }; children?: unknown[] } | undefined) => {
      if (!n) return;
      if (n.content?.uri) uris.push(n.content.uri);
      if (Array.isArray(n.children)) for (const c of n.children) visit(c as { content?: { uri?: string }; children?: unknown[] });
    };
    visit(json?.root);
    let glbs = uris.filter(u => u.includes('.glb')).map(absUrl);
    if (!glbs.length) {
      const childJson = uris.find(u => u.includes('.json'));
      if (childJson) {
        const cRes = await fetch(absUrl(childJson), { signal: ctrl.signal });
        if (cRes.ok) { visit((await cRes.json())?.root); glbs = uris.filter(u => u.includes('.glb')).map(absUrl); }
      }
    }
    geoRuntime.tileStatus = 'streaming'; geoRuntime.streamedGlbUrls = glbs; return glbs;
  } catch {
    geoRuntime.tileStatus = 'offline-curated'; geoRuntime.streamedGlbUrls = []; return [];
  } finally {
    clearTimeout(timer);
  }
}
