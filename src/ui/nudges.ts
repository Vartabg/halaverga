// Keyboard and switch presses of Rise and Descend (a click with detail 0) have no finger to hold them, so each press holds its
// key for a short pulse. One timer per key: a Descend pulse right after a Rise pulse must not cancel the timer that ends Rise
// (a shared timer left Rise stuck on, climbing with nothing held).
export type NudgeKey = 'rise' | 'descend';
type Timer = ReturnType<typeof setTimeout>;
export function createNudges(set: (key: NudgeKey, value: 0 | 1) => void, held: (key: NudgeKey) => boolean, ms: number) {
  const timers: Record<NudgeKey, Timer | null> = { rise: null, descend: null };
  const stop = (key: NudgeKey) => { const t = timers[key]; if (t) clearTimeout(t); timers[key] = null; };
  return {
    /** Holds `key` for `ms`, restarting its own pulse; a finger still on the button at the end keeps it held. */
    pulse(key: NudgeKey) {
      stop(key); set(key, 1);
      timers[key] = setTimeout(() => { timers[key] = null; if (!held(key)) set(key, 0); }, ms);
    },
    /** Cancels every pending pulse end (unmount). */
    clear() { stop('rise'); stop('descend'); },
  };
}
