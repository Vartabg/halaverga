import { BufferGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wingAirfoil } from './wingAirfoil';
import { featherQuill } from './featherQuill';
export const AVIAN_JOINTS = [[0, 0, 0], [.48, .015, .16], [1.02, 0, -.05], [1.30, -.01, .025]] as const;
export const secondaryRoot = (i: number) => new Vector3(.47 + i / 13 * .57, .012, .16 - i / 13 * .21);
export const secondaryTip = (i: number) => { const u = i / 13; return new Vector3(.39 + u * .78, -.012, .70 + .30 * Math.sin(Math.PI * .9 * u) + .12 * u); };
export function covertRoot(i: number, row: number, top: boolean) { const u = i / 14; return new Vector3(.43 + u * .65, (top ? 1 : -1) * (.049 - row * .008), .13 - u * .20 + row * .13); }
export function covertTip(i: number, row: number, top: boolean) { const a = covertRoot(i, row, top); return new Vector3(a.x + .035, (top ? 1 : -1) * .032, a.z + .27 + row * .045); }
export const primaryRoot = (i: number) => new Vector3(1.39 - i / 9 * .31, .006, .080 - i / 9 * .105);
export const primaryTip = (i: number) => new Vector3(2.30 - i / 9 * 1.17, -.012 - i / 9 * .015, .18 + i / 9 * .95);
/** Remiges attach to forearm/hand; small overlapping coverts hide their roots on both surfaces. */
export function featherWing(side: number) {
  const pieces: BufferGeometry[] = [wingAirfoil(side)];
  const add = (a: Vector3, b: Vector3, width: number, bone: number, top = true, shade = .95, rows = 6, cols = 4) =>
    pieces.push(featherQuill(side, a, b, width, bone, top, shade, rows, cols));
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  for (let i = 0; i < 10; i++) add(primaryRoot(i), primaryTip(i), .105 + Math.sin(i / 9 * Math.PI) * .023, 4 + i, true, .98, 12, 6);
  for (let i = 0; i < 14; i++) {
    add(secondaryRoot(i), secondaryTip(i), .092, 17 + i, true, .965, 10, 6);
  }
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    add(v(.06 + u * .39, .018, .06 + u * .10), v(.10 + u * .45, -.008, .42 + u * .30), .095, 0, true, .94, 8, 4);
  }
  for (const top of [true, false]) {
    const n = top ? 1 : -1, rows = top ? 3 : 2;
    for (let row = 0; row < rows; row++) for (let i = 0; i < 15; i++) {
      add(covertRoot(i, row, top), covertTip(i, row, top), .063, 31 + (top ? row : row + 3) * 15 + i, top, .925 + row * .018);
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < 9; i++) {
      const u = i / 8, x = 1.045 + u * .40, z = -.015 + u * .10 + row * .11;
      add(v(x, n * (.047 - row * .008), z), v(x + .16, n * .025, z + .24 + row * .06), .059, 16, top, .94 + row * .012);
    }
    for (let i = 0; i < 14; i++) {
      const u = i / 13, x = u * .50, z = .01 + u * .15;
      add(v(x, n * .052, z), v(x + .04, n * .025, z + .21 + .05 * Math.sin(i)), .070, 0, top, .92);
    }
  }
  // Alula: a separate small leading-edge fan at the wrist, opened for braking/slow flight.
  for (let i = 0; i < 3; i++) add(v(1.02 + i * .035, .035, -.065), v(1.14 + i * .045, .033, -.24 - i * .015), .037, 14, true, .94, 10, 4);
  const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose()); return geometry;
}
