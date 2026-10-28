import {
  AnimationAction,
  AnimationMixer,
  ConeGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  type AnimationClip,
  type Object3D,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { resetGowState } from '@/game/gowCombat';
import { gowRuntime, type GowClipName, type GowEnemy } from '@/game/gowTypes';
import { createArchangelWings } from './archangelWings';
import { decorateWatcherEnemy, type GowRigHandle } from './gowMaterials';

const LOOP_CLIPS = new Set<GowClipName>([
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Loop',
  'Sword_Idle',
  'Spell_Simple_Idle_Loop',
]);

export interface EnemyInstance {
  id: string;
  wrapper: Group;
  handle: GowRigHandle;
  mixer: AnimationMixer;
  actions: Map<GowClipName, AnimationAction>;
  activeClip: GowClipName | '';
  telegraphRing: Mesh;
  telegraphMat: MeshBasicMaterial;
  stunBeacon: Mesh;
  wings: ReturnType<typeof createArchangelWings> | null;
}

export function selectEnemyClip(e: GowEnemy): { clip: GowClipName; speed: number } {
  switch (e.state) {
    case 'dead':
      return { clip: 'Death01', speed: 1.0 };
    case 'stunned':
      return { clip: 'Hit_Head', speed: 0.55 };
    case 'stagger':
      return { clip: 'Hit_Chest', speed: 1.15 };
    case 'windup_yellow':
      return { clip: 'Sword_Attack', speed: 0.72 };
    case 'windup_red':
      return { clip: 'Punch_Cross', speed: 0.68 };
    case 'windup_spell':
      return { clip: 'Spell_Simple_Shoot', speed: 0.95 };
    case 'chase':
      return { clip: e.isBoss ? 'Walk_Loop' : 'Jog_Fwd_Loop', speed: e.isBoss ? 1.08 : 1.15 };
    default:
      return { clip: 'Sword_Idle', speed: 0.9 };
  }
}

export function createGowArena(scene: Object3D, animations: AnimationClip[]) {
  resetGowState();
  const container = new Group();
  const ringGeo = new RingGeometry(0.85, 1.18, 28);
  const beaconGeo = new ConeGeometry(0.28, 0.65, 6);
  const projGeo = new SphereGeometry(0.32, 12, 12);
  const shockGeo = new RingGeometry(0.6, 1.1, 32);

  const stunMat = new MeshBasicMaterial({ color: '#ffd166' });
  const playerProjMat = new MeshBasicMaterial({ color: '#ffcf56' });
  const enemyProjMat = new MeshBasicMaterial({ color: '#ff3b30' });
  const shockMat = new MeshBasicMaterial({ color: '#ffe599', transparent: true, opacity: 0.8 });

  const instances: EnemyInstance[] = gowRuntime.enemies.map((e) => {
    const wrapper = new Group();
    wrapper.position.set(e.x, e.y, e.z);
    const cloned = cloneSkeleton(scene);
    cloned.scale.setScalar(e.scale);
    wrapper.add(cloned);

    const handle = decorateWatcherEnemy(cloned, e.isBoss);
    let wings: ReturnType<typeof createArchangelWings> | null = null;
    if (e.isBoss) {
      wings = createArchangelWings();
      wings.root.position.set(0, 0.05, 0);
      wings.root.rotation.y = Math.PI;
      handle.backAnchor.add(wings.root);
    }

    const telegraphMat = new MeshBasicMaterial({ color: '#ffb703', transparent: true, opacity: 0 });
    const telegraphRing = new Mesh(ringGeo, telegraphMat);
    telegraphRing.rotation.x = -Math.PI * 0.5;
    telegraphRing.position.set(0, 0.08, 0);
    wrapper.add(telegraphRing);

    const stunBeacon = new Mesh(beaconGeo, stunMat);
    stunBeacon.rotation.x = Math.PI;
    stunBeacon.position.set(0, 2.15 * e.scale, 0);
    stunBeacon.visible = false;
    wrapper.add(stunBeacon);

    const mixer = new AnimationMixer(cloned);
    const actions = new Map<GowClipName, AnimationAction>();
    for (const clip of animations) {
      const name = clip.name as GowClipName;
      const action = mixer.clipAction(clip);
      if (LOOP_CLIPS.has(name)) {
        action.setLoop(LoopRepeat, Infinity);
      } else {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
    }

    container.add(wrapper);
    return {
      id: e.id,
      wrapper,
      handle,
      mixer,
      actions,
      activeClip: '',
      telegraphRing,
      telegraphMat,
      stunBeacon,
      wings,
    };
  });

  const projMeshes = gowRuntime.projectiles.map(() => {
    const m = new Mesh(projGeo, playerProjMat);
    m.visible = false;
    container.add(m);
    return m;
  });

  const shockMesh = new Mesh(shockGeo, shockMat);
  shockMesh.rotation.x = -Math.PI * 0.5;
  shockMesh.visible = false;
  container.add(shockMesh);

  return {
    container,
    instances,
    projMeshes,
    shockMesh,
    shockMat,
    playerProjMat,
    enemyProjMat,
    dispose() {
      ringGeo.dispose();
      beaconGeo.dispose();
      projGeo.dispose();
      shockGeo.dispose();
      stunMat.dispose();
      playerProjMat.dispose();
      enemyProjMat.dispose();
      shockMat.dispose();
      for (const inst of instances) {
        inst.mixer.stopAllAction();
        inst.telegraphMat.dispose();
        inst.wings?.dispose();
        inst.handle.dispose();
      }
    },
  };
}
