// The recognition chime (spec 6-7): a short two-partial bell when a stroke 'sets', pitched by the stroke's release speed. It plays
// on the blaster's shared AudioContext (audioUnlock owns it; audioBus's Voice union is closed to lab voices) and obeys the same
// mute flag, so muted or before the first unlock it creates nothing. At most one chime per CHIME_GAP_S.
import { useGame } from '@/game/store';
import { blasterContext } from '@/ui/audioUnlock';
import { SET_MS } from '@/game/gesture/tuning';

/** Release speed (px/ms) maps log-linearly onto the pitch range: slow strokes ring low, fast ones high. */
export const CHIME_SLOW = .2, CHIME_FAST = 3, CHIME_LOW_HZ = 520, CHIME_HIGH_HZ = 1560;
export const CHIME_GAIN = .12, CHIME_S = .28, CHIME_GAP_S = .08, CHIME_ATTACK_S = .005;

export function chimeHz(speed: number): number {
  const s = Number.isFinite(speed) ? Math.min(CHIME_FAST, Math.max(CHIME_SLOW, speed)) : CHIME_SLOW;
  const k = Math.log(s / CHIME_SLOW) / Math.log(CHIME_FAST / CHIME_SLOW);
  return CHIME_LOW_HZ * Math.pow(CHIME_HIGH_HZ / CHIME_LOW_HZ, k);
}

/** The minimum AudioContext surface the chime uses (a fake satisfies it in node tests). */
export type ChimeContext = Pick<AudioContext, 'state' | 'currentTime' | 'destination' | 'createOscillator' | 'createGain'>;
export type ChimeDeps = { context(): ChimeContext | null; muted(): boolean };
const DEFAULT_DEPS: ChimeDeps = { context: blasterContext, muted: () => useGame.getState().muted };
let lastAt = -Infinity, lastCtx: ChimeContext | null = null;

/** Plays the chime for a stroke that set at `speed` px/ms. Returns true when a sound was scheduled. */
export function playChime(speed: number, deps: ChimeDeps = DEFAULT_DEPS): boolean {
  if (deps.muted()) return false;
  const c = deps.context();
  if (!c || c.state !== 'running') return false;
  const t = c.currentTime;
  if (c === lastCtx && t - lastAt < CHIME_GAP_S) return false;
  try {
    const f = chimeHz(speed), out = c.createGain(), g = out.gain;
    g.setValueAtTime(.0001, t);
    g.exponentialRampToValueAtTime(CHIME_GAIN, t + CHIME_ATTACK_S);
    g.exponentialRampToValueAtTime(.0001, t + CHIME_S);
    out.connect(c.destination);
    // The fundamental and a quiet octave-and-a-fifth partial; the partial fades within the 120 ms 'set' flash.
    for (let k = 0; k < 2; k++) {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(k ? f * 3 : f, t);
      if (k) {
        const p = c.createGain();
        p.gain.setValueAtTime(.35, t); p.gain.exponentialRampToValueAtTime(.0001, t + SET_MS / 1000);
        o.connect(p); p.connect(out);
      } else o.connect(out);
      o.start(t); o.stop(t + CHIME_S + .02);
    }
    lastAt = t; lastCtx = c;
    return true;
  } catch { return false; }
}
