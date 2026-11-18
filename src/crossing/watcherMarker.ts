import { PerspectiveCamera, Vector3 } from 'three';
import { clearApproach } from './course';
import type { Crossing } from './flight';

/** Show the bearing of a distant, visible Watcher without turning the camera or marking it through rock. */
export function createWatcherMarker() {
  const target = new Vector3(), view = new Vector3();
  let checked = -1, visible = false;
  return (element: HTMLDivElement | null, camera: PerspectiveCamera, flight: Crossing, width: number, height: number) => {
    if (!element || flight.phase !== 'flight') return;
    const w = flight.watcher;
    target.set(w.x, w.y + 1, w.z);
    const distance = target.distanceTo(camera.position);
    if (flight.elapsed < checked || flight.elapsed - checked > .12) {
      visible = clearApproach(camera.position, target, distance);
      checked = flight.elapsed;
    }
    camera.updateMatrixWorld();
    view.copy(target).applyMatrix4(camera.matrixWorldInverse);
    const behind = view.z >= 0;
    if (behind) view.z = -Math.max(1, view.z);
    view.applyMatrix4(camera.projectionMatrix);
    const dx = view.x * width / 2;
    const dy = behind ? Math.max(height / 2, -view.y * height / 2) : -view.y * height / 2;
    const side = Math.max(1, width / 2 - 48), vertical = Math.max(1, height / 2 - (dy < 0 ? 79 : 88));
    const edgeScale = Math.max(1, Math.abs(dx) / side, Math.abs(dy) / vertical);
    const offscreen = behind || edgeScale > 1;
    element.hidden = !visible || (!offscreen && distance < 22);
    if (element.hidden) return;
    const x = Math.round(width / 2 + dx / edgeScale);
    const y = Math.round(height / 2 + dy / edgeScale - (offscreen ? 0 : 17));
    element.dataset.edge = offscreen ? (dx > 0 ? 'right' : 'left') : 'ahead';
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    element.style.setProperty('--bearing', offscreen ? `${Math.atan2(dy, dx)}rad` : '90deg');
  };
}
