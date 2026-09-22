// Sparks, splashes, debris, fireball and smoke: 5 draw calls (sparks, additive sprites, alpha sprites, rings, debris).
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { EVENT_RING, MAX_DRONES, WATER_LEVEL, droneAlive, mulberry32, readEvents, type EventKind, type ShotEvent, type Vec3 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { claim, debrisAt, drawSparks, impactDelay, isShotKind, lobeDir, makePuffs, makeSparks, puffFrame, puffU, spawnPuff,
  spawnSpark, waterContactTime, type Puffs, type Ring } from './fxPools';
import { FX, commit, debrisPool, disposePool, drawPuffs, fxKit, place, retainFx, ringPool, sparkPool, spritePool, tint } from './fxMaterials';
const SPARKS = 128, ADD = 16, ALPHA = 24, RINGS = 8, DEBRIS = 32, DB = 16, PD = 10, UP = { x: 0, y: 1, z: 0 };
const m4 = new Matrix4(), q = new Quaternion(), eu = new Euler(), vp = new Vector3(), vs = new Vector3();

function createImpactFx() {
  const sparks = sparkPool(SPARKS), add = spritePool(ADD, true), alpha = spritePool(ALPHA, false), rings = ringPool(RINGS);
  const debris = debrisPool(DEBRIS), sp = makeSparks(SPARKS), addP = makePuffs(ADD), alphaP = makePuffs(ALPHA), ringP = makePuffs(RINGS);
  const sPos = sparks.geometry.attributes.position.array as Float32Array, sCol = sparks.geometry.attributes.color.array as Float32Array;
  // Debris per slot: born, end, p0 xyz, v0 xyz, spin xyz, rot0 xyz, scale, wet (ends on the water). Pending: spawnAt, point, normal.
  const db = new Float64Array(DEBRIS * DB), dbLive = new Uint8Array(DEBRIS), dbRing: Ring = { next: 0, size: DEBRIS };
  const pend = new Float64Array(EVENT_RING * PD), pendKind: EventKind[] = Array.from({ length: EVENT_RING }, () => 'miss');
  const pendLive = new Uint8Array(EVENT_RING), pendRing: Ring = { next: 0, size: EVENT_RING };
  const smokeAt = new Float64Array(MAX_DRONES), sparkAt = new Float64Array(MAX_DRONES), rng = mulberry32(0x1a2b3c);
  const cursor = { last: runtime.shooter.eventSerial }, p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 }, dir = { x: 0, y: 0, z: 0 };
  const v = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 }, pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 };
  let reduced = false, t = 0;
  const burstSparks = (c: Vec3, nrm: Vec3, count: number) => {
    for (let k = 0; k < count; k++) spawnSpark(sp, t, c, lobeDir(nrm, rng(), rng(), dir), 4 + 5 * rng(), .15 + .1 * rng());
  };
  const ring = (x: number, z: number, when: number) => {
    at.x = x; at.y = WATER_LEVEL + .02; at.z = z; spawnPuff(ringP, when, at, 0, .8, .2, 1.6, 1, FX.water, FX.water, .8);
  };
  const addDebris = (c: Vec3, speed0: number, speed1: number, up: number, scale: number) => {
    const i = claim(dbRing), o = i * DB, a = 2 * Math.PI * rng(), el = (rng() - .3) * .9, s = speed0 + (speed1 - speed0) * rng();
    v.x = Math.cos(el) * Math.cos(a) * s; v.y = Math.sin(el) * s + up; v.z = Math.cos(el) * Math.sin(a) * s;
    const hit = waterContactTime(c, v, WATER_LEVEL), end = Math.min(2.5, hit);
    db[o] = t; db[o + 1] = end; db[o + 2] = c.x; db[o + 3] = c.y; db[o + 4] = c.z; db[o + 5] = v.x; db[o + 6] = v.y; db[o + 7] = v.z;
    for (let k = 0; k < 3; k++) { db[o + 8 + k] = (3 + 6 * rng()) * (rng() < .5 ? -1 : 1); db[o + 11 + k] = 2 * Math.PI * rng(); }
    db[o + 14] = scale; db[o + 15] = hit <= 2.5 ? 1 : 0; dbLive[i] = 1;
  };
  const impact = (kind: EventKind, c: Vec3, nrm: Vec3) => {
    if (kind === 'water') {
      at.x = c.x; at.y = c.y + .3; at.z = c.z;
      spawnPuff(addP, t, at, 0, .3, .2, .26, 2.4, FX.water, FX.water, .9); ring(c.x, c.z, t);
      return;
    }
    burstSparks(c, nrm, reduced ? 4 : 6 + Math.floor(rng() * 5));
    if (kind === 'hit' || kind === 'weak' || kind === 'kill')
      spawnPuff(addP, t, c, 0, .12, .35, .6, 1, kind === 'weak' ? FX.amber : FX.core, FX.spark, .8);
  };
  const onEvent = (e: ShotEvent) => {
    if (e.kind === 'break') { addDebris(e.point, 2, 4, 2, 1); burstSparks(e.point, UP, reduced ? 4 : 8); return; }
    if (e.kind === 'burst') {
      for (let k = 0; k < 9; k++) addDebris(e.point, 5, 11, 4, k < 3 ? 1.6 : .6 + .3 * rng());
      spawnPuff(addP, t, e.point, 0, .25, .8, 2.2, 1, FX.fire, FX.ember, 1);
      for (let k = 0; k < 4; k++) {
        at.x = e.point.x + (rng() - .5); at.y = e.point.y + (rng() - .5) * .5; at.z = e.point.z + (rng() - .5);
        spawnPuff(alphaP, t, at, 1.5, 1.2, .9, 2.2, 1, FX.smoke, FX.smoke, .5);
      }
      return;
    }
    if (!isShotKind(e.kind) || e.kind === 'miss') return;
    const i = claim(pendRing), o = i * PD, f = e.from, c = e.point;
    pend[o] = reduced ? e.t : e.t + impactDelay(Math.hypot(c.x - f.x, c.y - f.y, c.z - f.z));
    pend[o + 1] = c.x; pend[o + 2] = c.y; pend[o + 3] = c.z; pend[o + 4] = e.normal.x; pend[o + 5] = e.normal.y; pend[o + 6] = e.normal.z;
    pendKind[i] = e.kind; pendLive[i] = 1;
  };
  const drawDebris = () => {
    let top = 0;
    for (let i = 0; i < DEBRIS; i++) {
      if (!dbLive[i]) continue;
      const o = i * DB, age = t - db[o];
      p.x = db[o + 2]; p.y = db[o + 3]; p.z = db[o + 4]; v.x = db[o + 5]; v.y = db[o + 6]; v.z = db[o + 7];
      if (age >= db[o + 1]) {
        if (db[o + 15]) { debrisAt(p, v, db[o + 1], at); ring(at.x, at.z, db[o] + db[o + 1]); }
        place(debris, i, 0, 0, 0, 0, 0, 0); dbLive[i] = 0; continue;
      }
      debrisAt(p, v, age, at);
      q.setFromEuler(eu.set(db[o + 11] + db[o + 8] * age, db[o + 12] + db[o + 9] * age, db[o + 13] + db[o + 10] * age));
      debris.setMatrixAt(i, m4.compose(vp.set(at.x, at.y, at.z), q, vs.setScalar(db[o + 14]))); top = i + 1;
    }
    return top;
  };
  const drawRings = () => {
    let top = 0;
    for (let i = 0; i < RINGS; i++) {
      const u = puffU(ringP, i, t);
      if (u < 0) { if (ringP.shown[i]) { place(rings, i, 0, 0, 0, 0, 0, 0); ringP.shown[i] = 0; } continue; }
      const a = puffFrame(ringP, i, u, pos, col, size);
      place(rings, i, pos.x, pos.y, pos.z, size.x, 1, size.x); tint(rings, i, col, a); ringP.shown[i] = 1; top = i + 1;
    }
    return top;
  };
  const trail = () => {
    const f = runtime.shooter.drones;
    for (let i = 0; i < MAX_DRONES; i++) {
      if (!f.broken[i] || !droneAlive(f, i)) { smokeAt[i] = sparkAt[i] = 0; continue; }
      const c = f.pos[i], k = f.knock[i];
      p.x = c.x + k.x; p.y = c.y + k.y; p.z = c.z + k.z;
      if (t >= smokeAt[i]) { spawnPuff(alphaP, t, p, 1.5, .9, .35, .9, 1, FX.smoke, FX.smoke, .5); smokeAt[i] = t + .15; }
      if (t >= sparkAt[i]) { burstSparks(p, UP, 1); sparkAt[i] = t + .4; }
    }
  };
  const frame = () => {
    const s = runtime.shooter;
    t = s.clock; reduced = useGame.getState().reduced;
    readEvents(s, cursor, onEvent);
    for (let i = 0; i < EVENT_RING; i++) {
      const o = i * PD;
      if (!pendLive[i] || t < pend[o]) continue;
      pendLive[i] = 0; p.x = pend[o + 1]; p.y = pend[o + 2]; p.z = pend[o + 3]; n.x = pend[o + 4]; n.y = pend[o + 5]; n.z = pend[o + 6];
      impact(pendKind[i], p, n);
    }
    trail();
    const top = drawSparks(sp, t, sPos, sCol, FX.white, FX.spark), g = sparks.geometry;
    g.setDrawRange(0, top); sparks.visible = top > 0;
    if (top) { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    fxKit().spark.size = reduced ? .08 : .08 * (.8 + .4 * rng());
    commit(add, drawPuffs(add, addP, t)); commit(alpha, drawPuffs(alpha, alphaP, t));
    commit(rings, drawRings()); commit(debris, drawDebris());
  };
  return { meshes: [sparks, add, alpha, rings, debris], tick: guarded('ImpactFx', frame) };
}

export default function ImpactFx() {
  const fx = useMemo(createImpactFx, []);
  useEffect(() => {
    const release = retainFx();
    return () => { fx.meshes.forEach(disposePool); release(); };
  }, [fx]);
  useFrame(fx.tick, -5);
  return <>{fx.meshes.map((m, i) => <primitive key={i} object={m} />)}</>;
}
