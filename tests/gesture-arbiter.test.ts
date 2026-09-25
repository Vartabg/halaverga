import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ArbiterEvent, ArbiterEventType, ArbiterOutType, PointerKind } from '../src/game/gesture/types';
import { arbiterCommit, arbiterDispatch, arbiterLive, arbiterNeedsTick, arbiterReset, createArbiter, REJECT_BOTTOM, REJECT_EDGE,
  type Arbiter, type LabId } from '../src/ui/gesture/pointerArbiter';
import { inkTaper, inkWidth, phaseGain, tailAlpha } from '../src/ui/gesture/inkStyle';
import { REST_COMMIT_MS } from '../src/game/gesture/tuning';

// A drone sits in a 30 px box around (500, 300); the viewport is 1000 x 800 with the phone start filter.
const DRONE = { x: 500, y: 300 };
function lab(scheme: LabId, blaster = true) {
  const flags = { blaster };
  const a = createArbiter({ scheme, blaster: () => flags.blaster,
    pick: (x, y) => Math.abs(x - DRONE.x) <= 30 && Math.abs(y - DRONE.y) <= 30 ? 2 : -1,
    zone: { x: 0, y: 0, width: 1000, height: 800, left: 12, right: 12, top: 60, bottom: 28 } });
  return { a, flags, ...driver(a) };
}
function driver(a: Arbiter) {
  let epoch = 0;
  const log: ArbiterOutType[] = [];
  const send = (type: ArbiterEventType, id: number, x: number, y: number, t: number, kind: PointerKind = 'touch', buttons = 1) => {
    const e: ArbiterEvent = { type, id, x, y, t, kind, buttons, epoch };
    const n = arbiterDispatch(a, e), got: ArbiterOutType[] = [];
    for (let i = 0; i < n; i++) got.push(a.out[i].type);
    log.push(...got);
    return got;
  };
  return {
    log, send,
    bump: () => { epoch++; },
    down: (id: number, x: number, y: number, t: number, kind: PointerKind = 'touch') => send('down', id, x, y, t, kind),
    move: (id: number, x: number, y: number, t: number, kind: PointerKind = 'touch', buttons = 1) => send('move', id, x, y, t, kind, buttons),
    up: (id: number, x: number, y: number, t: number, kind: PointerKind = 'touch') => send('up', id, x, y, t, kind, 0),
    tick: (t: number) => send('tick', -1, 0, 0, t),
    escape: (t: number) => send('escape', -1, 0, 0, t, 'mouse', 0),
  };
}
const SHOTS: ArbiterOutType[] = ['burst', 'sustain', 'blastNow', 'miss'];
const noShot = (log: ArbiterOutType[]) => expect(log.filter(t => SHOTS.includes(t))).toEqual([]);
const SCHEMES: LabId[] = ['draw', 'conduct', 'brush'];

