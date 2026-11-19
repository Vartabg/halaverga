// Fight keys live in the scene chunk. Desktop flight-style shortcuts take priority over the four combat digits.
import { currentFamily } from '@/ui/controls/family';
import { keysEnabled } from '@/ui/controls/keysPref';
import { type ShooterState } from './combat';
import { COMMAND, SHIELD, requestCommand } from './commands';

const KEYS: Record<string, number> = { Digit1: COMMAND.rebuke, Digit2: COMMAND.sword, Digit3: COMMAND.bind, Digit4: COMMAND.cast };
/** Returns true when handled. live = started and not paused. */
export function commandKeyDown(e: KeyboardEvent, live: boolean, s: ShooterState) {
  const target = e.target as HTMLElement | null;
  if (!live || e.metaKey || e.ctrlKey || e.altKey || e.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName ?? '')) return false;
  if (e.code in KEYS) {
    if (e.defaultPrevented || target?.isContentEditable || target?.closest?.('dialog,[role="dialog"]')) return false;
    if (currentFamily() === 'desktop' && keysEnabled()) return false;
    requestCommand(s, KEYS[e.code]);
    return true;
  }
  if (e.code === 'KeyV') { s.input.shield |= SHIELD.keys; return true; }
  return false;
}
/** Releases are never gated, so a held V always ends. */
export function commandKeyUp(code: string, s: ShooterState) { if (code === 'KeyV') s.input.shield &= ~SHIELD.keys; }
