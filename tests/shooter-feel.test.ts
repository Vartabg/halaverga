// The 2026-10-07 shooting experience pass (docs/plans/2026-10-07-shooter-feel.md): arrivals matched to the surface, damage stages,
// the kill burst and its safety gates, smoke on the ash wind, and the voices that go with them. Node maths on the real modules.
import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { FRAME_GROUPS, SURFACE, mulberry32, type Vec3 } from '../src/game/combat';
import { DRONE } from '../src/game/droneDodge';
import { createShooterWorld, type WorldHit } from '../src/game/shotResolve';
import { makePuffs, makeSparks, puffFrame, puffU, spawnPuff, type Puffs } from '../src/world/fxPools';
import { LINGER, SHOCK, WIND, spawnKillBurst, spawnPreBurst } from '../src/world/fxBurst';
import { SCORCH, damageStage, spawnImpact, trailDrone } from '../src/world/fxImpacts';
import { FX } from '../src/world/fxMaterials';
import { ASH } from '../src/world/atmospherePalette';
import { VOICES, live } from '../src/ui/blasterVoices';

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z }), UP = v(0, 1, 0);
const pools = () => ({ add: makePuffs(32), alpha: makePuffs(64), rings: makePuffs(12), sparks: makeSparks(200) });
const spawned = (p: Puffs) => { let n = 0; for (let i = 0; i < p.size; i++) if (p.d[i * 23] > -1e8) n++; return n; };
const sparks = (s: ReturnType<typeof makeSparks>) => { let n = 0; for (let i = 0; i < s.size; i++) if (s.d[i * 8] > -1e8) n++; return n; };

describe('the arrival matches the surface', () => {
  const run = (kind: 'world' | 'water' | 'hit' | 'weak' | 'blocked', surface: number, reduced = false) => {
    const p = pools(), marks: number[] = [];
    spawnImpact(p, (_c, _n, size) => { marks.push(size); }, kind, surface, v(0, 10, 0), UP, 1, mulberry32(4), reduced, 1, .1);
    return { p, marks };
  };
  it('ruin concrete: a teal splash, a dust puff and a clear scorch mark', () => {
    const { p, marks } = run('world', SURFACE.concrete);
    expect(marks).toEqual([SCORCH.concrete]); expect(spawned(p.alpha)).toBe(1); expect(spawned(p.add)).toBe(1);
  });
  it('bare steel: a white-hot ping, more sparks, no dust, a small scorch', () => {
    const steel = run('world', SURFACE.steel), concrete = run('world', SURFACE.concrete);
    expect(steel.marks).toEqual([SCORCH.steel]); expect(spawned(steel.p.alpha)).toBe(0);
    expect(sparks(steel.p.sparks)).toBeGreaterThan(sparks(concrete.p.sparks));
    expect(steel.p.add.d[9]).toBeCloseTo(FX.steelHot.r, 6);
  });
  it('water: a splash, a ring and droplets, never a scorch', () => {
    const { p, marks } = run('water', SURFACE.concrete);
    expect(marks).toEqual([]); expect(spawned(p.rings)).toBe(1); expect(spawned(p.add)).toBe(4);
  });
  it('a drone shell smokes, the eye flashes amber; neither leaves a scorch', () => {
    const shell = run('hit', 0), eye = run('weak', 0);
    expect(shell.marks).toEqual([]); expect(eye.marks).toEqual([]);
    expect(spawned(shell.p.alpha)).toBe(1); expect(spawned(eye.p.alpha)).toBe(0); expect(eye.p.add.d[9]).toBeCloseTo(FX.amber.r, 6);
  });
  it('reduced motion keeps the arrival but throws fewer sparks', () => {
    expect(sparks(run('world', SURFACE.steel, true).p.sparks)).toBeLessThan(sparks(run('world', SURFACE.steel).p.sparks));
  });
});

