// Landing-side half of the blaster audio: the AudioContext singleton, its unlock inside a user gesture (iOS needs it
// synchronous), and its release. The voice graph and voices live in audioBus.ts, which only the lazy scene chunk imports.
// With the blaster off or muted nothing is created and the audio session is never touched, exactly as on main.
import { useGame } from '../game/store';
type Session = { type: string };
let ctx: AudioContext | null = null, sessionSet = false, watching = false;

function session(): Session | undefined {
  try { return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { audioSession?: Session }).audioSession; }
  catch { return undefined; }
}
/** Puts the session back to 'auto' only if unlock changed it, so a player who never unlocked keeps main's behaviour. */
function restoreSession() {
  if (!sessionSet) return;
  sessionSet = false;
  try { const s = session(); if (s) s.type = 'auto'; } catch { /* unsupported */ }
}
function makeContext() {
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}
/** The live blaster context, or null before the first unlock and after a release. */
export const blasterContext = () => ctx;

/** Suspends the context (pause, mute, hidden tab) and gives the audio session back. Resuming waits for the next gesture. */
export function quietBlasterAudio() {
  const c = ctx;
  if (c && c.state === 'running' && typeof c.suspend === 'function') {
    try { void c.suspend().catch(() => {}); } catch { /* already closing */ }
  }
  restoreSession();
}
/** Closes the context completely (blaster off, fault). The next unlock with the blaster on builds a new one. */
export function releaseBlasterAudio() {
  const c = ctx; ctx = null;
  if (c) { try { void c.close().catch(() => {}); } catch { /* already closed */ } }
  restoreSession();
}
function watch() {
  if (watching) return;
  watching = true;
  useGame.subscribe((s, p) => {
    if (!s.shooter) { if (p.shooter) releaseBlasterAudio(); return; }
    if ((s.muted && !p.muted) || (s.paused && !p.paused) || (!s.started && p.started)) quietBlasterAudio();
  });
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') quietBlasterAudio(); });
}
/**
 * Call from inside a click, key, mouse press or pointerup handler (touch pointerdown does not grant activation). Returns at once
 * while the blaster is off or muted: no context, no session change.
 */
export function unlockBlasterAudio() {
  const g = useGame.getState();
  if (!g.shooter || g.muted) return;
  watch();
  try {
    if (!ctx || ctx.state === 'closed') ctx = makeContext();
    if (ctx) void ctx.resume().catch(() => {});
  } catch { ctx = null; }
  try { const s = session(); if (s) { s.type = 'playback'; sessionSet = true; } } catch { /* unsupported */ }
}
