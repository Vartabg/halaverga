import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, ConeGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3 } from 'three';
import { banish } from '@/game/banishState';
import { ELITES } from '@/game/encounter';
import { WA, WARDEN } from '@/game/banishState';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { wardenAudio } from '@/ui/combatAudio';
import { attackTelegraph } from './wardenTelegraphs';
const matrix = new Matrix4(), q = new Quaternion(), at = new Vector3(), scale = new Vector3(), direction = new Vector3();
const up = new Vector3(0, 1, 0), red = new Color('#f36f56'), gold = new Color('#ffe3a0'), amber = new Color('#efb76b');
function pool(geometry: ConeGeometry | TorusGeometry, count: number) {
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ color: '#ffffff', toneMapped: false, depthWrite: false }), count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setColorAt(i, gold);
  mesh.instanceColor!.setUsage(DynamicDrawUsage); mesh.count = 0; return mesh;
}
/** Three pooled draws: committed lanes, readable incoming darts, and the exposed enemy's shrinking counter ring. */
export default function WardenAttacks() {
  const parts = useMemo(() => ({ arrows: pool(new ConeGeometry(.45, 1.4, 4), 48), bolts: pool(new ConeGeometry(.35, 1.6, 7), 6),
    rings: pool(new TorusGeometry(1, .065, 5, 40), 8), phases: new Uint8Array(8), serial: 0 }), []);
  const list = useMemo(() => [parts.arrows, parts.bolts, parts.rings], [parts]);
  useEffect(() => () => { list.forEach(m => { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); m.dispose(); }); }, [list]);
  useFrame(({ camera }) => {
    const w = banish.wardens, f = runtime.shooter.drones, game = useGame.getState();
    let arrows = 0, rings = 0, bolts = 0;
    for (const i of ELITES) {
      const phase = w.phase[i], p = f.pos[i], aim = w.aim[i], tell = w.tell[i] || 1, move = w.move[i];
      if (phase !== parts.phases[i] && game.started && !game.paused) {
        if (phase === WA.tell) wardenAudio('tell');
        if (phase === WA.rush || phase === WA.volley || phase === WA.sweep || phase === WA.fan) wardenAudio('launch');
      }
      parts.phases[i] = phase;
      if (!phase) continue;
      const opening = phase === WA.recover && (w.open[i] > 0 || w.pending === i), color = opening ? gold : i === 5 ? red : amber;
      at.set(p.x, p.y, p.z); q.copy(camera.quaternion);
      const radius = opening ? 1.5 + w.open[i] / WARDEN.recover : phase === WA.tell ? 3 - Math.min(1, w.time[i] / tell) : 2;
      scale.setScalar(game.reduced ? 2.3 : radius);
      parts.rings.setMatrixAt(rings, matrix.compose(at, q, scale)); parts.rings.setColorAt(rings++, color);
      if (phase === WA.tell || phase === WA.rush || phase === WA.sweep || phase === WA.fan)
        arrows = attackTelegraph(parts.arrows, arrows, move, move === WA.rush ? w.start[i] : p, aim, color);
      if (opening) {
        for (let n = 0; n < 3; n++) {
          at.set(p.x + (n - 1) * .8, p.y + 3.4, p.z); q.identity(); scale.setScalar(.75);
          parts.arrows.setMatrixAt(arrows, matrix.compose(at, q, scale)); parts.arrows.setColorAt(arrows++, gold);
        }
      }
    }
    for (const o of w.bolts) {
      if (!o.live) continue;
      at.set(o.p.x, o.p.y, o.p.z); direction.set(o.v.x, o.v.y, o.v.z).normalize(); q.setFromUnitVectors(up, direction); scale.setScalar(1);
      parts.bolts.setMatrixAt(bolts, matrix.compose(at, q, scale)); parts.bolts.setColorAt(bolts++, amber);
    }
    if (w.serial !== parts.serial) { parts.serial = w.serial; if (game.started && !game.paused) wardenAudio(w.result); }
    parts.arrows.count = arrows; parts.rings.count = rings; parts.bolts.count = bolts;
    list.forEach(m => { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; });
  }, -4);
  return <group>{list.map((m, i) => <primitive key={i} object={m} dispose={null} />)}</group>;
}