describe.each(SCHEMES)('phone table: %s', scheme => {
  it('a down on a drone arms, and a tap on it bursts', () => {
    const d = lab(scheme);
    expect(d.down(1, 505, 300, 0)).toEqual(['armBlast']);
    expect(d.up(1, 507, 302, 120)).toEqual(['burst']);
    expect(d.a.out[0].drone).toBe(2);
  });
  it('a down on a drone that moves 20 px becomes a stroke with no shot', () => {
    const d = lab(scheme);
    d.down(1, 500, 300, 0);
    expect(d.move(1, 520, 300, 60)).toEqual(['disarm', 'begin', 'extend']);
    expect(d.move(1, 560, 310, 90)).toEqual(['extend']);
    expect(d.up(1, 600, 320, 140)).toEqual(['extend', 'commit']);
    noShot(d.log);
    expect(d.a.out[0].x).toBe(600);
  });
  it('a still 180 ms hold on a drone gives sustained fire until up', () => {
    const d = lab(scheme);
    d.down(1, 500, 300, 0);
    expect(d.tick(100)).toEqual([]);
    expect(d.tick(180)).toEqual(['sustain']);
    expect(d.move(1, 540, 300, 400)).toEqual([]);
    expect(d.up(1, 540, 300, 1500)).toEqual(['sustainEnd']);
    expect(d.log).not.toContain('burst');
  });
  it('an empty tap: blaster on fires a miss; blaster off flies there in Draw only', () => {
    const on = lab(scheme);
    on.down(1, 200, 400, 0); on.up(1, 203, 402, 100);
    const shots = (log: ArbiterOutType[]) => log.filter(t => t !== 'begin' && t !== 'extend' && t !== 'commit');
    expect(shots(on.log)).toEqual(['miss']);
    const off = lab(scheme, false);
    off.down(1, 200, 400, 0); off.up(1, 203, 402, 100);
    expect(shots(off.log)).toEqual(scheme === 'draw' ? ['flyTo'] : []);
  });
  it('a drag is a stroke from its down point', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0);
    d.move(1, 240, 400, 40); d.move(1, 280, 380, 80); d.up(1, 300, 360, 120);
    expect(d.log).toEqual(['begin', 'extend', 'extend', 'extend', 'commit']);
    noShot(d.log);
  });
  it('holds: guide at 250 ms and brake at 900 ms (Draw, Brush); resting is steering in Conduct', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0);
    const at250 = d.tick(250), mid = d.tick(575), midProgress = d.a.out[0].progress, at900 = d.tick(900);
    if (scheme === 'conduct') { expect([...at250, ...mid, ...at900]).toEqual([]); expect(d.log).toEqual(['begin']); return; }
    expect(at250).toEqual(['guide', 'brakeRing']);
    expect(mid).toEqual(['brakeRing']);
    expect(midProgress).toBeCloseTo(0.5, 5);
    expect(at900).toEqual(['guide', 'brake']);
    expect(d.a.out[0].progress).toBe(0);
    expect(d.move(1, 300, 400, 950)).toEqual([]);
    expect(d.up(1, 300, 400, 1000)).toEqual([]);
  });
  it('moving after the guide draws from the hold point', () => {
    if (scheme === 'conduct') return;
    const d = lab(scheme);
    d.down(1, 200, 400, 0); d.tick(300);
    expect(d.move(1, 240, 400, 400)).toEqual(['brakeRing', 'guide', 'begin', 'extend']);
    expect(d.a.out[2].x).toBe(200);
  });
  it('a second-pointer tap brakes off-drone and bursts at once on a drone', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0); d.move(1, 260, 400, 50);
    expect(d.down(2, 700, 500, 60)).toEqual([]);
    const braked = d.up(2, 702, 500, 140);
    expect(braked).toEqual(scheme === 'conduct' ? ['brake'] : ['cancel', 'brake']);
    expect(d.down(3, 500, 300, 200)).toEqual(['blastNow']);
    expect(d.a.out[0].drone).toBe(2);
    expect(d.up(3, 500, 300, 260)).toEqual([]);
  });
  it('a second pointer that drags is not a brake', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0); d.down(2, 700, 500, 10); d.move(2, 760, 500, 40);
    expect(d.up(2, 760, 500, 100)).toEqual([]);
  });
  it('a third contact is ignored', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0); d.down(2, 700, 500, 10);
    expect(d.down(3, 500, 300, 20)).toEqual([]);
    expect(d.move(3, 560, 300, 40)).toEqual([]);
    expect(d.up(3, 560, 300, 60)).toEqual([]);
  });
  it('edge, header and bottom-band starts are ignored; a live stroke may cross the band', () => {
    const d = lab(scheme);
    expect(d.down(1, 500, 790, 0)).toEqual(['reject']);
    expect(d.a.out[0].drone).toBe(REJECT_BOTTOM);
    expect(d.down(2, 5, 400, 10)).toEqual(['reject']);
    expect(d.a.out[0].drone).toBe(REJECT_EDGE);
    expect(d.down(3, 500, 20, 20)).toEqual(['reject']);
    expect(d.move(1, 500, 700, 30)).toEqual([]);
    expect(d.up(1, 500, 700, 40)).toEqual([]);
    expect(d.a.rejects).toBe(3);
    d.down(4, 500, 700, 100); d.move(4, 500, 760, 140); d.move(4, 500, 798, 170);
    expect(d.up(4, 500, 798, 200)).toEqual(['extend', 'commit']);
  });
  it('an epoch bump kills the live pointer until it lifts', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0); d.move(1, 260, 400, 40);
    d.bump();
    expect(d.send('epoch', -1, 0, 0, 50)).toEqual(['cancel']);
    expect(d.move(1, 300, 400, 60)).toEqual([]);
    expect(d.up(1, 300, 400, 80)).toEqual([]);
    d.down(5, 500, 300, 100); d.bump();
    expect(d.move(5, 501, 300, 120)).toEqual(['disarm']);
    expect(d.up(5, 501, 300, 140)).toEqual([]);
  });
});

