import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { SKYLINE, SUN_DIRECTION, hexToLinear, type Rgb } from './atmospherePalette';

/** One distant tower is a few boxes: a body, then setbacks, a notched or slab top, a spire, a green crown. Every upper part starts
 * inside the one below it, so nothing floats. Pure geometry and colour (no textures, no DOM), Node-safe. */
export type PartKind = 'body' | 'setback' | 'notch' | 'slab' | 'spire' | 'crown';
export type Spec = { kind: PartKind; at: Rgb; size: Rgb; tilt?: number };
export type Part = { kind: PartKind; min: Rgb; max: Rgb };
export type Rng = () => number;
/** Where a tower stands: foot centre (x, z) at FOOT_Y, its yaw, its lean about the foot, and which layer it belongs to. */
export type Stand = { x: number; z: number; yaw: number; lean: number; leanAxis: number; layer: number; bright: number };
/** The tower foot sits this far below the water (y .1), as the old skyline did, so no waterline is ever bare. */
export const FOOT_Y = -3;
const box = (kind: PartKind, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0): Spec => ({ kind, at: [x, y, z], size: [w, h, d], tilt });

/** The recipe for a tower of width w, depth d and roof height h above the water. About 35 percent get one or two setbacks, 25 percent
 * a broken top, 10 percent a spire, and layer 1 puts a green crown on about 20 percent. Heights are local, from the foot. */
export function towerSpecs(rng: Rng, w: number, d: number, h: number, layer: number): Spec[] {
  const height = h - FOOT_Y, shape = rng(), specs: Spec[] = [];
  const steps = shape < .35 ? (rng() < .5 ? 1 : 2) : 0;
  let bodyH = steps ? height * (steps === 2 ? .58 : .7) : height, apex = { x: 0, z: 0 };
  if (shape >= .35 && shape < .6 && rng() < .5) {
    const cut = 5 + rng() * 8, side = rng() < .5 ? -1 : 1;
    bodyH = height - cut;
    apex = { x: side * w / 4, z: 0 };
    specs.push(box('body', 0, bodyH / 2, 0, w, bodyH, d), box('notch', apex.x, bodyH - 3 + (cut + 3) / 2, 0, w / 2, cut + 3, d));
  } else specs.push(box('body', 0, bodyH / 2, 0, w, bodyH, d));
  let top = bodyH, sw = w, sd = d;
  for (let i = 0; i < steps; i++) {
    sw *= i ? .75 : .8; sd *= i ? .75 : .8;
    const sh = i === steps - 1 ? height - top + 1 : (height - bodyH) * .5 + 1;
    apex = { x: (rng() - .5) * (w - sw) * .5, z: (rng() - .5) * (d - sd) * .5 };
    specs.push(box('setback', apex.x, top - 1 + sh / 2, apex.z, sw, sh, sd));
    top = top - 1 + sh;
  }
  if (shape >= .35 && shape < .6 && !specs.some(s => s.kind === 'notch'))
    specs.push(box('slab', 0, height + .2, 0, w * .9, 1.8, d * .9, (rng() < .5 ? -1 : 1) * (.12 + rng() * .2)));
  if (rng() < .1) { const sh = 8 + rng() * 8; specs.push(box('spire', apex.x, height - 1 + sh / 2, apex.z, .8, sh, .8)); }
  if (layer === 0 && rng() < .2) {
    const ch = 3 + rng() * 3, f = .4 + rng() * .2;
    specs.push(box('crown', apex.x, height - .5 + ch / 2, apex.z, w * f, ch, d * f));
  }
  return specs;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const crown = hexToLinear(SKYLINE.crown), tints = SKYLINE.tints.map(([lit, shade]) => [hexToLinear(lit), hexToLinear(shade)]);

/** The mesh buffers a skyline is built into. */
export type Buffers = { position: number[]; color: number[]; index: number[] };

/** Bakes one tower into the buffers and returns its parts' world bounds, the foot's lowest and highest corner, and the lean. Faces
 * are lit or shaded by their normal against the sun (a smooth step, so a turned tower has no hard seam); tops are a little brighter;
 * the bottom face is dropped (under water) except on a tilted slab. */
export function bakeTower(out: Buffers, stand: Stand, specs: Spec[]) {
  const frame = new Matrix4().compose(new Vector3(stand.x, FOOT_Y, stand.z),
    new Quaternion().setFromEuler(new Euler(Math.cos(stand.leanAxis) * stand.lean, stand.yaw, Math.sin(stand.leanAxis) * stand.lean, 'YXZ')), new Vector3(1, 1, 1));
  const [lit, shade] = tints[stand.layer], sun = new Vector3(...SUN_DIRECTION), n = new Vector3();
  const parts: Part[] = []; let foot: [number, number] = [0, 0];
  for (const spec of specs) {
    const g = new BoxGeometry(...spec.size);
    g.applyMatrix4(new Matrix4().compose(new Vector3(...spec.at), new Quaternion().setFromEuler(new Euler(0, 0, spec.tilt ?? 0)), new Vector3(1, 1, 1)).premultiply(frame));
    g.computeBoundingBox();
    const bb = g.boundingBox!; parts.push({ kind: spec.kind, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index!.array;
    for (let f = 0; f < 6; f++) {
      if (spec.kind === 'body' && f === 3) { const ys = [12, 13, 14, 15].map(i => pos.getY(i)); foot = [Math.min(...ys), Math.max(...ys)]; }
      if (f === 3 && spec.kind !== 'slab') continue;
      n.fromBufferAttribute(nor, f * 4);
      const k = smooth(-.1, .45, n.dot(sun)), top = n.y > .5 ? 1.08 : 1, base = out.position.length / 3;
      const own: Rgb = spec.kind === 'crown' ? [crown[0] * .6, crown[1] * .6, crown[2] * .6] : shade;
      const lite: Rgb = spec.kind === 'crown' ? crown : lit;
      for (let v = 0; v < 4; v++) {
        out.position.push(pos.getX(f * 4 + v), pos.getY(f * 4 + v), pos.getZ(f * 4 + v));
        for (let c = 0; c < 3; c++) out.color.push(Math.min(1, (own[c] + (lite[c] - own[c]) * k) * stand.bright * top));
      }
      for (let i = 0; i < 6; i++) out.index.push(base + idx[f * 6 + i] - f * 4);
    }
    g.dispose();
  }
  return { parts, foot, lean: stand.lean };
}
