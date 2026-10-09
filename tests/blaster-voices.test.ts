import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/combat';
import { FLOOR, VOICES, live } from '../src/ui/blasterVoices';

// A minimal mock AudioContext: it records every scheduled value so the shot voice's envelope can be evaluated at any time.
type Ramp = { kind: 'set' | 'exp' | 'lin'; value: number; time: number };
class Param {
  ramps: Ramp[] = [];
  setValueAtTime(value: number, time: number) { this.ramps.push({ kind: 'set', value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.ramps.push({ kind: 'exp', value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.ramps.push({ kind: 'lin', value, time }); return this; }
  /** Value at time t (the Web Audio automation rules for set and exponential ramps). */
  at(t: number) {
    let v = this.ramps[0]?.value ?? 0, t0 = this.ramps[0]?.time ?? 0;
    for (const r of this.ramps.slice(1)) {
      if (t >= r.time) { v = r.value; t0 = r.time; continue; }
      if (r.kind === 'exp') return v * (r.value / v) ** ((t - t0) / (r.time - t0));
      return v;
    }
    return v;
  }
}
class Node {
  type = ''; buffer: unknown = null; outputs: Node[] = []; started: number[] = []; stopped: number[] = []; onended: (() => void) | null = null;
  frequency = new Param(); Q = new Param(); gain = new Param();
  constructor(public kind: string) {}
  connect(n: Node) { this.outputs.push(n); return n; }
  disconnect() {}
  start(t: number) { this.started.push(t); }
  stop(t: number) { this.stopped.push(t); }
}
class Ctx {
  nodes: Node[] = [];
  constructor(public currentTime = 0) {}
  private add(kind: string) { const n = new Node(kind); this.nodes.push(n); return n; }
  createGain() { return this.add('gain'); }
  createOscillator() { return this.add('osc'); }
  createBufferSource() { return this.add('source'); }
  createBiquadFilter() { return this.add('filter'); }
  of(kind: string) { return this.nodes.filter(n => n.kind === kind); }
}
const noise = { duration: 1 } as AudioBuffer;
function fire(t0: number, seed: number) {
  const c = new Ctx(t0), dest = new Node('dest');
  const end = VOICES.fire(c as unknown as BaseAudioContext, dest as unknown as AudioNode, noise, mulberry32(seed), {});
  live.length = 0;
  return { c, end };
}
const peakOf = (n: Node) => Math.max(...n.gain.ramps.map(r => r.value));

describe('shot voice', () => {
  it('keeps every frequency endpoint at or above 150 Hz (phone speakers)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { c } = fire(0, seed), freqs = c.of('osc').flatMap(o => o.frequency.ramps.map(r => r.value));
      expect(freqs.length).toBe(4); expect(Math.min(...freqs)).toBeGreaterThanOrEqual(150);
    }
    const { c } = fire(0, 7), [saw, punch] = c.of('osc');
    expect(saw.type).toBe('sawtooth'); expect(punch.type).toBe('sine');
    const p = saw.frequency.ramps[0].value / 1100;
    expect(saw.frequency.ramps[1]).toMatchObject({ kind: 'exp', time: .11 }); expect(saw.frequency.ramps[1].value / p).toBeCloseTo(150, 6);
    expect(punch.frequency.ramps[0].value / p).toBeCloseTo(260, 6); expect(punch.frequency.ramps[1].value / p).toBeCloseTo(160, 6);
    expect(punch.frequency.ramps[1].time).toBeCloseTo(.07, 12);
  });
  it('is at least 20 dB down by 110 ms: every part at <= .1 of the voice peak', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { c, end } = fire(0, seed), gains = c.of('gain'), peak = Math.max(...gains.map(peakOf));
      for (const g of gains) expect(g.gain.at(.11)).toBeLessThanOrEqual(.1 * peak);
      expect(gains.reduce((sum, g) => sum + g.gain.at(.11), 0)).toBeLessThanOrEqual(.1 * peak);
      expect(end).toBeCloseTo(.09, 12);
      expect(Math.max(...c.nodes.flatMap(n => n.stopped))).toBeLessThanOrEqual(.11 + 1e-12);
    }
  });
  it('peaks within 5 ms: the first ramp of every envelope, attack <= 2 ms on the transient', () => {
    const { c } = fire(0, 3), gains = c.of('gain');
    expect(gains).toHaveLength(4);
    for (const g of gains) {
      const first = g.gain.ramps.find(r => r.kind === 'exp')!;
      expect(first.time).toBeLessThanOrEqual(.005); expect(first.value).toBe(peakOf(g));
    }
    const transient = c.of('source')[0].outputs[0].outputs[0];
    expect(transient.gain.ramps[1].time).toBeLessThanOrEqual(.002);
    expect(c.of('filter')[0].type).toBe('highpass');
  });
  it('schedules everything at ctx.currentTime', () => {
    const t0 = 3.25, { c } = fire(t0, 11);
    const sources = c.nodes.filter(n => n.kind === 'osc' || n.kind === 'source');
    expect(sources).toHaveLength(4);
    for (const s of sources) expect(s.started).toEqual([t0]);
    for (const g of c.of('gain')) { expect(g.gain.ramps[0]).toEqual({ kind: 'set', value: FLOOR, time: t0 }); }
    expect(Math.max(...c.nodes.flatMap(n => n.stopped))).toBeCloseTo(t0 + .11, 12);
  });
});
