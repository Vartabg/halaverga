import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Quaternion, Vector3 } from 'three';
import type { WalkSurface } from './crossingSurface';
import { CAMP_FIRE, SPAN_FIRE } from './signalSites';

/** Stitched roofs sag between their poles. Each eave and stake meets the actual limestone bench. */
export function makeCamp(surface: WalkSurface) {
  const positions: number[] = [], colors: number[] = [];
  const color = new Color(), up = new Vector3(0, 1, 0), rotation = new Quaternion();
  function triangle(a: Vector3, b: Vector3, c: Vector3, dye: string) {
    color.set(dye);
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  }
  function addShape(shape: BufferGeometry, dye: string) {
    const p = shape.getAttribute('position'), indices = shape.getIndex();
    color.set(dye);
    for (let i = 0; i < (indices?.count ?? p.count); i++) {
      const k = indices ? indices.getX(i) : i;
      positions.push(p.getX(k), p.getY(k), p.getZ(k)); colors.push(color.r, color.g, color.b);
    }
    shape.dispose();
  }
  function stick(a: Vector3, b: Vector3, radius: number, dye: string) {
    const line = b.clone().sub(a), mid = a.clone().lerp(b, .5);
    const shape = new CylinderGeometry(radius * .75, radius, line.length(), 5);
    shape.applyQuaternion(rotation.setFromUnitVectors(up, line.normalize()));
    addShape(shape.translate(mid.x, mid.y, mid.z), dye);
  }
  function tent(x: number, z: number, yaw: number, size: number) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), ground = surface(x, z);
    const point = (u: number, v: number, h: number, pinned = false) => {
      const px = x + (u * cs - v * sn) * size, pz = z + (u * sn + v * cs) * size;
      return new Vector3(px, (pinned ? surface(px, pz) : ground) + h * size, pz);
    };
    const rows = Array.from({ length: 11 }, (_, i) => {
      const u = -2.65 + i * .53, sag = (1 - (u / 2.65) ** 2);
      return [point(u, -1.72, .28, true), point(u, -.87, 1.29 - .2 * sag),
        point(u, 0, 2.48 - .3 * sag), point(u, 1.05, 1.7 - .19 * sag), point(u, 1.9, .95, true)];
    });
    for (let i = 1; i < rows.length; i++) {
      const dye = i === 3 || i === 9 ? '#948574' : i % 2 ? '#4c4039' : '#5d5046';
      for (let j = 0; j < 4; j++) {
        triangle(rows[i - 1][j], rows[i - 1][j + 1], rows[i][j], dye);
        triangle(rows[i][j], rows[i - 1][j + 1], rows[i][j + 1], dye);
      }
    }
    const back = rows[0], front = rows[rows.length - 1];
    const hem = point(-2.65, .14, .14, true), fold = point(2.65, -.9, .24, true);
    for (let j = 0; j < 4; j++) triangle(back[j + 1], back[j], hem, j % 2 ? '#66594b' : '#50483d');
    triangle(front[0], front[1], fold, '#54473b');
    triangle(front[1], front[2], fold, '#665647');
    for (const end of [-1, 1]) {
      const u = end * 2.65;
      stick(point(u, 0, 0, true), point(u, 0, 2.62), .065 * size, '#63503c');
      stick(point(u, 0, 2.46), point(u + end * 1.4, .2, 0, true), .025 * size, '#a98861');
      stick(point(u, 1.9, .95, true), point(u + end * .6, 2.5, 0, true), .022 * size, '#a98861');
    }
  }
  tent(-36, -43, -.22, 1.22); tent(-27, -48, .55, .94); tent(-40, -50, -.46, .88);
  for (const site of [SPAN_FIRE, CAMP_FIRE]) {
    const size = site === SPAN_FIRE ? .77 : 1.14, y = surface(site.x, site.z);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = site.x + Math.cos(a) * size * .66, z = site.z + Math.sin(a) * size * .66;
      const rock = new IcosahedronGeometry(1, 0).scale(.32 * size, .22 * size, .38 * size).rotateY(a).translate(x, surface(x, z) + .10 * size, z);
      addShape(rock, i % 2 ? '#807666' : '#a59986');
      const base = new Vector3(site.x + Math.cos(a) * .51 * size, y + .12, site.z + Math.sin(a) * .51 * size);
      stick(base, new Vector3(site.x - Math.cos(a) * .14, y + .85 * size, site.z - Math.sin(a) * .14), .08 * size, '#463225');
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
