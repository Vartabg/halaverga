import { BoxGeometry, BufferAttribute, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { GeoRegionId } from '@/game/geoWorld';

export interface BiomeBundle {
  group: Group;
  groundGeo: PlaneGeometry;
  groundMat: MeshStandardMaterial;
  groundMesh: Mesh;
  waterGeo: PlaneGeometry;
  waterMat: MeshStandardMaterial;
  waterMesh: Mesh;
  instGeo: BoxGeometry;
  instMat: MeshStandardMaterial;
  instMesh: InstancedMesh;
  dispose: () => void;
}

const dummyMat = new Matrix4(), posV = new Vector3(), scaleV = new Vector3(), quatId = new Quaternion(), tmpCol = new Color();

export function createBiomeBundle(): BiomeBundle {
  const group = new Group();
  group.name = 'geo-biome-bundle';

  const groundGeo = new PlaneGeometry(520, 520, 63, 63);
  groundGeo.rotateX(-Math.PI / 2);
  const colors = new Float32Array(64 * 64 * 3);
  groundGeo.setAttribute('color', new BufferAttribute(colors, 3));
  const groundMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.14 });
  const groundMesh = new Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  groundMesh.castShadow = true;

  const waterGeo = new PlaneGeometry(520, 520);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new MeshStandardMaterial({ color: '#1e7888', roughness: 0.22, metalness: 0.65, transparent: true, opacity: 0.84 });
  const waterMesh = new Mesh(waterGeo, waterMat);
  waterMesh.position.set(0, 6.4, -65);

  const instGeo = new BoxGeometry(1, 1, 1);
  const instMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.35 });
  const instMesh = new InstancedMesh(instGeo, instMat, 48);
  instMesh.castShadow = true;
  instMesh.receiveShadow = true;
  instMesh.frustumCulled = false;

  group.add(groundMesh, waterMesh, instMesh);

  return {
    group, groundGeo, groundMat, groundMesh, waterGeo, waterMat, waterMesh, instGeo, instMat, instMesh,
    dispose() {
      groundGeo.dispose(); groundMat.dispose();
      waterGeo.dispose(); waterMat.dispose();
      instGeo.dispose(); instMat.dispose(); instMesh.dispose();
    },
  };
}

export function updateBiomeBundle(b: BiomeBundle, regionId: GeoRegionId, heights: Float32Array) {
  if (regionId === 'hermon') {
    b.group.visible = false;
    return;
  }
  b.group.visible = true;

  const posAttr = b.groundGeo.attributes.position as BufferAttribute;
  const colAttr = b.groundGeo.attributes.color as BufferAttribute;
  const posArr = posAttr.array as Float32Array;
  const colArr = colAttr.array as Float32Array;

  for (let gz = 0; gz < 64; gz++) {
    for (let gx = 0; gx < 64; gx++) {
      const idx = gz * 64 + gx, p3 = idx * 3;
      const wx = posArr[p3], wz = posArr[p3 + 2] - 65;
      posArr[p3 + 2] = wz;
      let h = heights[idx] ?? 10;

      // Blend smooth launch plateau near START (0, 19.6, 48..68) so standing/landing aligns cleanly
      const dLaunch = Math.hypot(wx * 0.75, wz - 56);
      if (dLaunch < 26) {
        const w = Math.max(0, Math.min(1, (26 - dLaunch) / 14));
        h = h * (1 - w) + 19.6 * w;
      }
      posArr[p3 + 1] = h;

      const absX = Math.abs(wx);
      if (regionId === 'yosemite') {
        if (absX < 9.5 && wz < 32) tmpCol.set('#1d6c78');
        else if (h < 13.5) tmpCol.set('#2d5234');
        else if (h < 68) tmpCol.set('#847b70').lerp(new Color('#b5a99b'), (h - 13.5) / 55);
        else tmpCol.set('#d4c8b8');
      } else if (regionId === 'manhattan') {
        if (absX > 94 || wz < -145) tmpCol.set('#112940');
        else if (absX < 14) tmpCol.set(Math.abs(wx) < 1.2 ? '#6e6240' : '#202733');
        else tmpCol.set('#2e3846');
      } else if (regionId === 'alps') {
        if (h < 15) tmpCol.set('#9ec5e3');
        else if (h < 64) tmpCol.set('#4c5766').lerp(new Color('#7b8c9e'), (h - 15) / 49);
        else tmpCol.set('#f2f7fc');
      } else {
        if (h < 12) tmpCol.set('#295138');
        else if (h < 52) tmpCol.set('#996242').lerp(new Color('#c48f65'), (h - 12) / 40);
        else tmpCol.set('#ece6d8');
      }
      colArr[p3] = tmpCol.r; colArr[p3 + 1] = tmpCol.g; colArr[p3 + 2] = tmpCol.b;
    }
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  b.groundGeo.computeVertexNormals();

  b.waterMesh.position.y = regionId === 'manhattan' ? 4.4 : 6.5;
  b.waterMat.color.set(regionId === 'manhattan' ? '#133857' : regionId === 'yosemite' ? '#1d7885' : '#356fa8');

  for (let i = 0; i < 48; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const tier = row % 2;
    const wz = 28 - row * 9.2;
    const hSeed = Math.abs(Math.sin(i * 19.37 + 4.1));

    if (regionId === 'manhattan') {
      const wx = side * (22 + tier * 17 + (hSeed * 6));
      const sy = 36 + hSeed * 86 + (tier === 0 ? 14 : 0);
      const sx = 9.5 + (i % 3) * 2.2, sz = 9.5 + ((i + 1) % 3) * 2.2;
      posV.set(wx, 7 + sy * 0.5, wz);
      scaleV.set(sx, sy, sz);
      tmpCol.set(['#33475e', '#3e546e', '#2c3d52', '#52657c', '#6b655b'][i % 5]);
    } else if (regionId === 'yosemite') {
      const isTree = i < 32;
      const wx = side * (isTree ? 11 + hSeed * 11 : 28 + hSeed * 18);
      const sy = isTree ? 11 + hSeed * 9 : 46 + hSeed * 58;
      const sx = isTree ? 3.4 + hSeed * 1.8 : 14 + hSeed * 10;
      posV.set(wx, 7 + sy * 0.5, wz);
      scaleV.set(sx, sy, sx);
      tmpCol.set(isTree ? (i % 2 === 0 ? '#24472b' : '#2f5736') : '#877d72');
    } else {
      const wx = side * (22 + tier * 16 + hSeed * 14);
      const sy = 34 + hSeed * 74;
      const sx = 8 + hSeed * 9;
      posV.set(wx, 8 + sy * 0.5, wz);
      scaleV.set(sx, sy, sx);
      tmpCol.set(regionId === 'alps' ? (hSeed > 0.45 ? '#dce8f2' : '#677687') : '#9c6846');
    }
    dummyMat.compose(posV, quatId, scaleV);
    b.instMesh.setMatrixAt(i, dummyMat);
    b.instMesh.setColorAt(i, tmpCol);
  }
  b.instMesh.instanceMatrix.needsUpdate = true;
  if (b.instMesh.instanceColor) b.instMesh.instanceColor.needsUpdate = true;
}
