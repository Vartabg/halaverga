import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { heightAt } from '@/world/massifData';
import { clamp01, ease, travelerAt } from './crossingWalk';
import type { Crossing, Phase } from './flight';

export function crossingCamera() {
  const eye = new Vector3(), aim = new Vector3(), gaze = new Vector3();
  const previousEye = new Vector3(), previousGaze = new Vector3(), first = new Vector3(), second = new Vector3();
  let previous: Phase | null = null, previousFov = 57;
  return (camera: PerspectiveCamera, flight: Crossing, width: number, height: number, reduced: boolean) => {
    const { phase, player: p, velocity: v } = flight;
    const narrow = clamp01((1.15 - width / height) / .7);
    const ending = phase === 'safe' || phase === 'late';
    let fov = 55 + narrow * 27;
    if (phase === 'ready') {
      eye.set(20.65, heightAt(20.65, -9) + 1.12, -9);
      fov = 65 + narrow * 10;
      const panelEnd = Math.min(448, width * .92) + width * .04;
      const inLandscape = height <= 475 && width > height;
      const shift = inLandscape ? Math.max(0, panelEnd + 43 - width * .525) / height * 25 * Math.tan(fov * Math.PI / 360) : 0;
      aim.set(20.9 - narrow * 2.5 + shift, eye.y - 5.55, 3.5);
    } else if (ending) {
      if (phase !== previous) {
        previousEye.copy(camera.position); previousGaze.copy(gaze); previousFov = camera.fov;
      }
      travelerAt(flight, 0, first); travelerAt(flight, 1, second);
      aim.lerpVectors(first, second, .5);
      const direction = phase === 'safe' ? -1 : 1;
      const follow = Math.min(1.7, Math.abs(aim.x - 18.8) * .25);
      eye.set(aim.x + 8.1 - direction * follow, aim.y + 2.8, aim.z + 5.1 + narrow * 2.1);
      eye.y = Math.max(eye.y, heightAt(eye.x, eye.z) + 1.15);
      aim.x += direction * (.6 - follow); aim.y += .66;
      const delay = phase === 'safe' ? .29 : .07;
      const blend = reduced ? 1 : ease((flight.after - delay) / 1.38);
      eye.lerpVectors(previousEye, eye, blend); aim.lerpVectors(previousGaze, aim, blend);
      eye.y = Math.max(eye.y, heightAt(eye.x, eye.z) + 1.12);
      fov = MathUtils.lerp(previousFov, 53 + narrow * 11, blend);
    } else {
      // The shoulder faces up the gorge. Only the pilot's steering contributes to look-ahead.
      const shoulder = .58 + narrow * .27, boom = 6.15 + narrow * 3.35;
      eye.set(p.x + shoulder, p.y + 3.25 + narrow * 1.55, p.z + boom);
      eye.y = Math.max(eye.y, heightAt(eye.x, eye.z) + 1.1);
      aim.set(p.x - 4.7 * narrow + MathUtils.clamp(v.x * .21, -2.4, 2.4),
        p.y - 2.1 + MathUtils.clamp(v.y * .055, -.55, .55), p.z - 14);
    }
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.copy(eye); camera.lookAt(aim); gaze.copy(aim); previous = phase;
  };
}
