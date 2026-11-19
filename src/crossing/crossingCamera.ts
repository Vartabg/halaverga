import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { WalkSurface } from './crossingSurface';
import { clamp01, ease, travelerAt } from './crossingWalk';
import type { Crossing, Phase } from './flight';
import { passGroundAt } from './passGround';
import { frameCampReply } from './signalSites';

export function crossingCamera() {
  const eye = new Vector3(), aim = new Vector3(), gaze = new Vector3();
  const previousEye = new Vector3(), previousGaze = new Vector3(), first = new Vector3(), second = new Vector3();
  let previous: Phase | null = null, previousFov = 57;
  return (camera: PerspectiveCamera, flight: Crossing, width: number, height: number, reduced: boolean, surface: WalkSurface) => {
    const { phase, player: p, velocity: v } = flight;
    const narrow = clamp01((1.15 - width / height) / .7);
    const ending = phase === 'safe' || phase === 'late';
    let fov = 55 + narrow * 27, filmOffset = 0;
    if (phase === 'ready') {
      // Look in the same direction as the launch. The sheltered hollow and bare shoulder show before the pilot commits.
      eye.set(-9 + narrow * 7, 45 + narrow * 5, 193 + narrow * 29);
      aim.set(-1 + narrow, 29 - narrow * 3, 48 + narrow * 18);
      fov = 51 + narrow * 24;
    } else if (ending) {
      if (phase !== previous) {
        previousEye.copy(camera.position); previousGaze.copy(gaze); previousFov = camera.fov;
      }
      travelerAt(flight, 0, first, surface); travelerAt(flight, 1, second, surface);
      aim.lerpVectors(first, second, .5);
      const direction = phase === 'safe' ? -1 : 1;
      const follow = Math.min(1.7, Math.abs(aim.x - 18.8) * .25);
      if (phase === 'late') eye.set(aim.x - 5.6, aim.y + 3.4, aim.z + 8.6 + narrow * 1.5);
      else eye.set(aim.x + 8.1 + follow, aim.y + 3.2, aim.z + 5.1 + narrow * 2.1);
      aim.x += direction * (.6 - follow); aim.y += .84;
      const delay = phase === 'safe' ? .29 : .07;
      const blend = reduced ? 1 : ease((flight.after - delay) / 1.38);
      eye.lerpVectors(previousEye, eye, blend); aim.lerpVectors(previousGaze, aim, blend);
      fov = MathUtils.lerp(previousFov, 53 + narrow * 11, blend);
      if (phase === 'safe') frameCampReply(eye, aim, flight.after, narrow);
      eye.y = Math.max(eye.y, surface(eye.x, eye.z) + 1.35);
      // Keep the stone lip out of the shot as the people walk up either bank.
      if (blend === 1) for (let i = 1; i <= 5; i++) {
        const t = i / 6, x = MathUtils.lerp(eye.x, aim.x, t), z = MathUtils.lerp(eye.z, aim.z, t);
        eye.y = Math.max(eye.y, (surface(x, z) + .15 - aim.y * t) / (1 - t));
      }
      // Leave the answering fire and the people in open space beside the outcome panel.
      filmOffset = -.29 * (1 - narrow) * blend * camera.getFilmWidth() * width / height * Math.tan(fov * Math.PI / 360);
    } else {
      // The shoulder faces up the gorge. Only the pilot's steering contributes to look-ahead.
      const shoulder = .65 + narrow * .25, boom = 6.35 + narrow * 4.35;
      eye.set(p.x + shoulder, p.y + 3.25 + narrow * 1.55, p.z + boom);
      eye.y = Math.max(eye.y, passGroundAt(eye.x, eye.z) + 1.1);
      aim.set(p.x - 3.1 * narrow + MathUtils.clamp(v.x * .21, -2.4, 2.4),
        p.y - 2.1 + MathUtils.clamp(v.y * .055, -.55, .55), p.z - 14);
    }
    if (camera.fov !== fov || camera.filmOffset !== filmOffset) {
      camera.fov = fov; camera.filmOffset = filmOffset; camera.updateProjectionMatrix();
    }
    camera.position.copy(eye); camera.lookAt(aim); gaze.copy(aim); previous = phase;
  };
}
