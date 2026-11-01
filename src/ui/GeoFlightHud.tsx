'use client';
import { useEffect, useState } from 'react';
import { fetchGoogle3dTileUrls, GEO_REGIONS, geoRuntime, selectGeoRegion, type GeoRegionId } from '@/game/geoWorld';
import { gowRuntime } from '@/game/gowTypes';
import { useGame } from '@/game/store';
import styles from './GeoFlightHud.module.css';

interface GeoHudSnapshot {
  regionId: GeoRegionId;
  gatesCleared: number;
  skimMeters: number;
  skimActive: boolean;
  banner: string;
  liveLat: number;
  liveLng: number;
  liveAltMsl: number;
  tileStatus: 'offline-curated' | 'connecting' | 'streaming';
}

function readGeoSnap(): GeoHudSnapshot {
  return {
    regionId: geoRuntime.regionId,
    gatesCleared: geoRuntime.gatesCleared,
    skimMeters: Math.round(geoRuntime.skimMeters),
    skimActive: geoRuntime.skimActive,
    banner: geoRuntime.banner,
    liveLat: geoRuntime.liveLat,
    liveLng: geoRuntime.liveLng,
    liveAltMsl: geoRuntime.liveAltMsl,
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
  const [keyOpen, setKeyOpen] = useState(false);
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
    !state.started ||
    state.paused ||
    state.panel ||
    state.journal ||
    state.controlsOpen ||
    state.voteOpen ||
    state.tapControls ||
    state.touchScheme === 'twin' ||
    gowRuntime.duelEngaged
  ) {
    return null;
  }

  const latDir = snap.liveLat >= 0 ? 'N' : 'S';
  const lngDir = snap.liveLng >= 0 ? 'E' : 'W';
  const gpsLine = `${Math.abs(snap.liveLat).toFixed(4)}° ${latDir} · ${Math.abs(snap.liveLng).toFixed(4)}° ${lngDir} · ${snap.liveAltMsl}M MSL`;

  return (
    <aside className={styles.hud} data-testid="geo-flight-hud" aria-label="Google Earth 3D Drop Zones and Sky-Gate Telemetry">
      <div className={styles.card}>
        <div className={styles.topRow}>
          <span className={styles.gps} data-testid="geo-gps-readout">{gpsLine}</span>
          <span className={styles.stats} data-testid="geo-gate-stats">
            Gates {snap.gatesCleared}/6 · Skim {snap.skimMeters}m {snap.skimActive ? '⚡' : ''}
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
              onClick={() => {
                selectGeoRegion(r.id, true);
                setSnap(readGeoSnap());
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="geo-tiles-toggle"
            aria-expanded={keyOpen}
            className={styles.tilesBtn}
            onClick={() => setKeyOpen(v => !v)}
          >
            {snap.tileStatus === 'streaming' ? 'Google 3D: Live' : 'Google 3D Tiles'}
          </button>
        </div>
        {keyOpen && (
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
                setKeyOpen(false);
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