describe.each(['draw', 'brush'] as LabId[])('desktop click-to-ink: %s', scheme => {
  it('a click starts ink, hover draws, and a REST_COMMIT_MS (650 ms) rest after 60 px commits', () => {
    const d = lab(scheme);
    expect(d.down(1, 200, 400, 0, 'mouse')).toEqual([]);
    expect(d.up(1, 201, 400, 90, 'mouse')).toEqual(['begin']);
    expect(arbiterLive(d.a)).toBe(true);
    for (let i = 1; i <= 8; i++) expect(d.move(1, 200 + i * 10, 400, 100 + i * 16, 'mouse', 0)).toEqual(['extend']);
    expect(REST_COMMIT_MS).toBe(650); // a trackpad pause to think mid-curve (about 350 ms) keeps inking
    expect(d.tick(228 + 349)).toEqual([]);
    expect(d.tick(228 + REST_COMMIT_MS - 1)).toEqual([]);
    expect(d.tick(228 + REST_COMMIT_MS)).toEqual(['commit']);
    expect(arbiterLive(d.a)).toBe(false);
    noShot(d.log);
  });
  it('a click on a drone while inking commits instead of firing', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0, 'mouse'); d.up(1, 200, 400, 80, 'mouse');
    d.move(1, 300, 350, 150, 'mouse', 0); d.move(1, 500, 300, 250, 'mouse', 0);
    expect(d.down(1, 500, 300, 300, 'mouse')).toEqual(['commit']);
    expect(d.tick(700)).toEqual([]);
    expect(d.up(1, 500, 300, 900, 'mouse')).toEqual([]);
    noShot(d.log); expect(d.log).not.toContain('armBlast');
  });
  it('Escape cancels the ink, and with no ink brakes', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0, 'mouse'); d.up(1, 200, 400, 80, 'mouse'); d.move(1, 260, 400, 120, 'mouse', 0);
    expect(d.escape(150)).toEqual(['cancel']);
    expect(d.move(1, 300, 400, 170, 'mouse', 0)).toEqual([]);
    expect(d.escape(200)).toEqual(['brake']);
  });
  it('press-drag-release is a stroke committed on up; a drone click bursts, a held one sustains', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0, 'mouse'); d.move(1, 260, 400, 50, 'mouse');
    expect(d.up(1, 300, 400, 100, 'mouse')).toEqual(['extend', 'commit']);
    expect(d.down(1, 500, 300, 200, 'mouse')).toEqual(['armBlast']);
    expect(d.up(1, 502, 300, 300, 'mouse')).toEqual(['burst']);
    d.down(1, 500, 300, 400, 'mouse');
    expect(d.tick(580)).toEqual(['sustain']);
    expect(d.up(1, 500, 300, 900, 'mouse')).toEqual(['sustainEnd']);
  });
  it('a mid-stroke swipe probe commits at once', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0, 'mouse'); d.up(1, 200, 400, 80, 'mouse'); d.move(1, 300, 400, 120, 'mouse', 0);
    arbiterCommit(d.a, 130);
    expect(d.a.out[0].type).toBe('commit');
    expect(arbiterNeedsTick(d.a)).toBe(false);
  });
  it('a rest with little ink shows the guide in Brush only; no touch hold timers on a mouse', () => {
    const d = lab(scheme);
    d.down(1, 200, 400, 0, 'mouse'); d.up(1, 200, 400, 80, 'mouse'); d.move(1, 220, 400, 100, 'mouse', 0);
    expect(d.tick(400)).toEqual(scheme === 'brush' ? ['guide'] : []);
    expect(d.a.out[0]?.progress).toBe(scheme === 'brush' ? 1 : 0);
    const p = lab(scheme);
    p.down(1, 200, 400, 0, 'mouse');
    expect(p.tick(1000)).toEqual([]);
  });
});

