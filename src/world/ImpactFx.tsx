// Sparks, splashes, dust, scorch marks, debris, fireball, shockwave and smoke: 6 draw calls (sparks, additive sprites, alpha sprites,
// rings, debris, scorch). The recipes live in fxImpacts.ts (arrivals by surface, damage trails) and fxBurst.ts (the kill).
import { useEffect, useMemo } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { EVENT_RING, MAX_DRONES, WATER_LEVEL, droneAlive, flashGate, mulberry32, readEvents, type EventKind, type ShotEvent, type Vec3 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { burstGain, claim, debrisAt, drawSparks, impactDelay, isShotKind, lobeDir, makePuffs, makeSparks, puffFrame, puffU, shardGain, shardK,
  shardScale, shardTint, spawnSpark, waterContactTime, type Ring } from './fxPools';
import { FX, commit, debrisPool, disposePool, drawPuffs, fxKit, place, placeOnSurface, retainFx, ringPool, scorchPool, sparkMinPx, sparkPool, spritePool, tint } from './fxMaterials';
import { SCORCH, burstSparks, damageStage, spawnBreak, spawnFail, spawnImpact, trailDrone, waterRing, type TrailClock } from './fxImpacts';
import { spawnKillBurst, spawnPreBurst } from './fxBurst';
// ALPHA holds the kill plume and lingering smoke beside up to 8 damaged-drone trails without evicting them. RINGS: water rings from
// nine landing pieces plus the shockwave. Debris per slot: born, end, p0 xyz, v0 xyz, spin xyz, rot0 xyz, scale, wet, hot, next trail.
const SPARKS = 200, ADD = 32, ALPHA = 64, RINGS = 12, DEBRIS = 32, SCORCHES = 12, DB = 18, PD = 11, SC = 9, UP = { x: 0, y: 1, z: 0 };
const HEAT_T = .6, EMBER_T = .55, TRAIL_T = .45, TRAIL_GAP = .05;
const TINTS = [FX.metal, FX.panel, FX.rust], m4 = new Matrix4(), q = new Quaternion(), eu = new Euler(), vp = new Vector3(), vs = new Vector3();

function createImpactFx() {
  const sparks = sparkPool(SPARKS), add = spritePool(ADD, true), alpha = spritePool(ALPHA, false), rings = ringPool(RINGS), scorch = scorchPool(SCORCHES);
  const debris = debrisPool(DEBRIS), sp = makeSparks(SPARKS), addP = makePuffs(ADD), alphaP = makePuffs(ALPHA), ringP = makePuffs(RINGS);
  const pools = { add: addP, alpha: alphaP, rings: ringP, sparks: sp };
  const heat = debris.geometry.attributes.aHeat.array as Float32Array, popHist = new Float64Array(3).fill(-Infinity);
  const sPos = sparks.geometry.attributes.position.array as Float32Array, sCol = sparks.geometry.attributes.color.array as Float32Array;
  const scAlpha = scorch.geometry.attributes.aAlpha.array as Float32Array;
  const db = new Float64Array(DEBRIS * DB), dbLive = new Uint8Array(DEBRIS), dbRing: Ring = { next: 0, size: DEBRIS };
  // Pending arrivals: spawnAt, point, normal, surface (the tracer lands first).
  const pend = new Float64Array(EVENT_RING * PD), pendKind: EventKind[] = Array.from({ length: EVENT_RING }, () => 'miss');
  const pendLive = new Uint8Array(EVENT_RING), pendRing: Ring = { next: 0, size: EVENT_RING };
  // Scorch marks: born, x, y, z, nx, ny, nz, size, (spare); oldest-slot reuse.
  const sc = new Float64Array(SCORCHES * SC), scLive = new Uint8Array(SCORCHES), scRing: Ring = { next: 0, size: SCORCHES };
  const trails: TrailClock = { smoke: new Float64Array(MAX_DRONES), spark: new Float64Array(MAX_DRONES), glow: new Float64Array(MAX_DRONES) }, rng = mulberry32(0x1a2b3c);
  const cursor = { last: runtime.shooter.eventSerial }, p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 }, dir = { x: 0, y: 0, z: 0 };
  const v = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 }, pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 }, sh = { x: 1, y: 1, z: 1 };
  const cam = { x: 0, y: 0, z: 0, fov: 65, h: 800 };
  let reduced = false, t = 0, emberGain = 1, emberUntil = 0, popAllowed = false;
  /** Burst size gain at a world point: the fireball keeps a readable on-screen size at range (see burstGain). */
  const gainAt = (c: Vec3) => burstGain(Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z), cam.fov, cam.h);
  const addScorch = (c: Vec3, nrm: Vec3, s: number) => {
    const i = claim(scRing), o = i * SC;
    sc[o] = t; sc[o + 1] = c.x; sc[o + 2] = c.y; sc[o + 3] = c.z; sc[o + 4] = nrm.x; sc[o + 5] = nrm.y; sc[o + 6] = nrm.z; sc[o + 7] = s * (.85 + .3 * rng()); scLive[i] = 1;
  };
  const addDebris = (c: Vec3, speed0: number, speed1: number, up: number, scale: number, hot = 0) => {
    const i = claim(dbRing), o = i * DB, a = 2 * Math.PI * rng(), el = (rng() - .3) * .9, s = speed0 + (speed1 - speed0) * rng();
    v.x = Math.cos(el) * Math.cos(a) * s; v.y = Math.sin(el) * s + up; v.z = Math.cos(el) * Math.sin(a) * s;
    const hit = waterContactTime(c, v, WATER_LEVEL), end = Math.min(2.5, hit);
    db[o] = t; db[o + 1] = end; db[o + 2] = c.x; db[o + 3] = c.y; db[o + 4] = c.z; db[o + 5] = v.x; db[o + 6] = v.y; db[o + 7] = v.z;
    for (let k = 0; k < 3; k++) { db[o + 8 + k] = (3 + 6 * rng()) * (rng() < .5 ? -1 : 1); db[o + 11 + k] = 2 * Math.PI * rng(); }
    db[o + 14] = scale; db[o + 15] = hit <= 2.5 ? 1 : 0; db[o + 16] = hot; db[o + 17] = t; dbLive[i] = 1; tint(debris, i, TINTS[shardTint(i)], 1);
  };
  const onEvent = (e: ShotEvent) => {
    if (e.kind === 'break') { addDebris(e.point, 2, 4, 2, shardK(.75, shardGain(gainAt(e.point)))); burstSparks(sp, t, e.point, UP, reduced ? 4 : 8, rng); spawnBreak(pools, t, e.point, gainAt(e.point)); return; }
    if (e.kind === 'fail') { spawnFail(pools, t, e.point, gainAt(e.point), rng, reduced); return; }
    if (e.kind === 'burst') { spawnKillBurst(pools, addDebris, t, e.point, gainAt(e.point), rng, reduced, popAllowed); emberGain = 1 + (gainAt(e.point) - 1) * .8; emberUntil = t + EMBER_T; return; }
    if (!isShotKind(e.kind) || e.kind === 'miss') return;
    // The kill frame: one gate decision covers the pre-burst swell now and the pop 80 ms later (at most 3 per second, none under reduced motion).
    if (e.kind === 'kill') { popAllowed = !reduced && flashGate(popHist, 0, t); if (popAllowed) spawnPreBurst(pools, t, e.point, gainAt(e.point)); }
    const i = claim(pendRing), o = i * PD, f = e.from, c = e.point;
    pend[o] = reduced ? e.t : e.t + impactDelay(Math.hypot(c.x - f.x, c.y - f.y, c.z - f.z));
    pend[o + 1] = c.x; pend[o + 2] = c.y; pend[o + 3] = c.z; pend[o + 4] = e.normal.x; pend[o + 5] = e.normal.y; pend[o + 6] = e.normal.z; pend[o + 7] = e.surface;
    pendKind[i] = e.kind; pendLive[i] = 1;
  };
  /** Hot pieces shed embers along their arc for TRAIL_T: a spark every TRAIL_GAP at the piece, carrying a quarter of its velocity. */
  const trailPiece = (o: number, age: number) => {
    if (reduced || !db[o + 16] || age > TRAIL_T || t < db[o + 17]) return;
    db[o + 17] = t + TRAIL_GAP;
    lobeDir(UP, rng(), rng(), dir); v.x = v.x * .25 + dir.x * .6; v.y = v.y * .25 + dir.y * .6; v.z = v.z * .25 + dir.z * .6;
    const sv = Math.hypot(v.x, v.y, v.z) || 1; dir.x = v.x / sv; dir.y = v.y / sv; dir.z = v.z / sv;
    spawnSpark(sp, t, at, dir, sv, .18 + .1 * rng());
  };
  const drawDebris = () => {
    let top = 0, k = 0;
    for (let i = 0; i < DEBRIS; i++) {
      if (!dbLive[i]) continue;
      const o = i * DB, age = t - db[o];
      p.x = db[o + 2]; p.y = db[o + 3]; p.z = db[o + 4]; v.x = db[o + 5]; v.y = db[o + 6]; v.z = db[o + 7];
      if (age >= db[o + 1]) {
        if (db[o + 15]) { debrisAt(p, v, db[o + 1], at); waterRing(ringP, at.x, at.z, db[o] + db[o + 1], WATER_LEVEL); }
        place(debris, i, 0, 0, 0, 0, 0, 0); heat[i] = 0; dbLive[i] = 0; continue;
      }
      heat[i] = db[o + 16] ? Math.max(0, 1 - age / HEAT_T) : 0;
      debrisAt(p, v, age, at); v.y -= 22 * age; trailPiece(o, age);
      q.setFromEuler(eu.set(db[o + 11] + db[o + 8] * age, db[o + 12] + db[o + 9] * age, db[o + 13] + db[o + 10] * age));
      shardScale(i, sh); k = db[o + 14];
      debris.setMatrixAt(i, m4.compose(vp.set(at.x, at.y, at.z), q, vs.set(sh.x * k, sh.y * k, sh.z * k))); top = i + 1;
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
  /** Scorch marks hold .8 alpha for a third of their life, then fade; a mark older than SCORCH.life frees its slot. */
  const drawScorch = () => {
    let top = 0;
    for (let i = 0; i < SCORCHES; i++) {
      if (!scLive[i]) continue;
      const o = i * SC, u = (t - sc[o]) / SCORCH.life;
      if (!(u >= 0 && u < 1)) { scLive[i] = 0; scAlpha[i] = 0; place(scorch, i, 0, 0, 0, 0, 0, 0); continue; }
      p.x = sc[o + 1]; p.y = sc[o + 2]; p.z = sc[o + 3]; n.x = sc[o + 4]; n.y = sc[o + 5]; n.z = sc[o + 6];
      placeOnSurface(scorch, i, p, n, sc[o + 7]); scAlpha[i] = .8 * Math.min(1, 1.5 * (1 - u)); top = i + 1;
    }
    return top;
  };
  const trail = () => {
    const f = runtime.shooter.drones;
    for (let i = 0; i < MAX_DRONES; i++) {
      const stage = droneAlive(f, i) ? damageStage(f.hp[i], f.broken[i]) : 0;
      const c = f.pos[i], k = f.knock[i];
      p.x = c.x + k.x; p.y = c.y + k.y; p.z = c.z + k.z;
      trailDrone(pools, trails, i, stage, p, t, stage ? gainAt(p) : 1, rng, reduced);
    }
  };
  const frame = (st: RootState) => {
    const s = runtime.shooter;
    sparkMinPx.value = 2 * st.gl.getPixelRatio();
    const pc = st.camera as PerspectiveCamera;
    cam.x = pc.position.x; cam.y = pc.position.y; cam.z = pc.position.z; cam.fov = pc.fov || 65; cam.h = st.size.height || 800;
    t = s.clock; reduced = useGame.getState().reduced;
    readEvents(s, cursor, onEvent);
    for (let i = 0; i < EVENT_RING; i++) {
      const o = i * PD;
      if (!pendLive[i] || t < pend[o]) continue;
      pendLive[i] = 0; p.x = pend[o + 1]; p.y = pend[o + 2]; p.z = pend[o + 3]; n.x = pend[o + 4]; n.y = pend[o + 5]; n.z = pend[o + 6];
      spawnImpact(pools, addScorch, pendKind[i], pend[o + 7], p, n, t, rng, reduced, pendKind[i] === 'kill' ? gainAt(p) : 1, WATER_LEVEL);
    }
    trail();
    const top = drawSparks(sp, t, sPos, sCol, FX.pop, FX.blaze, FX.ember), g = sparks.geometry;
    g.setDrawRange(0, top); sparks.visible = top > 0;
    if (top) { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    fxKit().spark.size = reduced ? .15 : .15 * (.8 + .4 * rng()) * (t < emberUntil ? 1.5 * emberGain : 1);
    commit(add, drawPuffs(add, addP, t)); commit(alpha, drawPuffs(alpha, alphaP, t));
    commit(rings, drawRings()); commit(debris, drawDebris()); commit(scorch, drawScorch());
  };
  add.renderOrder = sparks.renderOrder = 2;   // after the alpha smoke, so flames and embers are never dimmed by it
  return { meshes: [sparks, add, alpha, rings, debris, scorch], tick: guarded('ImpactFx', frame) };
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
