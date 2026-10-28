import { useGame } from './store';

let audioCtx: AudioContext | null = null;

function getReadyAudio(isUserGesture: boolean): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const state = useGame.getState() as { muted?: boolean };
  if (state.muted) return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state !== 'running') {
    if (isUserGesture) void audioCtx.resume().catch(() => {});
    return null;
  }
  return audioCtx;
}

export function playSwingAudio(step: number) {
  const ctx = getReadyAudio(true);
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const base = 165 + (step % 5) * 32;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(base * 1.45, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.52, now + 0.14);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.11, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

export function playImpactAudio(heavy: boolean) {
  const ctx = getReadyAudio(false);
  if (!ctx) return;
  const now = ctx.currentTime;
  // Sub-bass body thump
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(heavy ? 135 : 108, now);
  sub.frequency.exponentialRampToValueAtTime(34, now + (heavy ? 0.22 : 0.14));
  subGain.gain.setValueAtTime(heavy ? 0.22 : 0.15, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.23 : 0.15));
  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + (heavy ? 0.24 : 0.16));

  // Metallic blade harmonic
  const clang = ctx.createOscillator();
  const clangGain = ctx.createGain();
  clang.type = 'sawtooth';
  clang.frequency.setValueAtTime(heavy ? 740 : 920, now);
  clang.frequency.exponentialRampToValueAtTime(280, now + 0.09);
  clangGain.gain.setValueAtTime(heavy ? 0.09 : 0.06, now);
  clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
  clang.connect(clangGain);
  clangGain.connect(ctx.destination);
  clang.start(now);
  clang.stop(now + 0.1);
}

export function playParryAudio() {
  const ctx = getReadyAudio(true);
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const [freq, dur, amp] of [
    [540, 0.24, 0.11],
    [810, 0.28, 0.09],
    [1350, 0.18, 0.06],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.94, now + dur);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }
}

export function playRageAudio() {
  const ctx = getReadyAudio(true);
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const [freq, dur, amp] of [
    [92, 0.42, 0.2],
    [184, 0.38, 0.1],
    [276, 0.34, 0.08],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + dur);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }
}