describe('desktop Conduct', () => {
  it('an empty click toggles cruise and fires nothing; a drone click bursts and does not toggle', () => {
    const d = lab('conduct');
    d.down(1, 200, 400, 0, 'mouse');
    expect(d.up(1, 201, 400, 90, 'mouse')).toEqual(['clickToggle']);
    d.down(1, 500, 300, 200, 'mouse');
    expect(d.up(1, 500, 300, 280, 'mouse')).toEqual(['burst']);
    expect(d.log.filter(t => t === 'clickToggle')).toHaveLength(1);
  });
  it('press-drag looks; hover makes no output (the adapter routes it to scheme.hover); Escape stops cruise', () => {
    const d = lab('conduct');
    d.down(1, 200, 400, 0, 'mouse');
    expect(d.move(1, 230, 400, 30, 'mouse')).toEqual(['look', 'look']);
    expect([d.a.out[0].progress, d.a.out[0].x, d.a.out[1].x]).toEqual([0, 200, 230]);
    expect(d.up(1, 240, 400, 60, 'mouse')).toEqual(['look']);
    expect(d.move(1, 300, 400, 100, 'mouse', 0)).toEqual([]);
    expect(d.escape(120)).toEqual(['brake']);
  });
});

describe('arbiter safety', () => {
  it('reset drops everything with no command; outputs never include a pause', () => {
    const d = lab('draw');
    d.down(1, 200, 400, 0); d.move(1, 260, 400, 40); d.down(2, 500, 300, 50);
    expect(arbiterReset(d.a, 60)).toBe(1);
    expect(d.a.out[0].type).toBe('cancel');
    expect(d.move(1, 300, 400, 70)).toEqual([]);
    // Seeded fuzz over every scheme and pointer kind: only known outputs, and the out slots are reused (no allocation).
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const known = new Set<string>(['begin', 'extend', 'commit', 'cancel', 'armBlast', 'disarm', 'burst', 'sustain', 'sustainEnd',
      'blastNow', 'miss', 'flyTo', 'guide', 'brakeRing', 'brake', 'clickToggle', 'look', 'reject']);
    const types: ArbiterEventType[] = ['down', 'move', 'up', 'cancel', 'tick', 'escape', 'epoch'];
    for (const scheme of SCHEMES) {
      const f = lab(scheme), slots = f.a.out, first = slots[0];
      for (let t = 0; t < 3000; t += 16) {
        const type = types[Math.floor(rnd() * types.length)];
        if (type === 'epoch' && rnd() < 0.2) f.bump();
        f.send(type, 1 + Math.floor(rnd() * 3), rnd() * 1000, rnd() * 800, t, rnd() < 0.5 ? 'mouse' : 'touch', rnd() < 0.5 ? 0 : 1);
      }
      for (const t of f.log) expect(known.has(t)).toBe(true);
      expect(f.a.out).toBe(slots); expect(f.a.out[0]).toBe(first);
    }
    const src = ['pointerArbiter.ts', 'GestureSurface.tsx'].map(n => readFileSync(fileURLToPath(new URL(`../src/ui/gesture/${n}`, import.meta.url)), 'utf8'));
    for (const s of src) expect(s).not.toMatch(/\bpause\s*\(|setState\(\s*\{\s*paused/);
  });
});

describe('inkStyle', () => {
  it('width is monotonic in speed (10 px slow to 4 px fast)', () => {
    let prev = Infinity;
    for (let v = 0; v <= 4; v += 0.01) { const w = inkWidth(v); expect(w).toBeLessThanOrEqual(prev); prev = w; }
    expect(inkWidth(0)).toBe(10); expect(inkWidth(4)).toBe(4);
  });
  it('taper, tail and phase gains stay in range', () => {
    expect(inkTaper(0)).toBeCloseTo(0.3); expect(inkTaper(1)).toBe(1);
    expect(tailAlpha(0, 150)).toBe(1); expect(tailAlpha(150, 150)).toBe(0); expect(tailAlpha(1e6, Infinity)).toBe(1);
    expect(phaseGain('set', 50, false)).toBeCloseTo(1.3); expect(phaseGain('set', 1000, false)).toBe(0);
    expect(phaseGain('reject', 250, false)).toBe(0); expect(phaseGain('set', 150, true)).toBe(0);
  });
});
