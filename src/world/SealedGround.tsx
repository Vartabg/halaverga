import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector4, type Group } from 'three';
import { banish, FX } from '@/game/banishState';
import { isElite } from '@/game/encounter';
import { battle } from '@/game/celestialBattle';
import { useGame } from '@/game/store';
import { restingHeight } from '@/game/wardenElevation';
/** Where each warden was cast down: a gold ring on the mountain. No alternate encounter state or movement owner; cleared on a real
 * encounter reset. */
const RING = 11.2;
const sealedGround = { centers: [new Vector4(), new Vector4()], count: 0 };
export default function SealedGround() {
  const state = useMemo(() => ({ seen: banish.fxSerial, clock: battle.clock, groups: [] as (Group | null)[] }), []);
  useEffect(() => {
    const clear = () => { sealedGround.count = 0; sealedGround.centers.forEach(p => p.set(0, 0, 0, 0)); };
    clear(); return clear;
  }, []);
  useFrame((_, elapsed) => {
    const game = useGame.getState(); if (game.paused) return;
    if (battle.clock < state.clock) { sealedGround.count = 0; sealedGround.centers.forEach(p => p.set(0, 0, 0, 0)); state.seen = banish.fxSerial; }
    state.clock = battle.clock;
    for (let n = Math.max(state.seen + 1, banish.fxSerial - banish.fx.length + 1); n <= banish.fxSerial; n++) {
      const e = banish.fx[(n - 1) % banish.fx.length];
      if (e.kind === FX.seal && isElite(e.drone)) {
        sealedGround.centers[e.drone === 5 ? 0 : 1].set(e.to.x, e.to.z, 0, 1);
        sealedGround.count = sealedGround.centers.filter(p => p.w > 0).length;
      }
    }
    state.seen = banish.fxSerial;
    sealedGround.centers.forEach((p, i) => {
      p.z = game.reduced ? 1 : Math.min(1, p.z + Math.min(.05, elapsed) * .7);
      const g = state.groups[i]; if (!g) return;
      g.visible = p.w > 0; g.position.set(p.x, restingHeight(p.x, p.y, RING) + .3, p.y); g.scale.setScalar(.35 + p.z * .65);
    });
  }, -16);
  return <group>{[0, 1].map(i => <group key={i} visible={false} ref={g => { state.groups[i] = g; }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[RING - .4, RING, 48]} />
      <meshBasicMaterial color="#e8ca86" toneMapped={false} transparent opacity={.55} depthWrite={false} /></mesh>
    <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[.05, .22, 4.4, 5]} />
      <meshBasicMaterial color="#ffe5a0" toneMapped={false} /></mesh>
  </group>)}</group>;
}
