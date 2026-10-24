import { Matrix4, Quaternion, Vector3 } from 'three';
// Folding a feather is a full orientation, not just an aim: its shaft follows `dir` and its upper face turns to `face`, so a
// folded stack lies flat against the back instead of fanning edge-on. Rest feathers lie in the wing's XZ plane, upper face +Y.
const a = new Vector3(), n = new Vector3(), b = new Vector3(), a2 = new Vector3(), n2 = new Vector3(), b2 = new Vector3();
const rest = new Matrix4(), goal = new Matrix4(), UP = new Vector3(0, 1, 0);

/** Writes into q the rotation taking a rest feather with shaft `axis` to shaft `dir` with its upper face toward `face`. */
export function foldFeather(q: Quaternion, axis: Vector3, dir: Vector3, face: Vector3) {
  a.copy(axis).normalize(); n.copy(UP).addScaledVector(a, -a.dot(UP)).normalize(); b.crossVectors(a, n);
  a2.copy(dir).normalize(); n2.copy(face).addScaledVector(a2, -a2.dot(face));
  if (n2.lengthSq() < 1e-8) return q.setFromUnitVectors(a, a2); // face parallel to the shaft: fall back to the plain aim
  n2.normalize(); b2.crossVectors(a2, n2);
  rest.makeBasis(a, n, b); goal.makeBasis(a2, n2, b2);
  return q.setFromRotationMatrix(goal.multiply(rest.transpose()));
}
