// War in Heaven command requests (banish.ts consumes them). Kept out of combat.ts, which ships whole on the landing page.
import type { ShooterState } from './combat';
/** context picks the next step for the target's state (desktop click, C). */
export const COMMAND = { context: 0, rebuke: 1, sword: 2, bind: 3, cast: 4, flick: 5 } as const;
export function requestCommand(s: ShooterState, kind: number, target = -1) { s.input.cmdKind = kind; s.input.cmdTarget = target; s.input.cmd++; }
export const SHIELD = { keys: 1, touch: 2, button: 4 } as const;
