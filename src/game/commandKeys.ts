// War in Heaven keys, kept in the scene chunk (the landing page carries only shooterKeys.ts): 1 rebuke, 2 sword, 3 bind, 4 cast on
// the demon under the centre reticle; hold V for the shield of faith. C and a click take the next step (Shooter.tsx turns the old
// trigger press into a context command).
import { type ShooterState } from './combat';
import { COMMAND, SHIELD, requestCommand } from './commands';

const KEYS: Record<string, number> = { Digit1: COMMAND.rebuke, Digit2: COMMAND.sword, Digit3: COMMAND.bind, Digit4: COMMAND.cast };
type Key = { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; targetTag: string };
/** Returns true when handled. live = started and not paused. */
export function commandKeyDown(e: Key, live: boolean, s: ShooterState) {
  if (!live || e.metaKey || e.ctrlKey || e.altKey || e.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(e.targetTag)) return false;
  if (e.code in KEYS) { requestCommand(s, KEYS[e.code]); return true; }
  if (e.code === 'KeyV') { s.input.shield |= SHIELD.keys; return true; }
  return false;
}
/** Releases are never gated, so a held V always ends. */
export function commandKeyUp(code: string, s: ShooterState) { if (code === 'KeyV') s.input.shield &= ~SHIELD.keys; }
