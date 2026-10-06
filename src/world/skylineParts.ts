import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { SKYLINE, SUN_DIRECTION, hexToLinear, type Rgb } from './atmospherePalette';
import type { Mood } from './skylineDamage';

/** One distant ruin is a handful of boxes (ruinShapes.ts): a body, then stubs, walls, columns, girders, floor plates, rebar, rubble and
 * fallen sections. Pure geometry and colour (no textures, no DOM), Node-safe. `tilt` turns a part about its z axis; `shear` lowers
 * the +x side of its roof by that many metres (the +z side with `shearZ`, for a wall running along z); `burn` (0 to 1) blackens it. */
export type PartKind = 'body' | 'stub' | 'slab' | 'rebar' | 'rubble' | 'column' | 'floor' | 'beam' | 'wall' | 'fallen';
export type Spec = { kind: PartKind; at: Rgb; size: Rgb; tilt?: number; shear?: number; shearZ?: boolean; burn?: number };
export type Part = { kind: PartKind; min: Rgb; max: Rgb; shear: number };
export type Rng = () => number;
/** Where a ruin stands: foot centre (x, z) at FOOT_Y, its yaw, its lean about the foot, and which layer it belongs to. */
export type Stand = { x: number; z: number; yaw: number; lean: number; leanAxis: number; layer: number; bright: number; mood: Mood; seed: number };
/** The foot sits this far below the water (y .1), so no waterline is ever bare. */
export const FOOT_Y = -3;
/** Faces of these kinds carry the shader's empty window grid and soot (wall surfaces); steel, plates and rubble do not. */
const WALLED: PartKind[] = ['body', 'stub', 'wall', 'fallen'];
/** These stand on something, so their underside is never seen and is dropped. */
const STANDING: PartKind[] = ['body', 'stub', 'wall', 'column', 'rebar'];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tints = SKYLINE.tints.map(([lit, shade]) => [hexToLinear(lit), hexToLinear(shade)]);
const rust = hexToLinear(SKYLINE.rust), soot = hexToLinear(SKYLINE.soot);
const luma = (c: Rgb) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
/** A part's [lit, shaded] colour: bare steel rusts, rubble is a little darker than the walls it came from. */
function paint(kind: PartKind, layer: number): [Rgb, Rgb] {
  const [lit, shade] = tints[layer];
  if (kind === 'column' || kind === 'beam' || kind === 'rebar') return [rust, scale(rust, .55)];
  if (kind === 'rubble') return [scale(lit, .82), scale(shade, .82)];
  return [lit, shade];
}

/** The mesh buffers a skyline is built into. `seed` is per vertex: the layer plus a random fraction, read by the fragment shader to
 * vary each ruin's windows; `wall` is 1 on wall surfaces (window grid and soot), 0 on steel, plates and rubble. */
export type Buffers = { position: number[]; color: number[]; index: number[]; seed: number[]; wall: number[] };

/** Bakes one ruin into the buffers and returns its parts' world bounds, the foot's lowest and highest corner, and the lean. Faces
 * are lit or shaded by their normal against the hidden sun (a smooth step, so a turned ruin has no hard seam); tops are a little
 * brighter; the underside of a standing part is dropped. The ruin's mood leans its colour toward fire-black, ash, rust or oil
 * (without changing its value), the low floors are darker, and a burned part leans toward soot. */
export function bakeTower(out: Buffers, stand: Stand, specs: Spec[]) {
  const frame = new Matrix4().compose(new Vector3(stand.x, FOOT_Y, stand.z),
    new Quaternion().setFromEuler(new Euler(Math.cos(stand.leanAxis) * stand.lean, stand.yaw, Math.sin(stand.leanAxis) * stand.lean, 'YXZ')), new Vector3(1, 1, 1));
  const sun = new Vector3(...SUN_DIRECTION), n = new Vector3(), { mood } = stand;
  const total = Math.max(...specs.map(s => s.at[1] + s.size[1] / 2)), toneLuma = luma(mood.tone);
  const parts: Part[] = []; let foot: [number, number] = [0, 0];
  for (const spec of specs) {
    const g = new BoxGeometry(...spec.size), pos = g.attributes.position;
    const axis = spec.shearZ ? 2 : 0;
    if (spec.shear) for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - spec.shear * (pos.getComponent(i, axis) / spec.size[axis] + .5));
    g.applyMatrix4(new Matrix4().compose(new Vector3(...spec.at), new Quaternion().setFromEuler(new Euler(0, 0, spec.tilt ?? 0)), new Vector3(1, 1, 1)).premultiply(frame));
    g.computeBoundingBox();
    const bb = g.boundingBox!; parts.push({ kind: spec.kind, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z], shear: spec.shear ?? 0 });
    const nor = g.attributes.normal, idx = g.index!.array, [lite, own] = paint(spec.kind, stand.layer), wall = WALLED.includes(spec.kind) ? 1 : 0;
    const steel = wall === 0 && spec.kind !== 'floor' && spec.kind !== 'slab' && spec.kind !== 'rubble', burn = spec.burn ?? 0;
    for (let f = 0; f < 6; f++) {
      if (spec.kind === 'body' && f === 3) { const ys = [12, 13, 14, 15].map(i => pos.getY(i)); foot = [Math.min(...ys), Math.max(...ys)]; }
      if (f === 3 && STANDING.includes(spec.kind)) continue;
      n.fromBufferAttribute(nor, f * 4);
      const k = smooth(-.1, .75, n.dot(sun)), top = n.y > .5 ? 1.08 : 1, base = out.position.length / 3;
      for (let v = 0; v < 4; v++) {
        const y = pos.getY(f * 4 + v), low = 1 - smooth(0, .5, (y - FOOT_Y) / total);
        out.position.push(pos.getX(f * 4 + v), y, pos.getZ(f * 4 + v));
        const c = [0, 1, 2].map(i => own[i] + (lite[i] - own[i]) * k) as Rgb, lc = luma(c);
        const a = !steel && mood.amount > 0 ? Math.min(.75, mood.amount * (1 + mood.low * 1.6 * low)) : 0;
        const value = stand.bright * (steel ? 1 : mood.value) * (1 - .18 * low) * top;
        for (let i = 0; i < 3; i++) {
          const toned = c[i] * (1 - a) + mood.tone[i] * lc / toneLuma * a;
          out.color.push(Math.min(1, (toned * (1 - burn * .6) + soot[i] * burn * .6) * value));
        }
        out.seed.push(stand.layer + stand.seed); out.wall.push(wall);
      }
      for (let i = 0; i < 6; i++) out.index.push(base + idx[f * 6 + i] - f * 4);
    }
    g.dispose();
  }
  return { parts, foot, lean: stand.lean };
}
