// The counter warning above a demon about to hit the angel (Arkham's attack indicator): a gold ring around it and a marker
// pointing down at it, pulsing smoothly at 2.5 Hz (no hard flashes, WCAG 2.3.1). A dart already in flight gets the ring alone.
// Two meshes, additive, hidden when no window is open. Reduced motion holds the pulse steady.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { counterState } from '@/game/counterState';
import { battle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

export default function CounterCue() {
  const cue = useMemo(() => {
    const material = new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: .9, blending: AdditiveBlending, depthWrite: false,
      depthTest: false, toneMapped: false, side: 2 });
    const ring = new Mesh(new RingGeometry(1.5, 1.75, 40), material), marker = new Mesh(new ConeGeometry(.32, .8, 4), material);
    marker.rotation.x = Math.PI; ring.renderOrder = marker.renderOrder = 3;
    const root = new Group(); root.add(ring, marker); root.visible = false;
    return { root, ring, marker, material, clock: 0 };
  }, []);
  useEffect(() => () => { cue.ring.geometry.dispose(); cue.marker.geometry.dispose(); cue.material.dispose(); }, [cue]);
  useFrame(({ camera }, dt) => {
    const { open, attacker, bolt } = counterState, s = runtime.shooter;
    cue.root.visible = open;
    if (!open) return;
    cue.clock += dt;
    const at = attacker >= 0 ? s.targets[attacker].c : bolt >= 0 ? battle.bolts[bolt].p : null;
    if (!at) { cue.root.visible = false; return; }
    const pulse = useGame.getState().reduced ? 1 : .8 + .2 * Math.sin(cue.clock * Math.PI * 5);
    cue.ring.position.set(at.x, at.y, at.z); cue.ring.quaternion.copy(camera.quaternion); cue.ring.scale.setScalar(pulse * (attacker >= 0 ? 1 : .55));
    cue.marker.visible = attacker >= 0;
    cue.marker.position.set(at.x, at.y + 2.4 + .25 * pulse, at.z);
    cue.material.opacity = .65 + .3 * pulse;
  }, -17);
  return <primitive object={cue.root} dispose={null} />;
}
