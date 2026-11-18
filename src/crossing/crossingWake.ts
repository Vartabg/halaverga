import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, Vector3 } from 'three';

const COUNT = 32, SPAN = .97;

/** Two wingtip vortices. Each section stays in world space after the bird passes it. */
export function crossingWake() {
  const points = Array.from({ length: COUNT }, () => ({ time: -10, center: new Vector3(), side: new Vector3() }));
  const pos = new Float32Array(COUNT * 4 * 3), rgba = new Float32Array(COUNT * 4 * 4), indices: number[] = [];
  const rust = new Color('#993f29'), sun = new Color('#ffc281');
  for (let i = 0; i < COUNT; i++) {
    for (let j = 0; j < 4; j++) (j % 2 ? rust : sun).toArray(rgba, (i * 4 + j) * 4);
    if (i) for (const j of [0, 2]) {
      const a = (i - 1) * 4 + j;
      indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
    }
  }
  const geo = new BufferGeometry(), mat = new MeshBasicMaterial({
    vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false,
  });
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
  geo.setAttribute('color', new BufferAttribute(rgba, 4).setUsage(DynamicDrawUsage));
  geo.setIndex(indices);
  const mesh = new Mesh(geo, mat); mesh.frustumCulled = false;
  let head = 0, sampled = -10, last = -1;
  function write(i: number, at: number, center: Vector3, side: Vector3) {
    points[i].time = at; points[i].center.copy(center); points[i].side.copy(side);
  }
  return {
    mesh,
    step(time: number, center: Vector3, side: Vector3, travel: Vector3, strength: number) {
      if (time < last || last < 0) {
        for (let age = 0; age < COUNT; age++) {
          const i = COUNT - 1 - age;
          write(i, time - age * .032, center, side);
          points[i].center.addScaledVector(travel, -age * .032);
        }
        head = COUNT - 1; sampled = time;
      }
      if (time - sampled >= .032) { head = (head + 1) % COUNT; sampled = time; }
      write(head, time, center, side); last = time;
      for (let i = 0; i < COUNT; i++) {
        const p = points[(head - i + COUNT) % COUNT], age = Math.min(1, Math.max(0, (time - p.time) / SPAN));
        for (let j = 0; j < 4; j++) {
          const sign = j < 2 ? -1 : 1, outer = j % 2, a = 4 * i + j;
          const spread = sign * (1 + age * .26 - outer * (.18 + age * .13));
          pos[a * 3] = p.center.x + p.side.x * spread;
          pos[a * 3 + 1] = p.center.y + p.side.y * spread + age * .9 - outer * (.16 + age * .32);
          pos[a * 3 + 2] = p.center.z + p.side.z * spread;
          rgba[a * 4 + 3] = (1 - age) ** 1.45 * strength * (outer ? .11 : .89);
        }
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
      mesh.visible = strength > .01;
    },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
