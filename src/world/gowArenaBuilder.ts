import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import { resetGowState } from '@/game/gowCombat';
import { gowRuntime, type GowClipName, type GowEnemy } from '@/game/gowTypes';

export interface EnemyInstance {
  id: string;
  wrapper: Group;
  sprite: Mesh;
  spriteMat: MeshBasicMaterial;
  tex: Texture;
  shadow: Mesh;
  telegraphRing: Mesh;
  telegraphMat: MeshBasicMaterial;
  stunBeacon: Mesh;
}

export function selectEnemyClip(e: GowEnemy): { clip: GowClipName; speed: number; start: number } {
  switch (e.state) {
    case 'dead': return { clip: 'Death01', speed: 1.0, start: 0 };
    case 'stunned': return { clip: 'Hit_Head', speed: 0.65, start: 0 };
    case 'stagger': return { clip: 'Hit_Chest', speed: 1.15, start: 0 };
    case 'windup_yellow': return { clip: 'Sword_Attack', speed: 1.25, start: 0.38 };
    case 'windup_red': return { clip: 'Punch_Cross', speed: 1.08, start: 0.10 };
    case 'windup_spell': return { clip: 'Spell_Simple_Shoot', speed: 1.0, start: 0.05 };
    case 'chase': return { clip: e.isBoss ? 'Walk_Loop' : 'Jog_Fwd_Loop', speed: e.isBoss ? 1.15 : 1.08, start: 0 };
    default: return { clip: 'Sword_Idle', speed: 0.95, start: 0 };
  }
}

function setupSpriteTex(tex: Texture) {
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.repeat.set(0.5, 1);
  tex.needsUpdate = true;
  return tex;
}

