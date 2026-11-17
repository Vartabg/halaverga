import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { START, FOOT } from '../src/game/motion';
import { heightAt } from '../src/world/massifData';
import { presentation } from '../src/game/presentation';
import { bindAngelClips } from '../src/world/angelClips';
import { createAngelMotion, stepAngelMotion, turnBody } from '../src/world/angelMotion';
import { createArchangelWings } from '../src/world/archangelWings';
import { applyFlightClips } from '../src/world/flightPose';
import { createFlightMix } from '../src/world/flightMix';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from '../src/world/suitAnimation';
import { applySuitPose, orientSuit } from '../src/world/suitPose';
import { beginSuitSprings, createSuitSprings, followBody } from '../src/world/suitSprings';
import { bulkSuit } from '../src/world/suitBulk';
import { buildSuitRig } from '../src/world/suitRig';
import { loadSuit } from './load-suit';
import { courtGeometry } from '../src/world/villageCourt';

describe('village opening oath court', () => {
  it('covers the standing spot with irregular polygonal stone and no runway boxes', () => {
    const geometry = courtGeometry(), p = geometry.attributes.position;
    expect(p.count).toBeGreaterThan(60);
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(12);
      expect(p.getZ(i)).toBeGreaterThanOrEqual(55); expect(p.getZ(i)).toBeLessThanOrEqual(75);
      expect(p.getY(i) - heightAt(p.getX(i), p.getZ(i))).toBeCloseTo(0, 1);
      expect(geometry.attributes.normal.getY(i)).toBe(1);
    }
    expect(readFileSync('src/world/villageCourt.ts', 'utf8')).not.toContain('BoxGeometry');
    geometry.dispose();
  });
  it('keeps the posed archangel above the visible court at spawn', async () => {
    const asset = await loadSuit('archangel'), clips = bindAngelClips(asset.animations);
    const court = courtGeometry();
    court.computeBoundingBox();
    const surface = court.boundingBox!.max.y, box = new Box3();
    expect(surface - (START.y - FOOT)).toBeLessThan(.016);
    const pose = { ...presentation, epoch: 1, position: START };
    const model = { hero: 1, epoch: 1 }, velocity = { x: 0, y: 0, z: 0 }, dt = 1 / 60;
    for (const reduced of [false, true]) {
      const rig = bulkSuit(buildSuitRig(asset.scene)), wings = createArchangelWings();
      const springs = createSuitSprings(rig.root, rig.joints, wings);
      const life = createSuitAnimation(), mix = createFlightMix(), moves = createAngelMotion();
      for (let i = 0; i < 121; i++) {
        const paused = i === 0;
        beginSuitSprings(springs);
        advanceSuitAnimation(life, pose, { flying: false, paused, velocity }, dt);
        rig.root.position.copy(START);
        orientSuit(rig.root, pose, model);
        applySuitPose(rig.joints, pose, model, reduced);
        const authored = applyFlightClips(rig.joints, mix, pose, life, model.hero, reduced);
        rig.root.position.y += applySuitAnimation(rig.joints, life, pose, reduced, model.hero, authored);
        stepAngelMotion(moves, clips, rig.joints, { dt, paused, flying: false, ground: 1, speed: 0, sword: true, reduced, epoch: 1 });
        turnBody(rig.root, moves);
        followBody(springs, { dt, paused, reduced, epoch: 1, ground: 1, command: 0 });
        if (i % 6 === 0) expect(box.setFromObject(rig.root, true).min.y).toBeGreaterThan(surface - .005);
      }
      wings.dispose();
      rig.dispose();
    }
    court.dispose();
  });
  it('draws with the paint material and adds no collider', () => {
    const src = readFileSync('src/world/Village.tsx', 'utf8');
    expect(src).toContain('paintInkMaterial'); expect(src).toContain('courtGeometry');
    expect(src).not.toContain('CuboidCollider'); expect(src).not.toContain('map:');
  });
});
