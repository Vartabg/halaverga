// What the textual commands look like (docs/research/combat-texts.md): a gold ring of the spoken rebuke, a flaming sword arc,
// chains on a bound demon and a line down into the abyss, the abyss sealing, and the shield of faith before the angel.
// Six instanced draw calls, additive, faded by instance colour (black is invisible). Game fiction drawn from the texts.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial,
  Quaternion, RingGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { slashGeometry } from './slashGeometry';
import { MAX_DRONES, type Vec3 } from '@/game/combat';
import { banish, FX, MODE } from '@/game/banish';
import { battle } from '@/game/celestialBattle';
import { presentation } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { combatAudio } from '@/ui/combatAudio';
import { castDuration, isElite } from '@/game/encounter';
import { CUTS } from '@/game/swordString';

const GOLD = new Color('#ffd27a'), FIRE = new Color('#ff7a2a'), CRIMSON = new Color('#ff3b1f'), PALE = new Color('#f4ecd8');
const m4 = new Matrix4(), q = new Quaternion(), tilt = new Quaternion(), at = new Vector3(), sc = new Vector3(), c = new Color();
const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1), look = new Vector3();
function pool(geometry: BufferGeometry, n: number) {
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false,
    blending: AdditiveBlending, side: 2 }), n);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setRGB(0, 0, 0));
  mesh.instanceColor!.setUsage(DynamicDrawUsage); mesh.count = 0; return mesh;
}
type Slot = { kind: number; t: number; from: Vec3; to: Vec3; drone: number; n: number };
const ACTIVE = 12, LIFE: Record<number, number> = { [FX.rebuke]: .55, [FX.sword]: .48, [FX.armor]: .7, [FX.seal]: .9, [FX.impact]: .55, [FX.bind]: .5, [FX.down]: .5, [FX.cast]: .4 };

