// The limits with the flight that has weight (2026-11-11). The other limit tests fly the older velocity-target flight (the harness's
// default). This flies momentumFlight through the same limiter and collision slide: a stop that takes its distance and a turn
// that runs wide must still never put the angel inside rock, never leave it at a standstill, and still end at rest on release.
import { beforeAll, describe, expect, it } from 'vitest';
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
    const bad: string[] = [];
    for (const c of CASES) {
      const s = c.sim(); s.momentum = true;
      let inside = 0, stall = 0, run = 0, again = 0;
      const each = (q: Sim) => { if (!q.safe.isClear(q.body.translation())) inside++; };
      s.run(keysFwd(34), 6, q => { each(q); if (q.t > .5 && q.speed < .6) { run++; stall = Math.max(stall, run * DT); } else run = 0; });
      s.run(idle, 4, each); const rest = s.speed;
      s.run(keysFwd(34), 5, q => { each(q); again = Math.max(again, q.speed); });
      if (inside) bad.push(`${c.id}: inside rock for ${inside} steps`);
      if (stall > .5) bad.push(`${c.id}: at a standstill for ${stall.toFixed(2)} s while held`);
      if (rest > .05) bad.push(`${c.id}: still moving at ${rest.toFixed(2)} m/s four seconds after release`);
      if (again < 18) bad.push(`${c.id}: reached only ${again.toFixed(1)} m/s when held again`);
      s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('the view the limits tip up to clear a rock face is handed back: level within three seconds and back at speed, not left climbing at a crawl', () => {
    // 2026-11-11: the face nudge left the view up to 1.25 rad up for good. The older flight shot to the sky limit on it; a flight
    // with weight climbed at 8 m/s for as long as the pilot held on (reported at first, wrongly, as a slide along the rock).
    const bad: string[] = [], tipped = { weight: 0, older: 0 };
    for (const c of CLIFFS) for (const momentum of [true, false]) {
      const s = cliffSim(c, 33), kind = momentum ? 'weight' : 'older', id = `${kind} ${c.id}`; s.momentum = momentum;
      let tipAt = -1, levelAt = -1, tips = 0, up = false, top = -Infinity, after = 0;
      s.run(keysFwd(34), 10, q => {
        top = Math.max(top, q.p.y);
        if (!up && q.pitch > .5) { up = true; tips++; if (tipAt < 0) tipAt = q.t; } else if (up && q.pitch < .1) up = false;
        if (tipAt >= 0 && levelAt < 0 && Math.abs(q.pitch) < .05) levelAt = q.t;
        if (levelAt >= 0) after = Math.max(after, q.speed);
      });
      if (tipAt < 0) { s.free(); continue; } // this face is cleared by turning aside: nothing to hand back
      tipped[kind]++;
      if (levelAt < 0) bad.push(`${id}: tipped up and never levelled`);
      else if (levelAt - tipAt > 3) bad.push(`${id}: ${(levelAt - tipAt).toFixed(1)} s from tipped to level`);
      if (Math.abs(s.pitch) > .35) bad.push(`${id}: still pitched ${s.pitch.toFixed(2)} rad after ten seconds`);
      if (tips > 3) bad.push(`${id}: tipped ${tips} times in ten seconds`);
      if (top > WORLD.ceiling - 20) bad.push(`${id}: carried up to ${top.toFixed(0)} m, the sky limit`);
      if (momentum && after < 24) bad.push(`${id}: only ${after.toFixed(1)} m/s after it levelled`);
      s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(tipped.weight).toBeGreaterThanOrEqual(3); expect(tipped.older).toBeGreaterThanOrEqual(3); // not vacuous
  });
  it('let go a moment after the view tips, hover, push again: the view waits, then is handed back all the same', () => {
    const bad: string[] = []; let flown = 0;
    for (const c of CLIFFS) {
      const s = cliffSim(c, 33); s.momentum = true;
      let tip = false; s.run(keysFwd(34), 8, q => { if (q.pitch > .5) tip = true; return tip; });
      if (!tip) { s.free(); continue; }
      flown++; s.run(keysFwd(34), .3);
      const held = s.pitch; let moved = 0; s.run(idle, 2, q => { moved = Math.max(moved, Math.abs(q.pitch - held)); });
      let levelAt = -1, after = 0; const from = s.t;
      s.run(keysFwd(34), 7, q => { if (levelAt < 0 && Math.abs(q.pitch) < .05) levelAt = q.t - from; if (levelAt >= 0) after = Math.max(after, q.speed); });
      if (held < .5) bad.push(`${c.id}: the view was only ${held.toFixed(2)} rad up when released`);
      if (moved > 0) bad.push(`${c.id}: the view moved ${moved.toFixed(3)} rad while hovering`);
      if (levelAt < 0 || levelAt > 3) bad.push(`${c.id}: ${levelAt < 0 ? 'never level' : `${levelAt.toFixed(1)} s to level`} after pushing again`);
      if (after < 24) bad.push(`${c.id}: only ${after.toFixed(1)} m/s after it levelled`);
      s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]); expect(flown).toBeGreaterThanOrEqual(3);
  });
});
