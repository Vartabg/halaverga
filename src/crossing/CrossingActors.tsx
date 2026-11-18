import { useLayoutEffect, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { bindAngelClips, blendAngelClip, UPPER_BODY } from '@/world/angelClips';
import { angelRegalia } from '@/world/angelRegalia';
import { alignArchangelWings, createArchangelWings, stepArchangelWings } from '@/world/archangelWings';
import { createPose, sampleClip } from '@/world/clipSampler';
import { CUT_CLIPS } from '@/world/cutClips';
import { FLIGHT } from '@/world/flightClips';
import { buildSuitRig } from '@/world/suitRig';
import { BLADE, GUARD, flameGeometry, flameMaterial, swordGeometry } from '@/world/swordBlade';
import { SWORD_GRIP, swordGripRotation } from '@/world/swordGrip';
import { clamp01, ease } from './crossingWalk';
import type { WalkSurface } from './crossingSurface';
import CrossingTravelers from './CrossingTravelers';
import CrossingWatcher from './CrossingWatcher';
import type { Crossing } from './flight';

const models = ['/models/archangel.glb', '/models/watcher.glb'];
export function clearCrossingModels() { useLoader.clear(GLTFLoader, models); }

/** Keep the authored shoulder and wrist cut. In the last two metres turn its blade onto the moving body. */
function contactPose(sword: Mesh, shoulder: Object3D, hand: Object3D) {
  const tip = new Vector3(), from = new Vector3(), to = new Vector3(), pivot = new Vector3(), point = new Vector3();
  const correction = new Quaternion(), basis = new Quaternion(), local = new Quaternion();
  function turn(bone: Object3D, weight: number) {
    sword.localToWorld(tip.set(0, -GUARD - BLADE, 0));
    if (bone === hand) sword.getWorldPosition(pivot); else bone.getWorldPosition(pivot);
    from.subVectors(tip, pivot).normalize(); to.subVectors(point, pivot).normalize();
    correction.setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(basis));
    local.copy(bone.parent!.getWorldQuaternion(basis)).invert().multiply(correction);
    bone.quaternion.slerp(local, weight);
  }
  return (target: Crossing['watcher'], weight: number) => {
    if (!weight) return;
    point.copy(target); point.y += .16;
    turn(shoulder, .72 * weight); turn(hand, weight);
  };
}

function pilot(asset: GLTF) {
  const rig = buildSuitRig(asset.scene), clips = bindAngelClips(asset.animations), pose = createPose();
  const wings = createArchangelWings(), regalia = angelRegalia(rig.root, rig.joints);
  rig.joints[11].add(wings.root);
  Object.assign(wings.motion, { flying: true, unfold: 1, glide: .85 });
  const metal = new MeshStandardMaterial({ color: '#f3dca2', metalness: .78, roughness: .22, emissive: '#ffba59', emissiveIntensity: .55 });
  const sword = new Mesh(swordGeometry(), metal), fire = new Mesh(flameGeometry(), flameMaterial());
  sword.add(fire); sword.position.copy(SWORD_GRIP); swordGripRotation(sword.quaternion); rig.joints[16].add(sword);
  return { rig, wings, regalia, clips, pose, fire, contact: contactPose(sword, rig.joints[3], rig.joints[16]), yaw: 0, bank: 0, last: -1, dispose() {
    rig.root.removeFromParent(); regalia.dispose(); wings.dispose(); rig.dispose();
    sword.geometry.dispose(); metal.dispose(); fire.geometry.dispose(); fire.material.dispose();
  } };
}

function Pilot({ asset, flight, reduced, paused }: { asset: GLTF; flight: Crossing; reduced: boolean; paused: boolean }) {
  const mount = useRef<Group>(null), who = useRef<ReturnType<typeof pilot> | null>(null);
  useLayoutEffect(() => {
    const person = pilot(asset); who.current = person; mount.current!.add(person.rig.root);
    return () => { who.current = null; person.dispose(); };
  }, [asset]);
  useFrame((_, delta) => {
    const a = who.current;
    if (!a) return;
    const { player: p, velocity: v, watcher: w, phase } = flight, t = flight.elapsed + flight.after;
    if (t < a.last || a.last < 0) {
      a.yaw = a.bank = 0; Object.assign(a.wings.motion, { flying: true, unfold: 1, glide: .85, phase: 0 });
      a.wings.strikeFold = 0;
    }
    a.last = t;
    const dt = paused ? 0 : Math.min(.08, delta), k = 1 - Math.exp(-dt * 9);
    const striking = phase === 'strike', cutting = striking || phase === 'safe' && flight.after < .48;
    const reaching = striking || phase === 'safe' && flight.after < .11;
    const yaw = reaching ? Math.atan2(p.x - w.x, p.z - w.z) : Math.atan2(-v.x, Math.max(3, -v.z));
    a.yaw += Math.atan2(Math.sin(yaw - a.yaw), Math.cos(yaw - a.yaw)) * (reaching ? 1 - Math.exp(-31 * dt) : k);
    const roll = reduced ? 0 : -.45 * Math.max(-1, Math.min(1, v.x / 13));
    a.bank += (roll - a.bank) * k;
    const lean = -.91 + Math.max(-.28, Math.min(.30, v.y * .024)) + (cutting ? .49 : 0);
    a.rig.root.position.copy(p); a.rig.root.rotation.set(lean, a.yaw, a.bank, 'YXZ');
    sampleClip(FLIGHT.cruise, reduced ? 0 : t, a.pose);
    a.rig.joints.forEach((bone, i) => bone.quaternion.fromArray(a.pose, i * 4));
    a.rig.joints[1].rotation.x += .47;
    const cut = CUT_CLIPS[0];
    if (cutting) {
      const distance = Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z);
      const contact = striking ? 1 - ease((distance - BLADE) / 2.1) : 1 - ease((flight.after - .07) / .15);
      const clipTime = striking ? cut.raised * clamp01(flight.strikeTime / .10) + (cut.impact - cut.raised) * contact : cut.impact + flight.after * .82;
      const weight = striking ? clamp01(.28 + flight.strikeTime * 10) : 1 - ease((flight.after - .22) / .26);
      blendAngelClip(a.rig.joints, a.clips[cut.clip], clipTime, weight, UPPER_BODY);
      a.contact(w, contact);
    } else {
      blendAngelClip(a.rig.joints, a.clips.swordIdle, 0, .68, UPPER_BODY);
    }
    a.regalia.step(dt, reduced || paused);
    stepArchangelWings(a.wings, true, false, reduced, Math.hypot(v.x, v.z), v.y, a.bank, dt, 0, striking);
    alignArchangelWings(a.wings, a.rig.root, lean);
    a.fire.material.uniforms.uTime.value = reduced ? 0 : t;
    a.fire.material.uniforms.uFlare.value = cutting ? 1 : .12;
  });
  return <group ref={mount} />;
}

export default function CrossingActors(props: { flight: Crossing; reduced: boolean; paused: boolean; surface: WalkSurface }) {
  const [angel, watcher] = useLoader(GLTFLoader, models);
  return <><Pilot asset={angel} {...props} /><CrossingWatcher asset={watcher} {...props} />
    <CrossingTravelers asset={angel} flight={props.flight} reduced={props.reduced} surface={props.surface} /></>;
}