export default function Banishment() {
  const parts = useMemo(() => ({
    rings: pool(new TorusGeometry(1, .07, 6, 40), ACTIVE * 3),
    arcs: pool(slashGeometry(), ACTIVE),
    chains: pool(new TorusGeometry(1.25, .06, 5, 28), MAX_DRONES * 2),
    lines: pool(new CylinderGeometry(.05, .05, 1, 5, 1, true), MAX_DRONES),
    shield: pool(new RingGeometry(.78, .95, 48), 1),
    slots: Array.from({ length: ACTIVE }, (): Slot => ({ kind: 0, t: -1e9, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, drone: -1, n: 0 })),
    seen: { last: 0 }, next: 0, quench: -1e9,
  }), []);
  const list = [parts.rings, parts.arcs, parts.chains, parts.lines, parts.shield];
  useEffect(() => { parts.seen.last = banish.fxSerial; return () => list.forEach(m => { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); m.dispose(); }); }, [parts]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ camera }) => {
    const b = banish, s = runtime.shooter, now = b.clock, reduced = useGame.getState().reduced;
    for (let n = Math.max(parts.seen.last + 1, b.fxSerial - b.fx.length + 1); n <= b.fxSerial; n++) {
      const e = b.fx[(n - 1) % b.fx.length];
      combatAudio(e.kind, isElite(e.drone), banish.combo, b.guardTime[e.drone] > 0, e.n);
      if (e.kind === FX.quench) { parts.quench = e.t; continue; }
      const slot = parts.slots[parts.next++ % ACTIVE];
      slot.kind = e.kind; slot.t = e.t; slot.drone = e.drone; slot.n = e.n; Object.assign(slot.from, e.from); Object.assign(slot.to, e.to);
    }
    parts.seen.last = b.fxSerial;
    let rings = 0, arcs = 0;
    for (const slot of parts.slots) {
      const age = now - slot.t, life = (LIFE[slot.kind] ?? 0) * (slot.kind === FX.sword ? 1 + .22 * slot.n : 1);
      if (!(age >= 0 && age < life)) continue;
      const u = age / life, fade = 1 - u;
      if (slot.kind === FX.rebuke) {
        // The word travels from the angel to the demon in the first .2 s, then rings out around it.
        const k = Math.min(1, age / .2), target = slot.drone >= 0 ? s.targets[slot.drone].c : slot.to;
        at.set(slot.from.x + (target.x - slot.from.x) * k, slot.from.y + 1.2 + (target.y - slot.from.y - 1.2) * k, slot.from.z + (target.z - slot.from.z) * k);
        sc.setScalar(k < 1 ? .5 + k : 1.5 + (age - .2) * 7);
        parts.rings.setMatrixAt(rings, m4.compose(at, camera.quaternion, sc)); parts.rings.setColorAt(rings++, c.copy(GOLD).multiplyScalar(fade * 1.6));
      } else if (slot.kind === FX.sword || slot.kind === FX.armor) {
        // Each cut of the string draws its own stroke: a long flat crescent at that cut's angle, swept through as it fades
        // (level for the cross cut, climbing for the rising cut, upright and largest for the casting blow).
        const target = slot.to, cut = CUTS[slot.n] ?? CUTS[0], sweep = reduced ? 0 : (u - .35) * (cut.arc < 0 ? -1.1 : 1.1);
        at.set(target.x, target.y, target.z); tilt.setFromAxisAngle(look.set(0, 0, 1), cut.arc + sweep);
        const grow = (reduced ? 1.1 : .8 + u * .9) * cut.arcScale;
        q.copy(camera.quaternion).multiply(tilt); sc.set(2.3 * grow, 1.15 * grow, 1);
        const tint = slot.kind === FX.armor ? c.copy(GOLD) : c.copy(FIRE).lerp(PALE, slot.n * .28);
        parts.arcs.setMatrixAt(arcs, m4.compose(at, q, sc)); parts.arcs.setColorAt(arcs++, tint.multiplyScalar(fade * (1.7 + .5 * slot.n)));
      } else if (slot.kind === FX.impact) {
        // A thrown demon struck: a ring thrown out across the surface it hit (flat on the ground, upright on a cliff face),
        // wider and brighter the harder the strike. slot.n is the speed of the contact.
        const hard = Math.min(1, slot.n / 70);
        at.set(slot.to.x, slot.to.y, slot.to.z); look.set(slot.from.x - slot.to.x, slot.from.y - slot.to.y, slot.from.z - slot.to.z).normalize();
        q.setFromUnitVectors(Z, look); sc.setScalar(reduced ? 1.5 + hard * 2 : .8 + (2 + hard * 7) * (1 - (1 - u) ** 3));
        parts.rings.setMatrixAt(rings, m4.compose(at, q, sc)); parts.rings.setColorAt(rings++, c.copy(PALE).lerp(GOLD, hard).multiplyScalar(fade * (.7 + hard)));
      } else if (slot.kind === FX.seal || slot.kind === FX.cast || slot.kind === FX.bind || slot.kind === FX.down) {
        // The abyss closing (crimson to gold, flat), a bind flash, or the pale ring of a demon thrown down.
        const p = slot.kind === FX.seal ? slot.to : slot.drone >= 0 ? s.targets[slot.drone].c : slot.to;
        at.set(p.x, p.y, p.z);
        // Cast down: a ring thrown out flat across the ground where the demon was driven in.
        q.setFromAxisAngle(X, Math.PI / 2);
        sc.setScalar(reduced ? 1.8 : slot.kind === FX.seal ? 1.4 + 8 * (1 - (1 - u) ** 3) : 1.2 + u * 2.5);
        const tint = slot.kind === FX.seal ? c.copy(GOLD).lerp(PALE, u) : slot.kind === FX.down ? c.copy(PALE) : c.copy(GOLD);
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
      if (m === MODE.cast) {
        const origin = b.base[i], progress = Math.min(1, b.timer[i] / castDuration(i));
        at.set(origin.x, origin.y, origin.z); q.copy(camera.quaternion);
        sc.setScalar(reduced ? 1.8 : 1.8 + .4 * Math.sin(Math.PI * progress));
        parts.rings.setMatrixAt(rings, m4.compose(at, q, sc));
        parts.rings.setColorAt(rings++, c.copy(CRIMSON).lerp(GOLD, progress).multiplyScalar(.6));
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