describe('shot resolution tells bare steel from concrete', () => {
  beforeAll(async () => { await RAPIER.init(); });
  it('reads the collider groups: FRAME_GROUPS is steel, the default is concrete', () => {
    const world = new RAPIER.World(v());
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(0, 0, -10));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(0, 0, 10).setCollisionGroups(FRAME_GROUPS));
    world.step();
    const sw = createShooterWorld(world, RAPIER), hit: WorldHit = { t: 0, normal: v(), surface: -1 };
    expect(sw.castShot(v(), v(0, 0, -1), 50, hit)).toBe(true); expect(hit.surface).toBe(SURFACE.concrete);
    expect(sw.castShot(v(), v(0, 0, 1), 50, hit)).toBe(true); expect(hit.surface).toBe(SURFACE.steel);
    world.free();
  });
});

describe('damage reads in stages', () => {
  it('whole above 4 HP, broken at 4 and 3 (or once the plate is off), failing at 2 and 1', () => {
    expect([6, 5, 4, 3, 2, 1].map(hp => damageStage(hp, hp <= DRONE.breakAt ? 1 : 0))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(damageStage(5, 1)).toBe(1);
  });
  it('a failing drone trails more, darker smoke than a broken one, plus an ember glow', () => {
    const broken = pools(), failing = pools(), clock = () => ({ smoke: new Float64Array(8), spark: new Float64Array(8), glow: new Float64Array(8) });
    const cb = clock(), cf = clock(), rng = mulberry32(2);
    for (let t = 0; t < 1; t += 1 / 60) { trailDrone(broken, cb, 0, 1, v(), t, 1, rng, false); trailDrone(failing, cf, 0, 2, v(), t, 1, rng, false); }
    expect(spawned(failing.alpha)).toBeGreaterThan(2 * spawned(broken.alpha)); expect(spawned(failing.add)).toBeGreaterThan(0); expect(spawned(broken.add)).toBe(0);
  });
});

describe('the kill', () => {
  const burst = (reduced: boolean, pop: boolean) => { const p = pools(); let pieces = 0; spawnKillBurst(p, () => { pieces++; }, 5, v(0, 20, 0), 1.5, mulberry32(3), reduced, pop); return { p, pieces }; };
  it('throws nine hot pieces, a fireball with lobes, sparks, a plume and lingering smoke', () => {
    const { p, pieces } = burst(false, true);
    expect(pieces).toBe(9); expect(spawned(p.add)).toBeGreaterThanOrEqual(8); expect(sparks(p.sparks)).toBeGreaterThanOrEqual(40);
    expect(spawned(p.alpha)).toBe(1 + 4 + LINGER.count); expect(spawned(p.rings)).toBe(1);
  });
  it('the shockwave and the white pop are bright: both wait on the flash gate, and reduced motion drops the ring and lobes', () => {
    expect(spawned(burst(false, false).p.rings)).toBe(0); expect(spawned(burst(true, false).p.rings)).toBe(0);
    expect(spawned(burst(true, false).p.add)).toBeLessThan(spawned(burst(false, false).p.add));
    expect(SHOCK.life).toBeLessThan(.5);
  });
  it('the pre-burst is one short swell (80 ms, the hit-stop)', () => {
    const p = pools(); spawnPreBurst(p, 5, v(), 1); expect(spawned(p.add)).toBe(1); expect(p.add.d[1]).toBeCloseTo(.08, 9);
  });
  it('the smoke that stays is darker than the ash overcast and drifts on the ash wind for 2.6 s', () => {
    const lum = (c: { r: number; g: number; b: number }) => .2126 * c.r + .7152 * c.g + .0722 * c.b;
    const ash = { r: 0, g: 0, b: 0 }; const n = parseInt(ASH.color.slice(1), 16); ash.r = (n >> 16) / 255; ash.g = (n >> 8 & 255) / 255; ash.b = (n & 255) / 255;
    expect(lum(FX.ash)).toBeLessThan(lum({ r: ash.r ** 2.2, g: ash.g ** 2.2, b: ash.b ** 2.2 }) / 3);
    expect(WIND.x).toBe(ASH.wind[0]); expect(WIND.z).toBe(ASH.wind[1]); expect(LINGER.life).toBeGreaterThanOrEqual(2.5);
  });
});

describe('puffs on the wind', () => {
  it('a steady wind carries a puff linearly through its whole life; none leaves it in place', () => {
    const p = makePuffs(2), pos = v(), col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 }, c = { r: 1, g: 1, b: 1 };
    spawnPuff(p, 0, v(), 0, 2, 1, 1, 1, c, c, 1, 0, null, v(.6, 0, .25)); spawnPuff(p, 0, v(), 0, 2, 1, 1, 1, c, c, 1);
    puffFrame(p, 0, puffU(p, 0, 1.5), pos, col, size); expect(pos.x).toBeCloseTo(.9, 9); expect(pos.z).toBeCloseTo(.375, 9);
    puffFrame(p, 1, puffU(p, 1, 1.5), pos, col, size); expect(pos.x).toBe(0); expect(pos.z).toBe(0);
  });
});

