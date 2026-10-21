import { box } from './skylineDamage';
import type { Ruin } from './ruinShapes';
import type { Rng, Spec } from './skylineParts';

/** Distant ranges in the days of Jared: stacked stone courses, no steel and no window wall.
 * The ruin name still comes from the old picker so the tall marks stay on the same towers.
 * Every course after the first overlaps the one under it. Drawn from the tower's own stream. */
export function stoneSpecs(look: Rng, ruin: Ruin, w: number, d: number, height: number): Spec[] {
  const keep = ruin === 'skeleton' || ruin === 'shell' ? .62 + look() * .28
    : ruin === 'mound' ? .08 + look() * .06
    : ruin === 'fallen' ? .16 + look() * .1
    : .18 + look() * .16;
  const hs = Math.max(ruin === 'mound' ? 6 : 9, height * keep), courses = 3, specs: Spec[] = [];
  for (let i = 0; i < courses; i++) {
    const y0 = hs * i / courses, y1 = hs * (i + 1) / courses + hs * .05, inset = 1 - i * .08;
    specs.push(box(i === 0 ? 'body' : 'slab', 0, (y0 + y1) / 2, 0, Math.max(4, w * inset), y1 - y0, Math.max(4, d * inset)));
  }
  if (ruin === 'fallen') specs.push(box('fallen', w * .25, 2, 0, Math.min(22, hs), 6, Math.max(4, d * .5), .3));
  if (ruin === 'mound') specs.push(box('rubble', (look() - .5) * w * .2, hs * .35, (look() - .5) * d * .2, w * .7, hs * .45, d * .7, (look() - .5) * .25));
  return specs;
}
