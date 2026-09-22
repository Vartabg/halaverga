import type { PlayOptions, Voice } from './audioBus';

export type Build = (ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, rng: () => number, opts: PlayOptions) => number;
export const FLOOR = 1e-4, HIT_PEAK = .25, KILL_STEPS = 5;
/** Sources started by the last build; the bus drains it after each voice so it can cut an evicted voice. */
export const live: AudioScheduledSourceNode[] = [];
export const db = (x: number) => 10 ** (x / 20);
export const chainSemitones = (chain = 1) => Math.min(KILL_STEPS, Math.max(0, Math.floor(chain) - 1));

function run(src: AudioScheduledSourceNode, t: number, end: number, offset?: number) {
  src.onended = () => src.disconnect();
  if (offset === undefined) src.start(t); else (src as AudioBufferSourceNode).start(t, offset);
  src.stop(end); live.push(src);
}
function env(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, attack: number, dur: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t); g.gain.exponentialRampToValueAtTime(Math.max(FLOOR, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + dur); g.connect(dest); return g;
}
function tone(ctx: BaseAudioContext, dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = .003) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(ctx, dest, t, peak, attack, dur)); run(o, t, t + dur); return t + dur;
}
function hiss(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, rng: () => number, t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = .7, attack = .002) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); s.buffer = noise;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.setValueAtTime(q, t);
  s.connect(f).connect(env(ctx, dest, t, peak, attack, dur));
  run(s, t, t + dur, rng() * Math.max(0, noise.duration - dur)); return t + dur;
}
function boom(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, rng: () => number, t: number, p: number) {
  hiss(ctx, dest, noise, rng, t, .25, .3, 'lowpass', 1200, .7, .004);
  return tone(ctx, dest, 'sine', 90 * p, 40 * p, t, .3, .35, .005);
}

export const VOICES: Record<Voice, Build> = {
  fire(ctx, dest, noise, rng) {
    const t = ctx.currentTime, p = .95 + rng() * .1, g = .35 * db(rng() * 2 - 1);
    hiss(ctx, dest, noise, rng, t, .012, g, 'highpass', 3000, .7, .001);
    tone(ctx, dest, 'sawtooth', 1100 * p, 150 * p, t, .11, g * .6, .002);
    tone(ctx, dest, 'sine', 200 * p, 55 * p, t, .1, g, .002);
    return hiss(ctx, dest, noise, rng, t, .35, g * .35, 'bandpass', 900 * p, 1.2, .01);
  },
  hit: (ctx, dest) => tone(ctx, dest, 'sine', 2000, 2000, ctx.currentTime, .04, HIT_PEAK, .002),
  weak(ctx, dest) {
    const t = ctx.currentTime; tone(ctx, dest, 'sine', 2600, 2600, t, .06, .2, .002);
    return tone(ctx, dest, 'sine', 3900, 3900, t, .06, .14, .002);
  },
  blocked: (ctx, dest) => tone(ctx, dest, 'triangle', 150, 110, ctx.currentTime, .06, .3),
  kill(ctx, dest, noise, rng, opts) {
    const t = ctx.currentTime, p = 2 ** (chainSemitones(opts.chain) / 12);
    tone(ctx, dest, 'sine', 2000 * p, 2000 * p, t, .04, HIT_PEAK * db(3), .002);
    return boom(ctx, dest, noise, rng, t, p);
  },
  overheat(ctx, dest, noise, rng) {
    const t = ctx.currentTime; hiss(ctx, dest, noise, rng, t, .4, .08, 'highpass', 4000, .7, .05);
    return tone(ctx, dest, 'sawtooth', 600, 200, t, .4, .18, .01);
  },
  vent(ctx, dest, noise, rng) {
    const t = ctx.currentTime; hiss(ctx, dest, noise, rng, t, .01, .2, 'highpass', 2000, .7, .001);
    return tone(ctx, dest, 'sine', 400, 1600, t, .18, .2, .01);
  },
  telegraph: (ctx, dest) => tone(ctx, dest, 'square', 700, 1800, ctx.currentTime, .22, .08, .01),
  arrive(ctx, dest) {
    const t = ctx.currentTime; tone(ctx, dest, 'sine', 500, 500, t, .15, .16, .01);
    return tone(ctx, dest, 'sine', 750, 750, t + .15, .15, .16, .01);
  },
  break: (ctx, dest, noise, rng) => hiss(ctx, dest, noise, rng, ctx.currentTime, .12, .5, 'bandpass', 2500, 8, .001),
  burst: (ctx, dest, noise, rng) => boom(ctx, dest, noise, rng, ctx.currentTime, 1),
};
