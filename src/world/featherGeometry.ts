import { BufferGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wingAirfoil } from './wingAirfoil';
import { featherCard } from './featherCard';
import { FEATHER } from './featherAtlas';
export const AVIAN_JOINTS = [[0, 0, 0], [.48, .015, .16], [1.02, 0, -.05], [1.30, -.01, .025]] as const;
export const secondaryRoot = (i: number) => new Vector3(.47 + i / 13 * .57, .012, .16 - i / 13 * .21);
export const secondaryTip = (i: number) => { const u = i / 13; return new Vector3(.39 + u * .78, -.012, .70 + .30 * Math.sin(Math.PI * .9 * u) + .12 * u); };
/** Upper coverts ride clear of the wing bed (it never pokes through them, spread or folded); under-coverts sit closer. */
export function covertRoot(i: number, row: number, top: boolean) { const u = i / 14; return new Vector3(.43 + u * .65, top ? .072 - row * .008 : -(.049 - row * .008), .13 - u * .20 + row * .13); }
export function covertTip(i: number, row: number, top: boolean) { const a = covertRoot(i, row, top); return new Vector3(a.x + .035, top ? .045 : -.032, a.z + .27 + row * .045); }
export const primaryRoot = (i: number) => new Vector3(1.39 - i / 9 * .31, .006, .080 - i / 9 * .105);
export const primaryTip = (i: number) => new Vector3(2.30 - i / 9 * 1.17, -.012 - i / 9 * .015, .18 + i / 9 * .95);
/** Leading-edge line of the wing bed (wingAirfoil), where the marginal coverts sit. */
const leadZ = (x: number) => x < .48 ? x / .48 * .16 - .045 : .16 - Math.min(1, Math.max(0, (x - .48) / .56)) * .21;
const boneAt = (x: number) => x < .48 ? 0 : x < 1.02 ? 1 : 3;
/**
 * Remiges attach to forearm/hand; overlapping coverts hide their roots on both surfaces; marginal coverts round the leading
 * edge. Each feather is an atlas card (featherCard): outer primaries notched, secondaries blunt, coverts rounded.
 */
export function featherWing(side: number) {
  const pieces: BufferGeometry[] = [wingAirfoil(side)];
  const add = (a: Vector3, b: Vector3, width: number, bone: number, kind: number, top = true, shade = .95, rows = 6, cols = 3) =>
    pieces.push(featherCard(side, a, b, width, bone, top, shade, kind, rows, cols));
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  // The outer four primaries are narrow and notched, so they part into separate fingers when the hand spreads.
  for (let i = 0; i < 10; i++) add(primaryRoot(i), primaryTip(i), i < 4 ? .074 + i * .007 : .105 + Math.sin(i / 9 * Math.PI) * .023, 4 + i, i < 4 ? FEATHER.emarginated : FEATHER.primary, true, .98, 14, 4);
  for (let i = 0; i < 14; i++) add(secondaryRoot(i), secondaryTip(i), .094, 17 + i, FEATHER.secondary, true, .965, 12, 4);
  // Tertials bridge the secondaries to the back.
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    add(v(.06 + u * .39, .018, .06 + u * .10), v(.10 + u * .45, -.008, .42 + u * .30), .095, 0, FEATHER.secondary, true, .94, 10, 4);
  }
  for (const top of [true, false]) {
    const n = top ? 1 : -1, rows = top ? 3 : 2;
    for (let row = 0; row < rows; row++) for (let i = 0; i < 15; i++) {
      add(covertRoot(i, row, top), covertTip(i, row, top), .066, 31 + (top ? row : row + 3) * 15 + i, FEATHER.covert, top, .925 + row * .018);
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < 9; i++) {
      const u = i / 8, x = 1.045 + u * .40, z = -.015 + u * .10 + row * .11;
      add(v(x, n * (.047 - row * .008), z), v(x + .16, n * .025, z + .24 + row * .06), .062, 16, FEATHER.covert, top, .94 + row * .012);
    }
    for (let i = 0; i < 14; i++) {
      const u = i / 13, x = u * .50, z = .01 + u * .15;
      add(v(x, n * .052, z), v(x + .04, n * .025, z + .21 + .05 * Math.sin(i)), .072, 0, FEATHER.covert, top, .92);
    }
    // Marginal coverts: small, densely shingled feathers that round the leading edge from shoulder to hand.
    for (let row = 0; row < (top ? 2 : 1); row++) for (let i = 0; i < 30; i++) {
      const x = .03 + (i + row * .5) / 29 * 1.28, z = leadZ(Math.min(1.3, x)) + .004 + row * .055;
      add(v(x, n * (.056 - row * .004), z), v(x + .025, n * (.053 - row * .004), z + .13 + row * .02), .046, boneAt(x), FEATHER.marginal, top, .95 - row * .02, 4, 2);
    }
  }
  // Alula: a separate small leading-edge fan at the wrist, opened for braking/slow flight.
  for (let i = 0; i < 3; i++) add(v(1.02 + i * .035, .036, -.06), v(1.21 + i * .05, .037, -.13 - i * .012), .036, 14, FEATHER.primary, true, .94, 10, 4);
  const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose()); return geometry;
}
