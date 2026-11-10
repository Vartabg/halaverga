import { EYE_FORWARD, EYE_UP, forwardOf, type DroneField, type Vec3 } from './combat';

/** Anatomical eye centre, rotated in the same YXZ order as the pooled body. Also used by the visible eyes and charge cue. */
export function eyeCenter(f: DroneField, i: number, out: Vec3) {
  const ax = f.tiltX[i] + .5 * f.pitch[i] + .5 * f.wobble[i], az = f.tiltZ[i] + f.wobble[i], ay = f.yaw[i];
  const x = -Math.sin(az) * EYE_UP, y = Math.cos(az) * EYE_UP;
  const yy = Math.cos(ax) * y + Math.sin(ax) * EYE_FORWARD, z = Math.sin(ax) * y - Math.cos(ax) * EYE_FORWARD;
  const p = f.pos[i], k = f.knock[i];
  out.x = p.x + k.x + Math.cos(ay) * x + Math.sin(ay) * z;
  out.y = p.y + k.y + yy; out.z = p.z + k.z - Math.sin(ay) * x + Math.cos(ay) * z;
  return out;
}
/** Forward is independent of the eye's height above the torso: shots from above still respect the face direction. */
export function adversaryFacing(f: DroneField, i: number, out: Vec3) {
  return forwardOf(f.yaw[i], f.tiltX[i] + .5 * f.pitch[i] + .5 * f.wobble[i], out);
}
