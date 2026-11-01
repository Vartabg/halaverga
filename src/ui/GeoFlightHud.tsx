'use client';
import { useEffect, useState } from 'react';
import { fetchGoogle3dTileUrls, geoRuntime, selectCustomGps, selectGeoRegion, type GeoRegionId } from '@/game/geoWorld';
import { gowRuntime } from '@/game/gowTypes';
import { useGame } from '@/game/store';
import styles from './GeoFlightHud.module.css';

interface GeoHudSnapshot {
  regionId: GeoRegionId;
  gatesCleared: number;
  skimMeters: number;
  skimActive: boolean;
  skimMultiplier: number;
  diving: boolean;
  courseRunning: boolean;
  courseTimeSec: number;
  bestTimeSec: number | null;
  airspeedKmh: number;
  liveLat: number;
  liveLng: number;
  liveAltMsl: number;
  demStatus: 'procedural' | 'streaming' | 'live-dem';
  tileStatus: 'offline-curated' | 'connecting' | 'streaming';
}

function readGeoSnap(): GeoHudSnapshot {
  return {
    regionId: geoRuntime.regionId,
    gatesCleared: geoRuntime.gatesCleared,
    skimMeters: Math.round(geoRuntime.skimMeters),
    skimActive: geoRuntime.skimActive,
    skimMultiplier: geoRuntime.skimMultiplier,
    diving: geoRuntime.diving,
    courseRunning: geoRuntime.courseRunning,
    courseTimeSec: geoRuntime.courseTimeSec,
    bestTimeSec: geoRuntime.bestTimeSec,
    airspeedKmh: geoRuntime.airspeedKmh,
    liveLat: geoRuntime.liveLat,
    liveLng: geoRuntime.liveLng,
    liveAltMsl: geoRuntime.liveAltMsl,
    demStatus: geoRuntime.demStatus,
    tileStatus: geoRuntime.tileStatus,
  };
}

const REGION_ORDER: { id: GeoRegionId; label: string }[] = [
  { id: 'yosemite', label: 'Yosemite' },
  { id: 'manhattan', label: 'Manhattan' },
  { id: 'alps', label: 'Swiss Alps' },
  { id: 'hermon', label: 'Mt. Hermon' },
];

