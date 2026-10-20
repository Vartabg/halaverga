// Counter and slow-motion state, with no imports, so the battle HUD (its own lazy chunk) can read it without pulling combat code
// into a shared chunk (the landing budget has no headroom). counter.ts and bulletTime.ts write it; BattleHud and CounterCue read it.
export const counterState = {
  /** A demon is about to hit the angel and a strike press now would counter it. */
  open: false,
  /** The demon to counter (-1 none) and the dart in flight that it threw (-1 none). */
  attacker: -1, bolt: -1,
  /** Counters landed (the HUD and effects watch the serial); real-time seconds since the last one. */
  serial: 0, since: 1e9,
  /** Current game-time scale (1 normal, lower in slow motion). */
  scale: 1,
};
