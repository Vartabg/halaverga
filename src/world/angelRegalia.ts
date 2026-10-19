import { BoxGeometry, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, type Object3D } from 'three';

/** Art tradition: a gold nimbus and a white tabard. Scripture does not specify Michael's armour, wing count or uniform. */
export function angelRegalia(joints: Object3D[]) {
  const root = new Group(), head = new Group();
  const gold = new MeshBasicMaterial({ color: '#f9da91', toneMapped: false });
  const linen = new MeshStandardMaterial({ color: '#eee9d9', roughness: .9, side: DoubleSide });
  const flutter = { value: 0 };
  linen.onBeforeCompile = shader => {
    shader.uniforms.uFlutter = flutter;
    shader.vertexShader = 'uniform float uFlutter;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.z += sin(uFlutter * 4.3 + position.x * 7. + position.y * 3.6) * (1. - smoothstep(-.8, .1, position.y)) * .035;`);
  };
  const armour = new MeshStandardMaterial({ color: '#b89d62', metalness: .78, roughness: .32 });
  const owned: Mesh[] = [], attachments: Mesh[] = [];
  const shell = (bone: number, size: number[], offset: number[]) => {
    const m = new Mesh(new SphereGeometry(1, 12, 8), armour);
    m.scale.set(size[0], size[1], size[2]); m.position.set(offset[0], offset[1], offset[2]);
    m.castShadow = true; (joints[bone] ?? joints[0]).add(m); owned.push(m); attachments.push(m);
  };
  shell(11, [.26, .27, .17], [0, .08, 0]);
  shell(0, [.21, .18, .16], [0, -.02, .015]);
  for (const b of [2, 3]) shell(b, [.18, .12, .17], [0, .01, 0]);
  for (const b of [8, 9]) shell(b, [.115, .22, .12], [0, -.16, -.025]);
  shell(1, [.115, .16, .12], [0, .045, 0]);
  const halo = new Mesh(new TorusGeometry(.265, .009, 5, 60), gold);
  halo.position.set(0, .16, .13); head.add(halo);
  const vertices: number[] = [], indices: number[] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
    const u = col / 4, t = row / 6;
    vertices.push((u - .5) * (.34 + t * .2), .2 - t * 1.04 + (row === 6 && col === 2 ? .13 : 0), -.19 - Math.sin(u * Math.PI * 4) * .027 - t * .07);
    if (row < 6 && col < 4) { const i = row * 5 + col; indices.push(i, i + 1, i + 5, i + 1, i + 6, i + 5); }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
  const front = new Mesh(g, linen), back = new Mesh(g.clone(), linen);
  back.scale.set(1.35, 1.1, -1); back.position.z = .055; front.position.z = -.02; root.add(front, back);
  for (const [w, h] of [[.035, .25], [.15, .035]]) {
    const cross = new Mesh(new BoxGeometry(w, h, .012), gold);
    cross.position.set(0, .13, .27); root.add(cross); owned.push(cross);
  }
  (joints[11] ?? joints[0]).add(root); joints[1].add(head);
  return { step(dt: number, still: boolean) { if (!still) flutter.value += Math.min(dt, .04); }, dispose() { root.removeFromParent(); head.removeFromParent(); attachments.forEach(m => m.removeFromParent());
    owned.forEach(m => m.geometry.dispose()); g.dispose(); back.geometry.dispose(); halo.geometry.dispose(); gold.dispose(); linen.dispose(); armour.dispose(); } };
}
