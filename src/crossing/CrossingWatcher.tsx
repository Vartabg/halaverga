import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, InstancedBufferAttribute, InstancedMesh, Mesh, Quaternion, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { bindAngelClips, blendAngelClip, clipTime, FULL, UPPER_BODY } from '@/world/angelClips';
import { createDroneMaterials } from '@/world/droneMesh';
import { buildSuitRig } from '@/world/suitRig';
import { swordGeometry } from '@/world/swordBlade';
import { SWORD_GRIP, swordGripRotation } from '@/world/swordGrip';
import { WATCHER_WING, watcherWing } from '@/world/watcherWings';
import { ARRIVAL, watcherAt } from './course';
import { clamp01 } from './crossingWalk';
import { crossingWake } from './crossingWake';
import type { Crossing } from './flight';

function watcher(asset: GLTF) {
  const rig = buildSuitRig(asset.scene), clips = bindAngelClips(asset.animations);
  const root = new Group(), wings = new Group(), mat = createDroneMaterials(), wake = crossingWake();
  const chest = rig.joints[11], attach = new Vector3(0, WATCHER_WING.root[1], WATCHER_WING.root[2]);
  rig.root.updateMatrixWorld(true); wings.position.copy(attach); chest.worldToLocal(wings.position); chest.add(wings);
  const feathers = [-1, 1].map(side => {
    const geo = watcherWing(side);
    geo.setAttribute('aFlash', new InstancedBufferAttribute(new Float32Array([0]), 1));
    geo.setAttribute('aDamage', new InstancedBufferAttribute(new Float32Array([.035]), 1));
    const mesh = new InstancedMesh(geo, mat.feather, 1); mesh.frustumCulled = false;
    mesh.position.copy(attach).negate(); wings.add(mesh);
    return mesh;
  });
  const blade = new Mesh(swordGeometry(), mat.blade);
  blade.position.copy(SWORD_GRIP); swordGripRotation(blade.quaternion); rig.joints[16].add(blade);
  root.add(rig.root);
  return { root, rig, clips, chest, wings, mat, wake, last: -1, yaw: 0,
    ahead: new Vector3(), behind: new Vector3(), side: new Vector3(), center: new Vector3(), parent: new Quaternion(),
    dispose() {
      root.removeFromParent(); rig.dispose(); blade.geometry.dispose();
      feathers.forEach(m => { m.geometry.dispose(); m.dispose(); }); mat.dispose(); wake.dispose();
    } };
}

export default function CrossingWatcher({ asset, flight, reduced, paused }:
  { asset: GLTF; flight: Crossing; reduced: boolean; paused: boolean }) {
  const mount = useRef<Group>(null), who = useRef<ReturnType<typeof watcher> | null>(null);
  useLayoutEffect(() => {
    const actor = watcher(asset);
    who.current = actor; mount.current!.add(actor.root, actor.wake.mesh);
    return () => { who.current = null; actor.dispose(); };
  }, [asset]);
  useFrame(({ camera }, delta) => {
    const a = who.current;
    if (!a) return;
    const { phase, elapsed, after } = flight, t = elapsed + after, dt = paused ? 0 : Math.min(delta, .1);
    const dtPath = .08, lo = Math.max(0, elapsed - dtPath), hi = Math.min(ARRIVAL, elapsed + dtPath);
    watcherAt(lo, a.behind); watcherAt(hi, a.ahead);
    a.ahead.sub(a.behind).multiplyScalar(1 / Math.max(.001, hi - lo));
    if (phase === 'safe' && after > .11) a.ahead.set(-26, 22, -9);
    if (phase === 'late') a.ahead.set(0, 0, -1);
    const yaw = Math.atan2(-a.ahead.x, -a.ahead.z);
    if (a.last < 0 || t < a.last) a.yaw = yaw;
    const turn = Math.atan2(Math.sin(yaw - a.yaw), Math.cos(yaw - a.yaw));
    a.yaw += turn * (1 - Math.exp(-8 * dt)); a.last = t;
    const roll = reduced ? 0 : Math.max(-.5, Math.min(.5, turn * .8));
    a.root.position.copy(flight.watcher); a.root.rotation.set(0, a.yaw, roll, 'YXZ');
    const distance = camera.position.distanceTo(a.root.position);
    a.root.scale.setScalar(1 + .42 * clamp01((distance - 12) / 53));
    a.rig.root.rotation.x = phase === 'late' ? -.12 : -.62;
    a.rig.joints.forEach(j => j.quaternion.identity());
    blendAngelClip(a.rig.joints, a.clips.flight, clipTime(a.clips.flight, reduced ? .2 : t * .72, true), .9, FULL);
    if (phase === 'safe' && after < .45) blendAngelClip(a.rig.joints, a.clips.hit, after, .83 * (1 - after / .45), UPPER_BODY);
    a.chest.getWorldQuaternion(a.parent); a.wings.quaternion.copy(a.parent.invert()).multiply(a.root.quaternion);
    const speed = phase === 'late' ? 0 : a.ahead.length();
    a.mat.wings.step(0, t, speed, reduced, phase === 'safe' ? .65 : .12);
    a.wings.getWorldPosition(a.center);
    a.side.set(WATCHER_WING.root[0] + 2.05 * WATCHER_WING.scale, 0, .13).multiplyScalar(a.root.scale.x).applyQuaternion(a.root.quaternion);
    const distanceFade = clamp01((distance - 12) / 16);
    a.wake.step(t, a.center, a.side, a.ahead, distanceFade * (phase === 'late' ? 1 - clamp01(after) : .92));
  });
  return <group ref={mount} />;
}
