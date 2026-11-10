// The angel's flaming sword (Genesis 3:24; Numbers 22:31), held in the right hand in place of the old arm cannon. The suit publishes
// its forearm_r bone; the sword sits in that bone's hand_r child, in the fist (swordGrip.ts), so the library cuts swing it with the
// wrist. The flame shell flares on each sword stroke. Original procedural geometry; two draw calls.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { banish, FX } from '@/game/banish';
import { cannonLink } from './cannonContract';
import { SWORD_GRIP, swordGripRotation } from './swordGrip';

const BLADE = 1.05, FLAME = new Color('#ff8a2e');
export default function FlamingSword() {
  const sword = useMemo(() => {
    const blade = new BoxGeometry(.045, BLADE, .014).translate(0, -BLADE / 2 - .1, 0);
    const guard = new BoxGeometry(.24, .03, .045).translate(0, -.08, 0), grip = new BoxGeometry(.03, .14, .03).translate(0, 0, 0);
    const steel = mergeGeometries([blade, guard, grip])!; [blade, guard, grip].forEach(g => g.dispose());
    const root = new Group(); root.position.set(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z); swordGripRotation(root.quaternion);
    const metal = new Mesh(steel, new MeshStandardMaterial({ color: '#f3dca2', metalness: .7, roughness: .25, emissive: '#ffb347', emissiveIntensity: .6 }));
    const shell = new Mesh(new BoxGeometry(.11, BLADE + .1, .06).translate(0, -BLADE / 2 - .1, 0),
      new MeshBasicMaterial({ color: FLAME, transparent: true, opacity: .35, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    root.add(metal, shell); root.visible = false;
    return { root, metal, shell, last: 0 };
  }, []);
  useEffect(() => () => {
    sword.root.removeFromParent();
    for (const m of [sword.metal, sword.shell]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
  }, [sword]);
  useFrame(() => {
    const hand = cannonLink.forearm?.children.find(c => c.name === 'hand_r') ?? null;
    if (hand && sword.root.parent !== hand) hand.add(sword.root);
    if (!hand && sword.root.parent) sword.root.removeFromParent();
    sword.root.visible = !!hand;
    // Brightest on the newest sword stroke, settling back to a steady burn.
    let strike = 1e9;
    for (const e of banish.fx) if (e.kind === FX.sword && e.serial > 0) strike = Math.min(strike, banish.clock - e.t);
    const flare = Math.max(0, 1 - strike / .4);
    (sword.shell.material as MeshBasicMaterial).opacity = .3 + .6 * flare;
    sword.shell.scale.set(1 + flare * .8, 1, 1 + flare * .8);
  }, -18);
  return null;
}
