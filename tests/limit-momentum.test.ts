// The limits with the flight that has weight (2026-11-11). The other limit tests fly the older velocity-target flight (the harness's
// default). This flies momentumFlight through the same limiter and collision slide: a stop that takes its distance and a turn
// that runs wide must still never put the angel inside rock, never leave it at a standstill, and still end at rest on release.
// Known and older than this test (the momentum flight of 2026-10-20 behaves the same): pressed into the west hill at an angle, or
// into the slot between a hill and the perimeter, the angel is not turned to open air as the older flight was. It slides along the
// rock at 8 to 12 m/s (a steep climb is slow in this flight). So the speed floor here is "moving", not "back to cruise".
import { beforeAll, describe, expect, it } from 'vitest';
import { init, DT, type Model, type Sim } from './lim/harness';
import { CLIFFS, WALLS, cliffSim, keysFwd, wallEntry } from './lim/drive';
beforeAll(init);
const idle: Model = { kind: 'idle' };
type Case = { id: string; sim: () => Sim };
const CASES: Case[] = [
  ...WALLS.flatMap(w => [0, .6].map(ang => ({ id: `wall ${w.id} ${ang ? 'at an angle' : 'head-on'}`, sim: () => wallEntry(w, ang, 33, 90) }))),
  { id: 'the floor, diving', sim: () => { const s = wallEntry(WALLS[2], 0, 33, 200); s.pitch = -1.1; return s; } },
  { id: 'the sky, climbing', sim: () => { const s = wallEntry(WALLS[2], 0, 33, 200); s.pitch = 1.1; return s; } },
  ...CLIFFS.map(c => ({ id: `rock: ${c.id}`, sim: () => cliffSim(c, 33) })),
];
describe('the limits hold with flight that has weight', () => {
  it('held at surge into every wall, the floor, the sky and the rock, let go, then held again: never inside rock, never at a standstill, at rest when released', () => {
    const bad: string[] = [];
    for (const c of CASES) {
      const s = c.sim(); s.momentum = true;
      let inside = 0, stall = 0, run = 0, late = 0, again = 0;
      const each = (q: Sim) => { if (!q.safe.isClear(q.body.translation())) inside++; };
      s.run(keysFwd(34), 6, (q, i) => { each(q); if (q.t > .5 && q.speed < .6) { run++; stall = Math.max(stall, run * DT); } else run = 0; if (i * DT > 4) late = Math.max(late, q.speed); });
      s.run(idle, 4, each); const rest = s.speed;
      s.run(keysFwd(34), 4, q => { each(q); again = Math.max(again, q.speed); });
      if (inside) bad.push(`${c.id}: inside rock for ${inside} steps`);
      if (stall > .5) bad.push(`${c.id}: at a standstill for ${stall.toFixed(2)} s while held`);
      if (rest > .05) bad.push(`${c.id}: still moving at ${rest.toFixed(2)} m/s four seconds after release`);
      if (Math.min(late, again) < 6) bad.push(`${c.id}: barely moving (${late.toFixed(1)} m/s held, ${again.toFixed(1)} m/s held again)`);
      s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