describe('voices', () => {
  class Param { ramps: { value: number; time: number }[] = []; setValueAtTime(value: number, time: number) { this.ramps.push({ value, time }); return this; } exponentialRampToValueAtTime(value: number, time: number) { this.ramps.push({ value, time }); return this; } }
  class N { type = ''; buffer: unknown = null; frequency = new Param(); Q = new Param(); gain = new Param(); onended: unknown = null; constructor(public kind: string) {} connect(n: N) { return n; } disconnect() {} start() {} stop() {} }
  const play = (kind: keyof typeof VOICES, chain = 0) => {
    const nodes: N[] = [], add = (k: string) => { const n = new N(k); nodes.push(n); return n; };
    const ctx = { currentTime: 0, createGain: () => add('gain'), createOscillator: () => add('osc'), createBufferSource: () => add('source'), createBiquadFilter: () => add('filter') };
    VOICES[kind](ctx as never, new N('dest') as never, { duration: 1 } as AudioBuffer, mulberry32(1), { chain }); live.length = 0;
    return nodes;
  };
  it('surface arrivals have their own voices, all of them at or above 150 Hz for phone speakers', () => {
    for (const kind of ['world', 'steel', 'water'] as const) {
      const nodes = play(kind); expect(nodes.length).toBeGreaterThan(0);
      for (const o of nodes.filter(n => n.kind === 'osc' || n.kind === 'filter')) for (const r of o.frequency.ramps) expect(r.value).toBeGreaterThanOrEqual(150);
    }
  });
  it('the burst has weight: a sub under 80 Hz, carried on a phone by a mid body and noise layers well above 150 Hz', () => {
    const nodes = play('burst'), oscs = nodes.filter(n => n.kind === 'osc'), filters = nodes.filter(n => n.kind === 'filter');
    expect(Math.min(...oscs.map(o => o.frequency.ramps[0].value))).toBeLessThan(80);
    expect(oscs.some(o => o.type === 'triangle' && o.frequency.ramps[0].value >= 150)).toBe(true);
    expect(filters.filter(f => f.frequency.ramps[0].value >= 900).length).toBeGreaterThanOrEqual(3);
  });
  it('the burst rises a semitone per chain kill, like the kill tick', () => {
    const base = play('burst', 1).filter(n => n.kind === 'osc')[0].frequency.ramps[0].value;
    const third = play('burst', 3).filter(n => n.kind === 'osc')[0].frequency.ramps[0].value;
    expect(third / base).toBeCloseTo(2 ** (2 / 12), 9);
  });
  it('a failing drone crackles', () => { expect(play('fail').filter(n => n.kind === 'source')).toHaveLength(3); });
});
