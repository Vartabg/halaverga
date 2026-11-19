import { afterAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { crossingCamera } from '../src/crossing/crossingCamera';
import { crossingSurface } from '../src/crossing/crossingSurface';
import { travelerAt, WALK_END } from '../src/crossing/crossingWalk';
import { createCrossing, launchCrossing } from '../src/crossing/flight';
import { CAMP_FIRE } from '../src/crossing/signalSites';
import { VALLEY_REPLY } from '../src/crossing/warning';
import { makeHermonArch } from '../src/world/hermonArch';

const arch = makeHermonArch().geometry, surface = crossingSurface(arch);
afterAll(() => arch.dispose());

describe.each([[874, 292], [390, 844]])('outcome camera at %i × %i', (width, height) => {
  it.each(['late', 'safe'] as const)('keeps the %s camera above the playable mountain and the subjects in view', phase => {
    const camera = new PerspectiveCamera(65, width / height, .12, 50000), frame = crossingCamera();
    const flight = createCrossing(), subject = new Vector3();
    frame(camera, flight, width, height, false, surface);
    launchCrossing(flight);
    frame(camera, flight, width, height, false, surface);
    flight.phase = phase;
    for (let tick = 0; tick <= WALK_END * 4; tick++) {
      flight.after = tick / 4;
      frame(camera, flight, width, height, false, surface);
      const eye = camera.position;
      expect(eye.y - surface(eye.x, eye.z)).toBeGreaterThanOrEqual(1.3);
      if (flight.after < 2) continue;
      const camp = phase === 'safe' && flight.after >= VALLEY_REPLY - .65 && flight.after < VALLEY_REPLY + 4.6;
      if (camp) subject.set(CAMP_FIRE.x, surface(CAMP_FIRE.x, CAMP_FIRE.z) + 1, CAMP_FIRE.z);
      else { travelerAt(flight, 0, subject, surface); subject.y += 1; }
      camera.updateMatrixWorld();
      subject.project(camera);
      expect(Math.abs(subject.x)).toBeLessThan(.95);
      expect(Math.abs(subject.y)).toBeLessThan(.95);
      expect(subject.z).toBeGreaterThan(0);
      expect(subject.z).toBeLessThan(1);
      if (camp && width > height) expect(subject.x).toBeGreaterThan(.18);
    }
  });
});
