import type { GeoRegionId, GeoRegionSpec } from './geoWorld';

export function latLngToTileXY(latDeg: number, lngDeg: number, zoom = 12) {
  const lat = Math.max(-85, Math.min(85, latDeg)), lng = ((lngDeg + 180) % 360 + 360) % 360 - 180;
  const n = 1 << zoom, latRad = (lat * Math.PI) / 180;
  const fx = ((lng + 180) / 360) * n, fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.max(0, Math.min(n - 1, Math.floor(fx))), y = Math.max(0, Math.min(n - 1, Math.floor(fy)));
  return { zoom, x, y, u: fx - x, v: fy - y };
}

export function decodeTerrariumRgb(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export function fillProceduralDem(regionId: GeoRegionId, lat: number, lng: number, out: Float32Array) {
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453);
  for (let gz = 0; gz < 64; gz++) {
    const wz = (gz / 63 - 0.5) * 340;
    for (let gx = 0; gx < 64; gx++) {
      const wx = (gx / 63 - 0.5) * 340, absX = Math.abs(wx);
      const ridge = Math.sin(wx * 0.045 + seed) * Math.cos(wz * 0.038 - seed) * 14 + Math.sin(wx * 0.11 - wz * 0.09) * 5;
      let h = 10;
      if (regionId === 'yosemite') {
        const wall = Math.pow(Math.max(0, (absX - 20) / 115), 1.45) * 118;
        const river = absX < 9 ? -2.4 * Math.cos((absX / 9) * Math.PI * 0.5) : 0;
        h = 7.5 + river + wall + (absX > 22 ? Math.abs(ridge) * 1.1 : ridge * 0.12);
      } else if (regionId === 'manhattan') {
        const water = absX > 96 || wz < -145;
        h = water ? 2.2 : 7.2 + Math.sin(wx * 0.2) * 0.25;
      } else if (regionId === 'alps') {
        const horn = Math.pow(Math.max(0, (absX - 16) / 110), 1.25) * 132;
        const spire = Math.max(0, 52 - Math.hypot(wx + 44, wz + 55) * 1.15);
        h = 8.5 + horn + spire + Math.abs(ridge) * 1.25;
      } else {
        const canyon = Math.pow(Math.max(0, (absX - 18) / 120), 1.35) * 95;
        h = 9.0 + canyon + ridge * 1.35;
      }
      out[gz * 64 + gx] = h;
    }
  }
}

let demReqEpoch = 0;

export async function fetchTerrariumDem(
  lat: number,
  lng: number,
  target: { demHeights: Float32Array; demVersion: number; demStatus: 'procedural' | 'streaming' | 'live-dem' },
  spec: GeoRegionSpec,
): Promise<boolean> {
  const reqId = ++demReqEpoch;
  if (typeof window === 'undefined' || typeof Image === 'undefined') return false;
  target.demStatus = 'streaming';
  const tile = latLngToTileXY(lat, lng, 12);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile.zoom}/${tile.x}/${tile.y}.png`;
  return new Promise<boolean>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      img.src = '';
      if (reqId === demReqEpoch) target.demStatus = 'procedural';
      resolve(false);
    }, 2500);
    img.onload = () => {
      window.clearTimeout(timer);
      if (reqId !== demReqEpoch) { resolve(false); return; }
      try {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
        const ctx = cv.getContext('2d'); if (!ctx) throw new Error('no 2d');
        ctx.drawImage(img, 0, 0, 256, 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const cx = Math.floor(tile.u * 255), cy = Math.floor(tile.v * 255), cIdx = (cy * 256 + cx) * 4;
        const baseElev = decodeTerrariumRgb(data[cIdx], data[cIdx + 1], data[cIdx + 2]);
        spec.altMsl = Math.max(0, Math.round(baseElev));
        for (let gz = 0; gz < 64; gz++) {
          for (let gx = 0; gx < 64; gx++) {
            const px = Math.max(0, Math.min(255, cx + (gx - 32))), py = Math.max(0, Math.min(255, cy + (gz - 32))), p = (py * 256 + px) * 4;
            const rel = (decodeTerrariumRgb(data[p], data[p + 1], data[p + 2]) - baseElev) * 0.35;
            target.demHeights[gz * 64 + gx] = Math.max(2, target.demHeights[gz * 64 + gx] * 0.65 + (14 + rel) * 0.35);
          }
        }
        target.demStatus = 'live-dem'; target.demVersion++; resolve(true);
      } catch {
        target.demStatus = 'procedural'; resolve(false);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      if (reqId === demReqEpoch) target.demStatus = 'procedural';
      resolve(false);
    };
    img.src = url;
  });
}
