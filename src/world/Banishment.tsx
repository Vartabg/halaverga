// What the textual commands look like (docs/research/combat-texts.md): a gold ring of the spoken rebuke, a flaming sword arc,
// chains on a bound demon and a line down into the abyss, the abyss sealing, and the shield of faith before the angel.
// Six instanced draw calls, additive, faded by instance colour (black is invisible). Game fiction drawn from the texts.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial,
  Quaternion, RingGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { MAX_DRONES, type Vec3 } from '@/game/combat';
import { banish, FX, MODE } from '@/game/banish';
import { battle } from '@/game/celestialBattle';
import { presentation } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

const GOLD = new Color('#ffd27a'), FIRE = new Color('#ff7a2a'), CRIMSON = new Color('#ff3b1f'), PALE = new Color('#f4ecd8');
const m4 = new Matrix4(), q = new Quaternion(), tilt = new Quaternion(), at = new Vector3(), sc = new Vector3(), c = new Color();
const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0), look = new Vector3();
function pool(geometry: BufferGeometry, n: number) {
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false,
    blending: AdditiveBlending, side: 2 }), n);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setRGB(0, 0, 0));
  mesh.instanceColor!.setUsage(DynamicDrawUsage); mesh.count = 0; return mesh;
}
type Slot = { kind: number; t: number; from: Vec3; to: Vec3; drone: number };
const ACTIVE = 6, LIFE: Record<number, number> = { [FX.rebuke]: .55, [FX.sword]: .38, [FX.seal]: .9, [FX.bind]: .5, [FX.down]: .5, [FX.cast]: .4 };

