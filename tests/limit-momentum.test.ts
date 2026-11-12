// The limits with the flight that has weight (2026-11-11). The other limit tests fly the older velocity-target flight (the harness's
// default). This flies momentumFlight through the same limiter and collision slide: a stop that takes its distance and a turn
// that runs wide must still never put the angel inside rock, never leave it at a standstill, and still end at rest on release.
import { beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { init, DT, WORLD, type Model, type Sim } from './lim/harness';
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
  it('held at surge into every wall, the floor, the sky and the rock, let go, then held again: never inside rock, never at a standstill, at rest when released, and flying again', () => {
    const bad: string[] = [], rows: string[] = [];
    for (const c of CASES) {
      const s = c.sim(); s.momentum = true;
      let inside = 0, stall = 0, run = 0, again = 0;
      const each = (q: Sim) => { if (!q.safe.isClear(q.body.translation())) inside++; };
      s.run(keysFwd(34), 6, q => { each(q); if (q.t > .5 && q.speed < .6) { run++; stall = Math.max(stall, run * DT); } else run = 0; });
      s.run(idle, 4, each); const rest = s.speed;
      s.run(keysFwd(34), 5, q => { each(q); again = Math.max(again, q.speed); });
      rows.push(`${c.id}: again ${again.toFixed(1)} m/s, pitch ${s.pitch.toFixed(2)}`);
      if (inside) bad.push(`${c.id}: inside rock for ${inside} steps`);
      if (stall > .5) bad.push(`${c.id}: at a standstill for ${stall.toFixed(2)} s while held`);
      if (rest > .05) bad.push(`${c.id}: still moving at ${rest.toFixed(2)} m/s four seconds after release`);
      if (again < 18) bad.push(`${c.id}: reached only ${again.toFixed(1)} m/s when held again`);
      s.free();
    }
    if (process.env.LIMIT_OUT) writeFileSync(process.env.LIMIT_OUT, rows.join('\n'));
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('the view the limits tip up to clear a rock face is handed back: level again and back at speed, not left climbing at a crawl', () => {
    // 2026-11-11: the face nudge left the view up to 1.25 rad up for good. The older flight shot to the sky limit on it; a flight
    // with weight climbed at 8 m/s for as long as the pilot held on (reported, wrongly, as a slide along the rock).
    const bad: string[] = [];
    for (const c of CLIFFS) for (const momentum of [true, false]) {
      const s = cliffSim(c, 33); s.momentum = momentum;
      let tipped = 0, top = -Infinity, levelAt = -1;
      s.run(keysFwd(34), 10, q => { tipped = Math.max(tipped, q.pitch); top = Math.max(top, q.p.y); if (tipped > .5 && levelAt < 0 && Math.abs(q.pitch) < .05) levelAt = q.t; });
      const id = `${momentum ? 'weight' : 'older'} ${c.id}`;
      if (tipped <= .5) { s.free(); continue; } // this face is cleared by turning aside: nothing to hand back
      if (levelAt < 0) bad.push(`${id}: tipped up ${tipped.toFixed(2)} rad and never levelled`);
      if (top > WORLD.ceiling - 20) bad.push(`${id}: carried up to ${top.toFixed(0)} m, the sky limit`);
      if (momentum && s.speed < 24) bad.push(`${id}: only ${s.speed.toFixed(1)} m/s after ten seconds`);
      s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
