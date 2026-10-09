import { mulberry32 } from '../game/combat';
import { useGame } from '../game/store';
import { FLOOR, VOICES, live } from './blasterVoices';
import { blasterContext, releaseBlasterAudio, unlockBlasterAudio } from './audioUnlock';
// The blaster voice graph (scene chunk only). The context itself belongs to audioUnlock.ts, which the landing page imports to
// unlock inside a gesture; the compressor, master gain and seeded noise buffer are built here on first use of each context.

export type Voice = 'fire' | 'hit' | 'weak' | 'kill' | 'blocked' | 'overheat' | 'vent' | 'telegraph' | 'arrive' | 'break' | 'burst';
export type PlayOptions = { pan?: number /* -1..1 */; gain?: number /* 0..1 distance attenuation */; chain?: number /* kill chain count */ };
type Live = { out: GainNode; panner: StereoPannerNode | null; sources: AudioScheduledSourceNode[]; end: number; fading: boolean };

export const VOICE_CAP = 8, EVICT_FADE = .015, NOISE_SEED = 0x5eed1, VOICE_SEED = 0xb1a57;
const POSITIONAL = new Set<Voice>(['telegraph', 'arrive', 'burst']);
const NONE: PlayOptions = {};
let graph: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null, rng = mulberry32(VOICE_SEED);
const active: Live[] = [];

function release(v: Live) { v.out.disconnect(); v.panner?.disconnect(); }
function dropVoices() { for (const v of active) release(v); active.length = 0; live.length = 0; }
/** Builds the graph once per context; a released and rebuilt context gets a fresh graph and a reseeded voice generator. */
function ensureGraph(c: AudioContext) {
  if (graph === c) return;
  dropVoices(); graph = null; master = noise = null;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = .003; comp.release.value = .1;
  master = c.createGain(); master.gain.value = .5; master.connect(comp).connect(c.destination);
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = noise.getChannelData(0), n = mulberry32(NOISE_SEED);
  for (let i = 0; i < data.length; i++) data[i] = n() * 2 - 1;
  rng = mulberry32(VOICE_SEED); graph = c;
}
function prune(t: number) {
  for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= t) { release(active[i]); active.splice(i, 1); }
}
function evict(v: Live, t: number) {
  const g = v.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(FLOOR, g.value), t);
  g.exponentialRampToValueAtTime(FLOOR, t + EVICT_FADE);
  for (const s of v.sources) try { s.stop(t + EVICT_FADE); } catch { /* already stopped */ }
  v.fading = true; v.end = Math.min(v.end, t + EVICT_FADE);
}
const count = () => active.reduce((n, v) => n + (v.fading ? 0 : 1), 0);

export const audioBus = {
  /** Unlocks (see unlockBlasterAudio) and builds the graph at once. The landing page calls unlockBlasterAudio directly. */
  unlock() {
    unlockBlasterAudio();
    const c = blasterContext();
    if (c) { try { ensureGraph(c); } catch { graph = master = noise = null; } }
  },
  play(kind: Voice, opts: PlayOptions = NONE) {
    const ctx = blasterContext();
    if (!ctx || ctx.state !== 'running' || useGame.getState().muted) return;
    try { ensureGraph(ctx); } catch { graph = master = noise = null; return; }
    if (!master || !noise) return;
    const level = Math.min(1, opts.gain ?? 1);
    if (!(level > 0)) return;
    const t = ctx.currentTime; prune(t);
    const out = ctx.createGain(); out.gain.value = Math.max(FLOOR, level); out.connect(master);
    let dest: AudioNode = out, panner: StereoPannerNode | null = null;
    if (POSITIONAL.has(kind) && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner(); panner.pan.value = Math.min(1, Math.max(-1, opts.pan ?? 0));
      panner.connect(out); dest = panner;
    }
    live.length = 0;
    try {
      const end = VOICES[kind](ctx, dest, noise, rng, opts);
      active.push({ out, panner, sources: live.slice(), end, fading: false });
    } catch { out.disconnect(); panner?.disconnect(); return; } finally { live.length = 0; }
    for (let i = 0, over = count() - VOICE_CAP; i < active.length && over > 0; i++) if (!active[i].fading) { evict(active[i], t); over--; }
  },
  /** Drops every voice and closes the context (also restores the audio session). */
  dispose() {
    dropVoices(); graph = master = noise = null;
    releaseBlasterAudio();
  },
  get voices() { const c = blasterContext(); if (c && c === graph) prune(c.currentTime); return count(); },
};
