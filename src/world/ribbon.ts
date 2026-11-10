import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial } from 'three';
/** A fading ribbon through the last `sections` cross-sections pushed into it: a blade's swing, or the air off a wingtip. Additive, so
 * a faded section is simply dark. One draw call; every buffer is allocated once. The caller owns where the mesh sits. */
export function createRibbon(sections: number, color: string) {
  const position = new Float32Array(sections * 6), tint = new Float32Array(sections * 6), index: number[] = [];
  for (let i = 0; i < sections - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('color', new BufferAttribute(tint, 3).setUsage(DynamicDrawUsage));
  geometry.setIndex(index);
  const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  const mesh = new Mesh(geometry, material); mesh.frustumCulled = false; mesh.visible = false;
  const base = new Color(color), points = new Float32Array(sections * 6), age = new Float32Array(sections), power = new Float32Array(sections);
  let head = 0, count = 0;
  return {
    mesh,
    get count() { return count; },
    /** The newest cross-section, from (ax, ay, az) to (bx, by, bz), at a strength of 0 to 1. */
    push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, strength = 1) {
      const o = head * 6; points[o] = ax; points[o + 1] = ay; points[o + 2] = az; points[o + 3] = bx; points[o + 4] = by; points[o + 5] = bz;
      age[head] = 0; power[head] = Math.min(1, Math.max(0, strength)); head = (head + 1) % sections; count = Math.min(sections, count + 1);
    },
    /** Ages every section by dt and rewrites the buffers, newest first; a section older than `life` seconds is dark. */
    update(dt: number, life: number) {
      let lit = 0, last = 0;
      for (let k = 0; k < sections; k++) {
        const from = k < count ? (head - 1 - k + sections) % sections : last, o = from * 6, t = k * 6;
        if (k < count) { age[from] += dt; last = from; }
        const fade = k < count ? Math.max(0, 1 - age[from] / life) ** 1.6 * power[from] : 0; if (fade > .004) lit++;
        for (let c = 0; c < 6; c++) position[t + c] = points[o + c];
        // The first edge of each section carries the colour; the second fades it across the ribbon's width.
        tint[t] = base.r * fade; tint[t + 1] = base.g * fade; tint[t + 2] = base.b * fade;
        tint[t + 3] = base.r * fade * .15; tint[t + 4] = base.g * fade * .15; tint[t + 5] = base.b * fade * .15;
      }
      if (!lit) count = 0;
      mesh.visible = lit > 1;
      geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
    },
    clear() { count = 0; mesh.visible = false; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
export type Ribbon = ReturnType<typeof createRibbon>;
