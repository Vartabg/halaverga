import { Matrix4, Quaternion, Vector3, type Color, type InstancedMesh } from 'three';
import type { Vec3 } from '@/game/combat';
import { WA } from '@/game/banishState';
import { CLEAVE, FAN } from '@/game/wardenTactics';
const at = new Vector3(), direction = new Vector3(), q = new Quaternion(), scale = new Vector3(), matrix = new Matrix4(), up = new Vector3(0, 1, 0);
/** A wide blade arc versus two separated banks of rays; the gap is geometry, not only a color cue. */
export function attackTelegraph(mesh: InstancedMesh, offset: number, move: number, p: Vec3, aim: Vec3, color: Color) {
  const x = aim.x - p.x, y = aim.y - p.y, z = aim.z - p.z, length = Math.hypot(x, y, z) || 1, h = Math.hypot(x, z) || 1;
  const dx = x / length, dy = y / length, dz = z / length, rx = z / h, rz = -x / h;
  const draw = (angle: number, distance: number, size: number) => {
    const c = Math.cos(angle), side = Math.sin(angle);
    direction.set(dx * c + rx * side, dy * c, dz * c + rz * side); q.setFromUnitVectors(up, direction);
    at.set(p.x + direction.x * distance, p.y + direction.y * distance, p.z + direction.z * distance); scale.setScalar(size);
    mesh.setMatrixAt(offset, matrix.compose(at, q, scale)); mesh.setColorAt(offset++, color);
  };
  if (move === WA.sweep) {
    const half = Math.acos(CLEAVE.cosine);
    for (let n = 0; n <= 14; n++) draw(-half + 2 * half * n / 14, CLEAVE.range, .85);
    draw(-half, CLEAVE.range * .5, .7); draw(half, CLEAVE.range * .5, .7);
  } else if (move === WA.fan) {
    const gap = Math.atan2(FAN.gap, length);
    for (let n = 0; n < 6; n++) for (let k = 1; k <= 3; k++) draw((n % 2 ? 1 : -1) * (gap + Math.floor(n / 2) * .14), length * k / 4, .7);
  } else {
    for (let n = 1; n <= 7; n++) draw(0, length * n / 8, move === WA.rush ? 1.25 : .8);
  }
  return offset;
}
