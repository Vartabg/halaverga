import { BufferAttribute, BufferGeometry } from 'three';
import { SUN_DIRECTION } from '@/world/atmospherePalette';
import { WORLD } from '@/game/motion';
import { passSnowCover } from './passLandforms';
import { groundVertex, groundX, groundZ, passGroundAt } from './passGround';

/** Visibility of the grazing sun from each vertex. Beyond this pass the measured ridges use their own aerial perspective. */
function sunShadow(x: number, y: number, z: number) {
  let horizon = -1;
  for (const distance of [3, 6, 10, 16, 25, 39, 58, 84, 122, 170]) {
    const ground = passGroundAt(x + SUN_DIRECTION[0] * distance, z + SUN_DIRECTION[2] * distance);
    horizon = Math.max(horizon, (ground - y - .45) / distance);
  }
  return Math.max(0, Math.min(1, (horizon - SUN_DIRECTION[1] + .028) / .066));
}

export function weatherStone(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), art = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    art.set([passSnowCover(x, z) * .78 - .15, sunShadow(x, y, z), 1], i * 3);
  }
  geometry.setAttribute('passArt', new BufferAttribute(art, 3));
  return geometry;
}

export function makePassGround() {
  const width = groundX.length, depth = groundZ.length, size = width * depth;
  const positions = new Float32Array(size * 3), art = new Float32Array(size * 3);
  const indices = new Uint16Array((width - 1) * (depth - 1) * 6);
  for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) {
    const a = iz * width + ix, x = groundX[ix], z = groundZ[iz];
    const y = groundVertex(ix, iz);
    positions.set([x, y, z], a * 3);
    const rim = Math.min(x - WORLD.minX, WORLD.maxX - x, z - WORLD.minZ, WORLD.maxZ - z);
    const local = Math.min(1, rim / 48);
    art.set([passSnowCover(x, z), local * sunShadow(x, y, z), local], a * 3);
    if (iz === depth - 1 || ix === width - 1) continue;
    const b = a + 1, c = a + width, d = c + 1;
    indices.set((ix + iz) % 2 === 0 ? [a, c, d, a, d, b] : [a, c, b, b, c, d], (iz * (width - 1) + ix) * 6);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('passArt', new BufferAttribute(art, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