export function createGowArena() {
  resetGowState();
  const container = new Group();
  const floorGeo = new CircleGeometry(20.6, 64);
  const rimGeo = new RingGeometry(20.2, 20.9, 64);
  const pillarGeo = new CylinderGeometry(0.75, 0.95, 3.6, 8);
  const bossQuadGeo = new PlaneGeometry(5.5, 5.5);
  const guardQuadGeo = new PlaneGeometry(3.8, 3.8);
  const shadowGeo = new CircleGeometry(1.0, 24);
  const ringGeo = new RingGeometry(0.95, 1.32, 32);
  const beaconGeo = new ConeGeometry(0.28, 0.65, 6);
  const projGeo = new SphereGeometry(0.36, 12, 12);
  const shockGeo = new RingGeometry(0.6, 1.15, 36);
  const slashGeo = new RingGeometry(1.2, 2.35, 28, 1, -1.25, 2.5);
  const lockGeo = new RingGeometry(0.88, 1.14, 32);
  const cursorGeo = new RingGeometry(0.45, 0.62, 24);
  const sparkGeo = new OctahedronGeometry(0.095, 0);

  const floorTex = new Texture();
  floorTex.colorSpace = SRGBColorSpace;
  const floorMat = new MeshBasicMaterial({
    map: floorTex,
    color: '#f2e8d5',
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const floorMesh = new Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI * 0.5;
  floorMesh.position.set(0, 20.02, 55);
  container.add(floorMesh);

  const rimMat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.45, side: DoubleSide });
  const rimMesh = new Mesh(rimGeo, rimMat);
  rimMesh.rotation.x = -Math.PI * 0.5;
  rimMesh.position.set(0, 20.03, 55);
  container.add(rimMesh);

  const pillarMat = new MeshStandardMaterial({ color: '#6b655e', roughness: 0.85, metalness: 0.1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.25;
    if (Math.sin(a) > 0.65) continue; // Keep south camera view unobstructed
    const p = new Mesh(pillarGeo, pillarMat);
    const hScale = 0.75 + (i % 3) * 0.32;
    p.scale.set(1, hScale, 1);
    p.position.set(Math.cos(a) * 20.4, 20.0 + 1.8 * hScale, 55 + Math.sin(a) * 20.4);
    container.add(p);
  }

  const stunMat = new MeshBasicMaterial({ color: '#ffd166' });
  const shadowMat = new MeshBasicMaterial({ color: '#09070d', transparent: true, opacity: 0.46, depthWrite: false });
  const playerProjMat = new MeshBasicMaterial({ color: '#ffd166' });
  const enemyProjMat = new MeshBasicMaterial({ color: '#ff3b30' });
  const shockMat = new MeshBasicMaterial({ color: '#ffe599', transparent: true, opacity: 0.82, side: DoubleSide });
  const slashMat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.88, side: DoubleSide });
  const lockMat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.88, side: DoubleSide });
  const cursorMat = new MeshBasicMaterial({ color: '#5ee6d0', transparent: true, opacity: 0.65, side: DoubleSide });
  const sparkMat = new MeshBasicMaterial({ color: '#ffd166' });

  const instances: EnemyInstance[] = gowRuntime.enemies.map((e) => {
    const wrapper = new Group();
    wrapper.position.set(e.x, e.y, e.z);
    const tex = setupSpriteTex(new Texture());
    const spriteMat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      side: DoubleSide,
      color: '#ffffff',
    });
    const sprite = new Mesh(e.isBoss ? bossQuadGeo : guardQuadGeo, spriteMat);
    sprite.position.set(0, e.isBoss ? 2.35 : 1.65, 0);
    sprite.rotation.set(-0.52, 0, 0);
    wrapper.add(sprite);

    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.set(0, 0.03, 0);
    shadow.scale.setScalar(e.isBoss ? 1.65 : 1.05);
    wrapper.add(shadow);

    const telegraphMat = new MeshBasicMaterial({ color: '#ffb703', transparent: true, opacity: 0, side: DoubleSide });
    const telegraphRing = new Mesh(ringGeo, telegraphMat);
    telegraphRing.rotation.x = -Math.PI * 0.5;
    telegraphRing.position.set(0, 0.07, 0);
    wrapper.add(telegraphRing);

    const stunBeacon = new Mesh(beaconGeo, stunMat);
    stunBeacon.rotation.x = Math.PI;
    stunBeacon.position.set(0, e.isBoss ? 4.8 : 3.4, 0);
    stunBeacon.visible = false;
    wrapper.add(stunBeacon);

    container.add(wrapper);
    return { id: e.id, wrapper, sprite, spriteMat, tex, shadow, telegraphRing, telegraphMat, stunBeacon };
  });

  if (typeof window !== 'undefined') {
    const loader = new TextureLoader();
    loader.load('/sprites/sanctuary-floor.jpg', (t) => {
      floorTex.image = t.image;
      floorTex.colorSpace = SRGBColorSpace;
      floorTex.needsUpdate = true;
    });
    loader.load('/sprites/semjaza.png', (t) => {
      for (const inst of instances) {
        if (inst.id === 'semjaza-boss') { inst.tex.image = t.image; setupSpriteTex(inst.tex); }
      }
    });
    loader.load('/sprites/vanguard.png', (t) => {
      for (const inst of instances) {
        if (inst.id !== 'semjaza-boss') { inst.tex.image = t.image; setupSpriteTex(inst.tex); }
      }
    });
  }

  const projMeshes = gowRuntime.projectiles.map(() => {
    const m = new Mesh(projGeo, playerProjMat); m.visible = false; container.add(m); return m;
  });
  const sparkMeshes = gowRuntime.sparks.map(() => {
    const m = new Mesh(sparkGeo, sparkMat); m.visible = false; container.add(m); return m;
  });
  const shockMesh = new Mesh(shockGeo, shockMat); shockMesh.rotation.x = -Math.PI * 0.5; shockMesh.visible = false; container.add(shockMesh);
  const slashMesh = new Mesh(slashGeo, slashMat); slashMesh.visible = false; container.add(slashMesh);
  const lockRing = new Mesh(lockGeo, lockMat); lockRing.rotation.x = -Math.PI * 0.5; lockRing.visible = false; container.add(lockRing);
  const cursorRing = new Mesh(cursorGeo, cursorMat); cursorRing.rotation.x = -Math.PI * 0.5; cursorRing.visible = false; container.add(cursorRing);

  return {
    container, instances, projMeshes, sparkMeshes, shockMesh, shockMat,
    slashMesh, slashMat, lockRing, lockMat, cursorRing, playerProjMat, enemyProjMat,
    dispose() {
      for (const g of [floorGeo, rimGeo, pillarGeo, bossQuadGeo, guardQuadGeo, shadowGeo, ringGeo, beaconGeo, projGeo, shockGeo, slashGeo, lockGeo, cursorGeo, sparkGeo]) g.dispose();
      for (const m of [floorMat, rimMat, pillarMat, stunMat, shadowMat, playerProjMat, enemyProjMat, shockMat, slashMat, lockMat, cursorMat, sparkMat]) m.dispose();
      floorTex.dispose();
      for (const inst of instances) { inst.spriteMat.dispose(); inst.telegraphMat.dispose(); inst.tex.dispose(); }
    },
  };
}
