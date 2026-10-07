// Did the player actually play this second? The vote's "tried" time only grows while a key or pointer is held, or the last game
// input (pointer move or press, key press, wheel) was under 2 s ago. Events aimed at dialogs, the header or anything marked
// data-apart (the controls sheet and its backdrop, the vote card) and the digit keys that switch controls are not game input, so
// opening the sheet or stepping through the controls accrues nothing. Window capture listeners, passive, no state outside this closure. Local only.
import { inputRecent } from './voteTracker';

const APART = 'header, dialog, [role="dialog"], [data-apart]';
const DIGIT = /^(Digit|Numpad)\d$/;
type Target = { closest?: (selector: string) => unknown } | null;
const inGame = (t: EventTarget | null) => typeof (t as Target)?.closest === 'function' && !(t as Target)!.closest!(APART);
type Win = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface PlayInput {
  /** True when a key or pointer is held, or game input came within the window before `now` (performance.now() ms). */
  active(now: number): boolean;
  stop(): void;
}

export function watchPlayInput(win: Win = window, clock: () => number = () => performance.now()): PlayInput {
  const keys = new Set<string>(), pointers = new Set<number>();
  let last = -Infinity;
  const on: Record<string, (e: never) => void> = {
    keydown: (e: KeyboardEvent) => { if (inGame(e.target) && !DIGIT.test(e.code)) { keys.add(e.code); last = clock(); } },
    keyup: (e: KeyboardEvent) => { keys.delete(e.code); }, // any target: a key pressed in the game and lifted over a dialog still ends
    pointerdown: (e: PointerEvent) => { if (inGame(e.target)) { pointers.add(e.pointerId); last = clock(); } },
    pointerup: (e: PointerEvent) => { pointers.delete(e.pointerId); },
    pointercancel: (e: PointerEvent) => { pointers.delete(e.pointerId); },
    pointermove: (e: PointerEvent) => { if (inGame(e.target)) last = clock(); },
    wheel: (e: WheelEvent) => { if (inGame(e.target)) last = clock(); },
    blur: () => { keys.clear(); pointers.clear(); }, // a release the page never saw cannot count as held forever
  };
  const opt = { capture: true, passive: true } as const;
  for (const [type, fn] of Object.entries(on)) win.addEventListener(type, fn as EventListener, opt);
  return {
    active: now => keys.size > 0 || pointers.size > 0 || inputRecent(last, now),
    stop() { for (const [type, fn] of Object.entries(on)) win.removeEventListener(type, fn as EventListener, opt); keys.clear(); pointers.clear(); },
  };
}
