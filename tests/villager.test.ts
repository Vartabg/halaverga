import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paintBlockGeometry } from '../src/world/paintBlocks';
import { VILLAGER, villagerBlocks } from '../src/world/villagerPose';

describe('village opening figure', () => {
  it('stands on foot with the face toward the arrival camera', () => {
    const parts = villagerBlocks();
    const feet = Math.min(...parts.map(p => p.y - p.h / 2));
    const head = Math.max(...parts.map(p => p.y + p.h / 2));
    expect(feet).toBe(0);
    expect(head).toBeGreaterThan(1.6);
    expect(head).toBeLessThan(2.2);
    const nose = parts.reduce((a, b) => a.z - a.d / 2 < b.z - b.d / 2 ? a : b);
    expect(nose.y).toBeGreaterThan(1.4);
    const c = Math.cos(VILLAGER.yaw), s = Math.sin(VILLAGER.yaw);
    const faceZ = -nose.x * s + nose.z * c;
    expect(faceZ).toBeGreaterThan(0.1);
    expect(VILLAGER.x).not.toBe(0);
    expect(Math.hypot(VILLAGER.x, VILLAGER.z - 65)).toBeGreaterThan(1);
  });

  it('draws a person and not the flight suit', () => {
    const geometry = paintBlockGeometry(villagerBlocks());
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.dispose();
    const src = readFileSync('src/world/Villager.tsx', 'utf8') + readFileSync('src/world/villagerPose.ts', 'utf8');
    expect(src).toContain('rotation={[0, VILLAGER.yaw, 0]}');
    expect(src).not.toMatch(/wing|cannon|suit\.glb|CuboidCollider|#f4e2b8|#e8d5b8/i);
    expect(src).not.toMatch(/Semjaza|Azazel|Kokabiel/);
  });
});
