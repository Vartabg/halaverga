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
/**
 * The kill explosion, with weight: a sub thump (70 -> 32 Hz) that a phone cannot play, carried there by a mid body (triangle
 * 180 -> 95 Hz) and a lowpassed rumble; a hard crack on top; then a debris tail (bandpassed noise that swells in over 80 ms and
 * decays over half a second) with two small metallic ticks as pieces land. p is the chain pitch.
 */
function boom(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, rng: () => number, t: number, p: number) {
  hiss(ctx, dest, noise, rng, t, .02, .4, 'highpass', 1800, .7, .001);
  hiss(ctx, dest, noise, rng, t, .35, .3, 'lowpass', 900, .7, .004);
  tone(ctx, dest, 'sine', 70 * p, 32 * p, t, .4, .4, .006);
  tone(ctx, dest, 'triangle', 180 * p, 95 * p, t, .28, .3, .004);
  tone(ctx, dest, 'sine', 2600 * p, 2600 * p, t + .14 + rng() * .04, .03, .08, .002);
  tone(ctx, dest, 'sine', 3300 * p, 3300 * p, t + .26 + rng() * .05, .03, .06, .002);
  return hiss(ctx, dest, noise, rng, t + .03, .55, .14, 'bandpass', 1200 * p, 1.5, .08);
}

export const VOICES: Record<Voice, Build> = {
  // Shot, tuned for phone speakers and 9/s without smear: a 1 ms noise transient, a saw sweep 1100 -> 150 Hz over 110 ms, a sine
  // punch 260 -> 160 Hz over 70 ms and a 90 ms body tail, all at ctx.currentTime; every part is at the floor by 110 ms (-20 dB well
  // before). The pitch jitter only goes up (x1 to x1.05) so no endpoint drops under 150 Hz, where small speakers roll off.
  fire(ctx, dest, noise, rng) {
    const t = ctx.currentTime, p = 1 + rng() * .05, g = .35 * db(rng() * 2 - 1);
    hiss(ctx, dest, noise, rng, t, .01, g, 'highpass', 3000, .7, .001);
    tone(ctx, dest, 'sawtooth', 1100 * p, 150 * p, t, .11, g * .6, .002);
    tone(ctx, dest, 'sine', 260 * p, 160 * p, t, .07, g, .002);
    return hiss(ctx, dest, noise, rng, t, .09, g * .35, 'bandpass', 900 * p, 1.2, .004);
  },
  hit: (ctx, dest) => tone(ctx, dest, 'sine', 2000, 2000, ctx.currentTime, .04, HIT_PEAK, .002),
  weak(ctx, dest) {
    const t = ctx.currentTime; tone(ctx, dest, 'sine', 2600, 2600, t, .06, .2, .002);
    return tone(ctx, dest, 'sine', 3900, 3900, t, .06, .14, .002);
  },
  blocked: (ctx, dest) => tone(ctx, dest, 'triangle', 150, 110, ctx.currentTime, .06, .3),
  // Arrivals by surface. Concrete: a dull thud (lowpassed noise, 70 ms) under a 6 ms click. Steel: a bright ping (2400 -> 1900 Hz)
  // with a hard click. Water: a plop (520 -> 180 Hz) and a short lowpassed splash.
  world(ctx, dest, noise, rng) {
    const t = ctx.currentTime; hiss(ctx, dest, noise, rng, t, .006, .22, 'highpass', 2500, .7, .001);
    return hiss(ctx, dest, noise, rng, t, .07, .2, 'lowpass', 500, .9, .003);
  },
  steel(ctx, dest, noise, rng) {
    const t = ctx.currentTime; hiss(ctx, dest, noise, rng, t, .008, .25, 'highpass', 3500, .7, .001);
    return tone(ctx, dest, 'sine', 2400, 1900, t, .11, .16, .002);
  },
  water(ctx, dest, noise, rng) {
    const t = ctx.currentTime; tone(ctx, dest, 'sine', 520, 180, t, .09, .22, .004);
    return hiss(ctx, dest, noise, rng, t + .01, .12, .12, 'lowpass', 1800, .7, .01);
  },
  // The killing hit: the 3 dB tick and a crack with a short thump (90 -> 45 Hz, 120 ms) on the frame of the hit; the explosion
  // itself ('burst', below) follows 80 ms later from the drone's position with the same chain pitch.
  kill(ctx, dest, noise, rng, opts) {
    const t = ctx.currentTime, p = 2 ** (chainSemitones(opts.chain) / 12);
    tone(ctx, dest, 'sine', 2000 * p, 2000 * p, t, .04, HIT_PEAK * db(3), .002);
    hiss(ctx, dest, noise, rng, t, .06, .35, 'bandpass', 1600 * p, 1.2, .001);
    return tone(ctx, dest, 'sine', 90 * p, 45 * p, t, .12, .3, .004);
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
  // Failing drone (2 HP): an electrical crackle, three short bandpassed bursts over a sagging buzz (230 -> 160 Hz).
  fail(ctx, dest, noise, rng) {
    const t = ctx.currentTime;
    for (let k = 0; k < 3; k++) hiss(ctx, dest, noise, rng, t + k * .05, .025, .2, 'bandpass', 3200, 6, .002);
    return tone(ctx, dest, 'sawtooth', 230, 160, t, .2, .07, .01);
  },
  burst: (ctx, dest, noise, rng, opts) => boom(ctx, dest, noise, rng, ctx.currentTime, 2 ** (chainSemitones(opts.chain) / 12)),
};
