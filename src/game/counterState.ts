// Counter and slow-motion state, with no imports, so the battle HUD (its own lazy chunk) can read it without pulling combat code
// into a shared chunk (the landing budget has no headroom). counter.ts and slowMotion.ts write it; BattleHud and CounterCue read it.
export const counterState = {
  /** A demon is about to hit the angel and a strike press now would counter it. */
  open: false,
  /** The demon an untargeted press would counter (-1 none; the ring and the prompt show it) and the dart in flight (-1 none). */
  attacker: -1, bolt: -1,
  /** The demon about to hit that can be dived at, whatever an untargeted press would do (a tap on it still counters). */
  source: -1,
  /** Counters landed (the HUD and effects watch the serial); real-time seconds since the last one. */
  serial: 0, since: 1e9,
  /** Darts quenched on the shield with no dive (the thrower was out of the sword's reach). */
  deflects: 0,
  /** A counter pressed but not yet credited: the attacker its dive must reach (-1 none), and whether a dart was quenched. */
  pending: -1, pendingQuenched: false, pendingSerial: 0,
  /** Current game-time scale (1 normal, lower in slow motion). */
  scale: 1,
};