export default function Banishment() {
  const parts = useMemo(() => ({
    rings: pool(new TorusGeometry(1, .07, 6, 40), ACTIVE * 2),
    arcs: pool(new RingGeometry(1.5, 2.1, 28, 1, 0, Math.PI * 1.15), ACTIVE),
    chains: pool(new TorusGeometry(1.25, .06, 5, 28), MAX_DRONES * 2),
    lines: pool(new CylinderGeometry(.05, .05, 1, 5, 1, true), MAX_DRONES),
    shield: pool(new RingGeometry(.78, .95, 48), 1),
    slots: Array.from({ length: ACTIVE }, (): Slot => ({ kind: 0, t: -1e9, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, drone: -1 })),
    seen: { last: 0 }, next: 0, quench: -1e9,
  }), []);
  const list = [parts.rings, parts.arcs, parts.chains, parts.lines, parts.shield];
  useEffect(() => { parts.seen.last = banish.fxSerial; return () => list.forEach(m => { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); m.dispose(); }); }, [parts]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ camera }) => {
    const b = banish, s = runtime.shooter, now = b.clock, reduced = useGame.getState().reduced;
    for (let n = Math.max(parts.seen.last + 1, b.fxSerial - b.fx.length + 1); n <= b.fxSerial; n++) {
      const e = b.fx[(n - 1) % b.fx.length];
      if (e.kind === FX.quench) { parts.quench = e.t; continue; }
      const slot = parts.slots[parts.next++ % ACTIVE];
      slot.kind = e.kind; slot.t = e.t; slot.drone = e.drone; Object.assign(slot.from, e.from); Object.assign(slot.to, e.to);
    }
    parts.seen.last = b.fxSerial;
    let rings = 0, arcs = 0;
    for (const slot of parts.slots) {
      const age = now - slot.t, life = LIFE[slot.kind] ?? 0;
      if (!(age >= 0 && age < life)) continue;
      const u = age / life, fade = 1 - u;
      if (slot.kind === FX.rebuke) {
        // The word travels from the angel to the demon in the first .2 s, then rings out around it.
        const k = Math.min(1, age / .2), target = slot.drone >= 0 ? s.targets[slot.drone].c : slot.to;
        at.set(slot.from.x + (target.x - slot.from.x) * k, slot.from.y + 1.2 + (target.y - slot.from.y - 1.2) * k, slot.from.z + (target.z - slot.from.z) * k);
        sc.setScalar(k < 1 ? .5 + k : 1.5 + (age - .2) * 7);
        parts.rings.setMatrixAt(rings, m4.compose(at, camera.quaternion, sc)); parts.rings.setColorAt(rings++, c.copy(GOLD).multiplyScalar(fade * 1.6));
      } else if (slot.kind === FX.sword) {
        const target = slot.drone >= 0 ? s.targets[slot.drone].c : slot.to;
        at.set(target.x, target.y, target.z); tilt.setFromAxisAngle(look.set(0, 0, 1), (reduced ? 0 : u * 2.4) - .6 + slot.t * 7 % 3);
        q.copy(camera.quaternion).multiply(tilt); sc.setScalar(1 + u * .4);
        parts.arcs.setMatrixAt(arcs, m4.compose(at, q, sc)); parts.arcs.setColorAt(arcs++, c.copy(FIRE).multiplyScalar(fade * 2));
      } else if (slot.kind === FX.seal || slot.kind === FX.cast || slot.kind === FX.bind || slot.kind === FX.down) {
        // The abyss closing (crimson to gold, flat), a bind flash, or the pale ring of a demon thrown down.
        const p = slot.kind === FX.seal ? slot.to : slot.drone >= 0 ? s.targets[slot.drone].c : slot.to;
        at.set(p.x, p.y, p.z); q.setFromAxisAngle(X, Math.PI / 2);
        sc.setScalar(slot.kind === FX.seal ? 1 + u * 9 : 1.2 + u * 2.5);
        const tint = slot.kind === FX.seal ? c.copy(CRIMSON).lerp(GOLD, u) : slot.kind === FX.down ? c.copy(PALE) : c.copy(GOLD);
        parts.rings.setMatrixAt(rings, m4.compose(at, q, sc)); parts.rings.setColorAt(rings++, tint.multiplyScalar(fade * 1.5));
      }
    }
    // Standing states: chains around a bound demon with a line into the abyss below; a slow pale halo on one thrown down.
    let chains = 0, lines = 0;
    for (let i = 0; i < s.drones.count; i++) {
      const m = b.mode[i], p = s.targets[i].c;
      if (m !== MODE.bound && m !== MODE.down && m !== MODE.cast) continue;
      at.set(p.x, p.y, p.z);
      if (m === MODE.down) {
        q.setFromAxisAngle(X, Math.PI / 2); sc.setScalar(1.4);
        const pulse = reduced ? .7 : .45 + .35 * Math.sin(now * 4 + i);
        parts.chains.setMatrixAt(chains, m4.compose(at, q, sc)); parts.chains.setColorAt(chains++, c.copy(PALE).multiplyScalar(pulse));
        continue;
      }
      for (const a of [.6, -.6]) {
        q.setFromAxisAngle(Y, now * (reduced ? 0 : .6) + i).multiply(tilt.setFromAxisAngle(X, Math.PI / 2 + a)); sc.setScalar(1);
        parts.chains.setMatrixAt(chains, m4.compose(at, q, sc)); parts.chains.setColorAt(chains++, c.copy(GOLD).multiplyScalar(1.3));
      }
      const depth = Math.max(2, p.y);
      at.set(p.x, p.y - depth / 2, p.z); sc.set(1, depth, 1);
      parts.lines.setMatrixAt(lines, m4.compose(at, q.identity(), sc)); parts.lines.setColorAt(lines++, c.copy(GOLD).multiplyScalar(.55));
    }
    // The shield before the angel, facing where it looks; it flares when a fiery dart is quenched.
    const flare = Math.max(0, 1 - (now - parts.quench) / .35), shieldUp = s.input.shield !== 0 && battle.status !== 'fallen';
    if (shieldUp || flare > 0) {
      const h = presentation.position, d = s.aim.dir;
      at.set(h.x + d.x * 1.3, h.y + 1.1 + d.y * 1.3, h.z + d.z * 1.3); q.setFromUnitVectors(look.set(0, 0, 1), sc.set(-d.x, -d.y, -d.z)); sc.setScalar(1 + flare * .35);
      parts.shield.setMatrixAt(0, m4.compose(at, q, sc)); parts.shield.setColorAt(0, c.copy(GOLD).multiplyScalar((shieldUp ? .55 : 0) + flare * 1.4));
      parts.shield.count = 1;
    } else parts.shield.count = 0;
    parts.rings.count = rings; parts.arcs.count = arcs; parts.chains.count = chains; parts.lines.count = lines;
    for (const mesh of list) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
  }, -18);
  return <>{list.map((mesh, i) => <primitive key={i} object={mesh} dispose={null} />)}</>;
}
