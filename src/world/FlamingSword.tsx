// The angel's flaming sword (Genesis 3:24; Numbers 22:31), held in the right hand. The suit publishes its forearm_r bone; the sword
// sits in that bone's hand_r child, in the fist (swordGrip.ts), so every cut swings it with the wrist. Fire runs along the blade
// and flares on a stroke, and the blade leaves a trail of its real path through the air: the swing you see is the swing that
// happened. Original procedural geometry (swordBlade.ts); three draw calls.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { banish, FX } from '@/game/banish';
import { presentation } from '@/game/presentation';
import { strike as dive } from '@/game/strike';
import { useGame } from '@/game/store';
import { cannonLink } from './cannonContract';
import { createRibbon } from './ribbon';
import { BLADE, GUARD, flameGeometry, flameMaterial, swordGeometry } from './swordBlade';
import { SWORD_GRIP, swordGripRotation } from './swordGrip';

/** The trail shows only while the blade is really moving against the angel's own travel (m/s), and lasts this long (s). */
export const TRAIL = { from: 5, full: 16, life: .2, sections: 30 } as const;
const base = new Vector3(), tip = new Vector3(), last = new Vector3();
export default function FlamingSword() {
  const scene = useThree(three => three.scene);
  const sword = useMemo(() => {
    const root = new Group(); root.position.set(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z); swordGripRotation(root.quaternion);
    const metal = new Mesh(swordGeometry(), new MeshStandardMaterial({ color: '#f3dca2', metalness: .78, roughness: .22, emissive: '#ffb347', emissiveIntensity: .55, flatShading: true }));
    const fire = flameMaterial(), shell = new Mesh(flameGeometry(), fire);
    root.add(metal, shell); root.visible = false;
    return { root, metal, shell, fire, trail: createRibbon(TRAIL.sections, '#ffbf66'), seen: false };
  }, []);
  useEffect(() => {
    scene.add(sword.trail.mesh);
    return () => {
      sword.root.removeFromParent(); sword.trail.mesh.removeFromParent(); sword.trail.dispose();
      sword.metal.geometry.dispose(); (sword.metal.material as MeshStandardMaterial).dispose(); sword.shell.geometry.dispose(); sword.fire.dispose();
    };
  }, [scene, sword]);
  useFrame((_, delta) => {
    const state = useGame.getState(), dt = Math.min(.05, delta);
    const hand = cannonLink.forearm?.children.find(c => c.name === 'hand_r') ?? null;
    if (hand && sword.root.parent !== hand) hand.add(sword.root);
    if (!hand && sword.root.parent) sword.root.removeFromParent();
    sword.root.visible = !!hand;
    // Brightest on the newest sword stroke and through a cut's wind-up, settling back to a steady burn.
    let stroke = 1e9;
    for (const e of banish.fx) if (e.kind === FX.sword && e.serial > 0) stroke = Math.min(stroke, banish.clock - e.t);
    const flare = Math.max(dive.phase === 1 ? .7 : 0, 1 - stroke / .4);
    sword.fire.uniforms.uFlare.value = flare;
    if (!state.paused && !state.reduced) sword.fire.uniforms.uTime.value += dt;
    if (state.paused) return;
    // The trail: the blade's edge from guard to point, measured against the angel's own position, so a dive at 80 m/s leaves no
    // streak but a cut, a twirl or a flip does. It is drawn where the angel is now.
    const hero = presentation.position, trail = sword.trail;
    if (!hand || state.reduced || state.camera !== 'third') { trail.clear(); sword.seen = false; return; }
    sword.root.updateWorldMatrix(true, false);
    base.set(0, -GUARD, 0).applyMatrix4(sword.root.matrixWorld); tip.set(0, -GUARD - BLADE, 0).applyMatrix4(sword.root.matrixWorld);
    base.x -= hero.x; base.y -= hero.y; base.z -= hero.z; tip.x -= hero.x; tip.y -= hero.y; tip.z -= hero.z;
    const swing = sword.seen && dt > 0 ? tip.distanceTo(last) / dt : 0; last.copy(tip); sword.seen = true;
    const strength = Math.min(1, Math.max(0, (swing - TRAIL.from) / (TRAIL.full - TRAIL.from)));
    if (strength > 0 || trail.count) trail.push(tip.x, tip.y, tip.z, base.x, base.y, base.z, strength * (.4 + .35 * flare));
    trail.update(dt, TRAIL.life); trail.mesh.position.set(hero.x, hero.y, hero.z);
  }, -18);
  return null;
}