export default function GeoFlightHud() {
  const state = useGame();
  const [snap, setSnap] = useState<GeoHudSnapshot>(readGeoSnap);
  const [panelMode, setPanelMode] = useState<'none' | 'gps' | 'tiles'>('none');
  const [gpsInput, setGpsInput] = useState('36.0544, -112.1401');
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || sessionStorage.getItem('halaverga-gmaps-key') || '';
  });

  useEffect(() => {
    if (!state.started || state.paused) return;
    const id = window.setInterval(() => setSnap(readGeoSnap()), 120);
    return () => window.clearInterval(id);
  }, [state.started, state.paused]);

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (envKey) {
      geoRuntime.tilesMode = 'google3d';
      void fetchGoogle3dTileUrls(envKey);
    }
  }, []);

  if (
    !state.started || state.paused || state.panel || state.journal ||
    state.controlsOpen || state.voteOpen || state.tapControls ||
    state.touchScheme === 'twin' || gowRuntime.duelEngaged
  ) {
    return null;
  }

  const latDir = snap.liveLat >= 0 ? 'N' : 'S', lngDir = snap.liveLng >= 0 ? 'E' : 'W';
  const gpsLine = `${Math.abs(snap.liveLat).toFixed(4)}° ${latDir} · ${Math.abs(snap.liveLng).toFixed(4)}° ${lngDir} · ${snap.liveAltMsl}M MSL · ${snap.airspeedKmh} KM/H`;
  const timePart = snap.courseRunning || snap.courseTimeSec > 0 ? ` · ${snap.courseTimeSec.toFixed(1)}s` : '';
  const pbPart = snap.bestTimeSec ? ` (PB ${snap.bestTimeSec.toFixed(1)}s)` : '';

  const applyCustomCoords = (raw: string, label = 'Custom GPS') => {
    const parts = raw.split(',').map(s => Number(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      selectCustomGps(parts[0], parts[1], label);
      setSnap(readGeoSnap());
      setPanelMode('none');
    }
  };

  return (
    <aside className={styles.hud} data-testid="geo-flight-hud" aria-label="Google Earth 3D Drop Zones and Sky-Gate Telemetry">
      <div className={styles.card}>
        <div className={styles.topRow}>
          <span className={styles.gps} data-testid="geo-gps-readout">{gpsLine}</span>
          <span className={styles.stats} data-testid="geo-gate-stats">
            Gates {snap.gatesCleared}/6 · Skim {snap.skimMeters}m ({snap.skimMultiplier.toFixed(1)}x){snap.skimActive || snap.diving ? ' ⚡' : ''}{timePart}{pbPart}
          </span>
        </div>
        <div className={styles.pills} role="group" aria-label="Real-world 3D drop zones">
          {REGION_ORDER.map(r => (
            <button
              key={r.id}
              type="button"
              data-testid={`geo-region-${r.id}`}
              aria-pressed={snap.regionId === r.id}
              className={`${styles.pill} ${snap.regionId === r.id ? styles.pillActive : ''}`}
              onClick={() => { selectGeoRegion(r.id, true); setSnap(readGeoSnap()); }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="geo-custom-gps-toggle"
            aria-pressed={snap.regionId === 'custom'}
            aria-expanded={panelMode === 'gps'}
            className={`${styles.pill} ${snap.regionId === 'custom' ? styles.pillActive : ''}`}
            onClick={() => setPanelMode(m => (m === 'gps' ? 'none' : 'gps'))}
          >
            Fly Any GPS
          </button>
          <button
            type="button"
            data-testid="geo-tiles-toggle"
            aria-expanded={panelMode === 'tiles'}
            className={styles.tilesBtn}
            onClick={() => setPanelMode(m => (m === 'tiles' ? 'none' : 'tiles'))}
          >
            {snap.tileStatus === 'streaming' ? 'Google 3D: Live' : snap.demStatus === 'live-dem' ? 'DEM: Live · 3D Tiles' : 'Google 3D Tiles'}
          </button>
        </div>
        {panelMode === 'gps' && (
          <div className={styles.tilesRow}>
            <input
              type="text"
              aria-label="Custom Latitude and Longitude"
              data-testid="geo-custom-gps-input"
              placeholder="Lat, Lng (e.g. 36.0544, -112.1401)"
              className={styles.keyInput}
              value={gpsInput}
              onChange={e => setGpsInput(e.target.value)}
            />
            <button type="button" data-testid="geo-custom-gps-go" className={styles.tilesBtn} onClick={() => applyCustomCoords(gpsInput)}>
              Fly Here
            </button>
            <button type="button" className={styles.tilesBtn} onClick={() => { setGpsInput('36.0544, -112.1401'); applyCustomCoords('36.0544, -112.1401', 'Grand Canyon'); }}>
              Grand Canyon
            </button>
            <button type="button" className={styles.tilesBtn} onClick={() => { setGpsInput('27.9881, 86.9250'); applyCustomCoords('27.9881, 86.9250', 'Mt. Everest'); }}>
              Everest
            </button>
          </div>
        )}
        {panelMode === 'tiles' && (
          <div className={styles.tilesRow}>
            <input
              type="password"
              aria-label="Google Maps 3D Tiles API Key"
              placeholder="Map Tiles API key..."
              className={styles.keyInput}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button
              type="button"
              className={styles.tilesBtn}
              onClick={() => {
                if (typeof window !== 'undefined') sessionStorage.setItem('halaverga-gmaps-key', apiKey.trim());
                geoRuntime.tilesMode = apiKey.trim() ? 'google3d' : 'curated';
                void fetchGoogle3dTileUrls(apiKey).then(() => setSnap(readGeoSnap()));
                setPanelMode('none');
              }}
            >
              Connect 3D Tiles
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
