import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../src/game/store';

type Ramp = { kind: string; value: number; time: number };
class FakeParam {
  ramps: Ramp[] = [];
  constructor(public value = 0) {}
  setValueAtTime(value: number, time: number) { this.ramps.push({ kind: 'set', value, time }); this.value = value; return this; }
  linearRampToValueAtTime(value: number, time: number) { this.ramps.push({ kind: 'lin', value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (!(value > 0)) throw new RangeError('exponential ramp to non-positive target');
    this.ramps.push({ kind: 'exp', value, time }); return this;
  }
  cancelScheduledValues(time: number) { this.ramps.push({ kind: 'cancel', value: NaN, time }); return this; }
}
class FakeNode {
  outputs: FakeNode[] = []; disconnected = 0; started: number[] = []; stopped: number[] = [];
  onended: (() => void) | null = null; type = ''; buffer: unknown = null;
  frequency = new FakeParam(); Q = new FakeParam(); gain = new FakeParam(1); pan = new FakeParam();
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam();
  constructor(public kind: string) {}
  connect(n: FakeNode) { this.outputs.push(n); return n; }
  disconnect() { this.disconnected++; }
  start(t: number) { this.started.push(t); }
  stop(t: number) { this.stopped.push(t); }
}
const contexts: FakeContext[] = [];
class FakeContext {
  state = 'running'; currentTime = 0; sampleRate = 8000; nodes: FakeNode[] = []; resumes = 0; closes = 0;
  destination = new FakeNode('destination');
  constructor() { contexts.push(this); }
  private add(kind: string) { const n = new FakeNode(kind); this.nodes.push(n); return n; }
  createGain() { return this.add('gain'); }
  createOscillator() { return this.add('osc'); }
  createBufferSource() { return this.add('source'); }
  createBiquadFilter() { return this.add('filter'); }
  createDynamicsCompressor() { return this.add('compressor'); }
  createStereoPanner() { return this.add('panner'); }
  createBuffer(_c: number, length: number, rate: number) {
    const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data };
  }
  resume() { this.resumes++; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
  of(kind: string) { return this.nodes.filter(n => n.kind === kind); }
}
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
const { audioBus } = await import('../src/ui/audioBus');
const { HIT_PEAK } = await import('../src/ui/blasterVoices');

const ctx = () => contexts[contexts.length - 1];
const params = (c: FakeContext) => c.nodes.flatMap(n => [n.frequency, n.Q, n.gain, n.pan]);
const oscFreqs = (c: FakeContext, from: number) => c.of('osc').filter(n => c.nodes.indexOf(n) >= from).map(n => n.frequency.ramps[0].value);
const peak = (n: FakeNode) => Math.max(...n.gain.ramps.map(r => r.value));
const ALL = ['fire', 'hit', 'weak', 'kill', 'blocked', 'overheat', 'vent', 'telegraph', 'arrive', 'break', 'burst'] as const;

describe('blaster audio bus', () => {
  beforeEach(() => { contexts.length = 0; useGame.setState({ muted: false }); });
  afterEach(() => { audioBus.dispose(); vi.unstubAllGlobals(); useGame.setState({ muted: true }); });

  it('does nothing before unlock and never creates a context at import', () => {
    audioBus.play('fire');
    expect(contexts).toHaveLength(0); expect(audioBus.voices).toBe(0);
  });

  it('muted makes play a no-op, and a context that is not running stays silent', () => {
    audioBus.unlock(); const before = ctx().nodes.length;
    useGame.setState({ muted: true }); audioBus.play('fire'); audioBus.play('kill', { chain: 4 });
    expect(ctx().nodes.length).toBe(before); expect(audioBus.voices).toBe(0);
    useGame.setState({ muted: false }); ctx().state = 'suspended'; audioBus.play('hit');
    expect(ctx().nodes.length).toBe(before);
    ctx().state = 'running'; audioBus.play('hit'); expect(audioBus.voices).toBe(1);
  });

  it('unlock resumes once per call on a single lazily created context', () => {
    audioBus.unlock(); audioBus.unlock(); audioBus.unlock();
    expect(contexts).toHaveLength(1); expect(ctx().resumes).toBe(3);
    const comp = ctx().of('compressor')[0], master = ctx().of('gain')[0];
    expect(master.gain.value).toBe(.5); expect(master.outputs[0]).toBe(comp); expect(comp.outputs[0]).toBe(ctx().destination);
    expect([comp.threshold.value, comp.knee.value, comp.ratio.value, comp.attack.value, comp.release.value]).toEqual([-10, 6, 12, .003, .1]);
    audioBus.dispose(); expect(contexts[0].closes).toBe(1);
    audioBus.unlock(); expect(contexts).toHaveLength(2);
  });

  it('fills the shared noise buffer from the seeded generator, identically each time', () => {
    const spy = vi.spyOn(FakeContext.prototype, 'createBuffer');
    audioBus.unlock(); const first = spy.mock.results[0].value.getChannelData(0).slice(0, 64);
    audioBus.dispose(); audioBus.unlock(); const second = spy.mock.results[1].value.getChannelData(0).slice(0, 64);
    expect(spy.mock.calls[0]).toEqual([1, 8000, 8000]);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first.some((v: number) => v !== 0) && first.every((v: number) => v >= -1 && v < 1)).toBe(true);
    spy.mockRestore();
  });

  it('sets the audio session to playback only while unmuted, and survives its absence', () => {
    const audioSession = { type: 'auto' }; vi.stubGlobal('navigator', { audioSession });
    useGame.setState({ muted: true }); audioBus.unlock(); expect(audioSession.type).toBe('auto');
    useGame.setState({ muted: false }); audioBus.unlock(); expect(audioSession.type).toBe('playback');
    vi.stubGlobal('navigator', {}); expect(() => audioBus.unlock()).not.toThrow();
    vi.stubGlobal('navigator', { get audioSession() { throw new Error('blocked'); } });
    expect(() => audioBus.unlock()).not.toThrow(); expect(contexts).toHaveLength(1);
  });

  it('caps 20 rapid shots at 8 voices and fades the evicted ones to the floor over 15 ms', () => {
    audioBus.unlock(); const c = ctx();
    for (let i = 0; i < 20; i++) { audioBus.play('fire'); expect(audioBus.voices).toBeLessThanOrEqual(8); }
    expect(audioBus.voices).toBe(8);
    const voiceBuses = c.of('gain').filter(g => g.outputs[0] === c.of('gain')[0]);
    expect(voiceBuses).toHaveLength(20);
    const faded = voiceBuses.filter(g => g.gain.ramps.some(r => r.kind === 'exp' && r.value === 1e-4 && Math.abs(r.time - .015) < 1e-9));
    expect(faded).toHaveLength(12); expect(voiceBuses.slice(0, 12)).toEqual(faded);
    const cut = c.nodes.filter(n => n.stopped.includes(.015));
    expect(cut).toHaveLength(12 * 4);
    c.currentTime = 1; expect(audioBus.voices).toBe(0);
    expect(voiceBuses.every(g => g.disconnected > 0)).toBe(true);
  });

  it('never ramps exponentially to zero, stops each source at its envelope end, and disconnects on ended', () => {
    audioBus.unlock(); const c = ctx();
    for (const kind of ALL) audioBus.play(kind, { pan: -.4, chain: 3, gain: .7 });
    const exps = params(c).flatMap(p => p.ramps).filter(r => r.kind === 'exp');
    expect(exps.length).toBeGreaterThan(40); expect(Math.min(...exps.map(r => r.value))).toBeGreaterThanOrEqual(1e-4);
    const sources = c.nodes.filter(n => n.kind === 'osc' || n.kind === 'source');
    for (const s of sources) {
      expect(s.started).toHaveLength(1); expect(s.stopped.slice(1)).toEqual(s.stopped.length > 1 ? [.015] : []);
      let n = s.outputs[0]; while (n.kind !== 'gain') n = n.outputs[0];
      const last = n.gain.ramps[n.gain.ramps.length - 1];
      expect(last).toMatchObject({ kind: 'exp', value: 1e-4 }); expect(s.stopped[0]).toBeCloseTo(last.time, 9);
      s.onended?.(); expect(s.disconnected).toBe(1);
    }
  });

  it('times the voices as specified', () => {
    audioBus.unlock(); const c = ctx(); let from = c.nodes.length;
    const ends = (kind: typeof ALL[number]) => { from = c.nodes.length; audioBus.play(kind); return c.nodes.slice(from).flatMap(n => n.stopped); };
    expect(ends('hit')).toEqual([.04]); expect(ends('weak')).toEqual([.06, .06]); expect(ends('blocked')).toEqual([.06]);
    expect(oscFreqs(c, from)).toEqual([150]);
    expect(ends('telegraph')).toEqual([.22]); expect(oscFreqs(c, from)).toEqual([700]);
    expect(c.of('osc').at(-1)!.frequency.ramps.at(-1)).toMatchObject({ value: 1800, time: .22 });
    const arrive = ends('arrive'); expect(arrive[0]).toBeCloseTo(.15, 9); expect(arrive[1]).toBeCloseTo(.3, 9);
    expect(oscFreqs(c, from)).toEqual([500, 750]);
    const fire = ends('fire'); expect(fire.map(t => +t.toFixed(3))).toEqual([.01, .11, .07, .09]);
    const saw = c.nodes.slice(from).find(n => n.type === 'sawtooth')!;
    const pitch = saw.frequency.ramps[0].value / 1100; expect(pitch).toBeGreaterThanOrEqual(.95); expect(pitch).toBeLessThanOrEqual(1.05);
    expect(saw.frequency.ramps[1].value / pitch).toBeCloseTo(150, 6);
    const brk = ends('break'), filter = c.nodes.slice(from).find(n => n.kind === 'filter')!;
    expect(brk).toEqual([.12]); expect([filter.type, filter.frequency.ramps[0].value, filter.Q.ramps[0].value]).toEqual(['bandpass', 2500, 8]);
  });

  it('raises the kill pitch a semitone per chain step above 1, capped at +5, and plays 3 dB over hit', () => {
    audioBus.unlock(); const c = ctx();
    const freqs = (chain?: number) => { const from = c.nodes.length; audioBus.play('kill', { chain }); return oscFreqs(c, from); };
    const base = freqs(1), three = freqs(3), nine = freqs(9), seven = freqs(7);
    expect(base).toEqual([2000, 90]); expect(freqs()).toEqual(base); expect(freqs(0)).toEqual(base);
    three.forEach((f, i) => expect(f / base[i]).toBeCloseTo(2 ** (2 / 12), 9));
    nine.forEach((f, i) => expect(f / base[i]).toBeCloseTo(2 ** (5 / 12), 9));
    expect(seven).toEqual(nine);
    const tick = c.of('osc').find(n => n.frequency.ramps[0].value === 2000)!;
    const from = c.nodes.length; audioBus.play('hit'); const hit = c.nodes.slice(from).find(n => n.kind === 'osc')!;
    expect(peak(tick.outputs[0]) / peak(hit.outputs[0])).toBeCloseTo(10 ** (3 / 20), 9);
    expect(peak(hit.outputs[0])).toBe(HIT_PEAK);
  });

  it('pans the positional voices through a stereo panner, and skips panning when unsupported', () => {
    audioBus.unlock(); const c = ctx();
    audioBus.play('telegraph', { pan: .6 }); const [panner] = c.of('panner');
    expect(panner.pan.value).toBe(.6); expect(panner.outputs[0].outputs[0]).toBe(c.of('gain')[0]);
    audioBus.play('burst', { pan: -3 }); audioBus.play('hit', { pan: .5 });
    expect(c.of('panner').map(p => p.pan.value)).toEqual([.6, -1]);
    audioBus.play('arrive', { gain: .3 }); expect(c.of('panner')).toHaveLength(3);
    expect(c.of('panner')[2].outputs[0].gain.value).toBe(.3);
    audioBus.play('arrive', { gain: 0 }); expect(c.of('panner')).toHaveLength(3);
    audioBus.dispose();
    const orig = FakeContext.prototype.createStereoPanner;
    (FakeContext.prototype as { createStereoPanner?: unknown }).createStereoPanner = undefined;
    try { audioBus.unlock(); audioBus.play('telegraph', { pan: .6 }); expect(ctx().nodes.some(n => n.kind === 'osc')).toBe(true); }
    finally { FakeContext.prototype.createStereoPanner = orig; }
  });

  it('keeps Math.random out of the blaster sources', () => {
    for (const f of ['src/ui/audioBus.ts', 'src/ui/blasterVoices.ts']) expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).not.toContain('Math.random');
  });
});
