import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAZE, SEA_BODY, SUN_UV, acesFilmic, type Rgb } from '@/world/atmospherePalette';
import { makeCity } from '@/world/cityData';
import { BACKDROP_SUN } from '@/world/backdropData';

describe('painted dawn backdrop (replaces the procedural distant ranges, 2026-11-16)', () => {
  it('ships one 2048x1024 sRGB equirect, small, with its provenance written down', () => {
    const jpg = readFileSync('public/textures/sky/hermon-dawn.jpg');
    expect(jpg.length).toBeLessThan(1_500_000);
    let w = 0, h = 0;
    for (let i = 2; i < jpg.length - 9; i += 2 + jpg.readUInt16BE(i + 2)) if (jpg[i] === 0xff && jpg[i + 1] >= 0xc0 && jpg[i + 1] <= 0xc2) { h = jpg.readUInt16BE(i + 5); w = jpg.readUInt16BE(i + 7); break; }
    expect([w, h]).toEqual([2048, 1024]);
    const note = readFileSync('docs/art/hermon-sky/PROVENANCE.md', 'utf8');
    for (const part of ['kiara_1_dawn', 'cliff_side', 'snow_02', 'CC0', 'api.polyhaven.com']) expect(note).toContain(part);
    expect(readFileSync('scripts/art/paint_hermon_sky.py', 'utf8')).toContain(`HAZE = '${HAZE}'`);
    for (const f of ['limestone-cliff.jpg', 'snow.jpg']) expect(statSync(`public/textures/terrain/${f}`).size).toBeLessThan(400_000);
  });
  it('turns the painted sun to the key light azimuth', () => {
    expect(readFileSync('src/world/backdropConst.ts', 'utf8')).toContain('(BACKDROP_SUN.u - SUN_UV[0]) * 2 * Math.PI');
    expect(BACKDROP_SUN.u).toBeGreaterThan(0); expect(BACKDROP_SUN.u).toBeLessThan(1);
  });
  it('is loaded by the scene only (the image may still download while the landing shows), with the procedural dome as its fallback', () => {
    const src = readFileSync('src/world/Backdrop.tsx', 'utf8'), sky = readFileSync('src/world/BackdropSky.tsx', 'utf8');
    for (const part of ['<Boundary', '<Suspense', '<Sky />', 'SRGBColorSpace', '256', 'CanvasTexture']) expect(src).toContain(part);
    expect(src.indexOf('map.colorSpace = SRGBColorSpace')).toBeLessThan(src.indexOf('<EnvironmentLight'));
    for (const part of ['BackSide', 'fog={false}', 'toneMapped={false}', 'depthWrite={false}', 'camera.position', 'gl_Position.z = gl_Position.w']) expect(sky).toContain(part);
    expect(sky).toContain('BACKDROP_TURN'); expect(src).not.toContain('scene.background');
    expect(readFileSync('src/world/Suit.tsx', 'utf8')).toContain('useLoader.clear(TextureLoader, BACKDROP_URL)');
    for (const dir of ['src/ui', 'src/app']) for (const f of ['Landing.tsx', 'Experience.tsx', 'layout.tsx']) {
      try { expect(readFileSync(`${dir}/${f}`, 'utf8')).not.toContain('hermon-dawn'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    expect(readFileSync('src/world/Scene.tsx', 'utf8')).not.toContain('<Skyline');
  });
  it('knows the dawn water colour and keeps the ACES twin monotonic', () => {
    const enc = (x: number) => Math.round(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055));
    const [r, g, b] = SEA_BODY.map(enc);
    expect(Math.abs(r - 11)).toBeLessThanOrEqual(3); expect(Math.abs(g - 22)).toBeLessThanOrEqual(3); expect(Math.abs(b - 31)).toBeLessThanOrEqual(3);
    const grey = (x: number): Rgb => [x, x, x];
    let last = -1; for (const x of [.01, .05, .18, .5, 1, 4]) { const v = acesFilmic(grey(x))[1]; expect(v).toBeGreaterThan(last); last = v; }
  });
  it('keeps distant geometry out of the sanctuary mesh and preserves material group indices', () => {
    const city = makeCity();
    expect(city.terrains.length).toBeGreaterThan(0);
    expect(city.geometry.groups.length).toBeGreaterThan(0);
    for (const group of city.geometry.groups) {
      expect(group.count).toBeGreaterThan(0);
      expect(group.materialIndex).toBeGreaterThanOrEqual(0);
      expect(group.materialIndex).toBeLessThanOrEqual(6);
    }
    city.geometry.dispose(); city.terrains.forEach(t => t.geometry.dispose());
  });
  it('has a ring past the world edge that joins the strips and never ends in a cut', async () => {
    const { makeEdgeRing, RING } = await import('@/world/edgeRingData');
    const { heightAt } = await import('@/world/massifData');
    const ring = makeEdgeRing(), p = ring.geometry.attributes.position, n = ring.geometry.attributes.normal;
    let rim = 0, lowest = Infinity;
    for (let i = 0; i < p.count; i++) {
      lowest = Math.min(lowest, p.getY(i));
      const onEdge = Math.abs(Math.abs(p.getX(i)) - 420) < 1e-3 || Math.abs(p.getZ(i) + 430) < 1e-3 || Math.abs(p.getZ(i) - 300) < 1e-3;
      if (onEdge && Math.hypot(Math.max(0, Math.abs(p.getX(i)) - 420), Math.max(0, -430 - p.getZ(i), p.getZ(i) - 300)) < 1e-3) {
        expect(Math.abs(p.getY(i) - heightAt(p.getX(i), p.getZ(i)))).toBeLessThan(1e-3); rim++;
      }
      expect(n.getY(i)).toBeGreaterThan(-.2);
    }
    expect(rim).toBeGreaterThan(100); expect(lowest).toBeLessThanOrEqual(RING.floor + 1); expect(ring.triangles).toBeLessThan(15000);
    ring.geometry.dispose();
  });
});
