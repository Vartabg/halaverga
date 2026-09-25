// Keys 1-4 pick a Gesture Lab scheme (spec 2), and the roving focus of the header lab bar. Pure rules plus one window listener.
// Loaded only with the lazy LabBar chunk, so the landing first load carries none of it.
import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { touchMode } from '@/game/pointerMode';
import { switchLab } from '../labSwitch';
import { LAB_IDS, LAB_NAMES, type LabId } from './labStats';

/** The key fields labKeyFor reads (a KeyboardEvent fits). */
export type LabKeyEvent = { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  target: EventTarget | null };
export type LabKeyCtx = { touch: boolean; started: boolean; panel: boolean; journal: boolean; voteOpen: boolean };
type TargetLike = { tagName?: string; isContentEditable?: boolean; closest?: (sel: string) => unknown };

const KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

/** A typing field, an editable element, or anything inside a dialog: the digit belongs there, not to the lab. */
function typingTarget(target: EventTarget | null): boolean {
  const t = target as TargetLike | null;
  if (!t || typeof t !== 'object') return false;
  if (typeof t.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName.toUpperCase())) return true;
  if (t.isContentEditable) return true;
  return typeof t.closest === 'function' && !!t.closest('[role="dialog"],dialog,[contenteditable=""],[contenteditable="true"]');
}

/** Digit1-4 and Numpad1-4 map to LAB_IDS order when started on desktop with no panel, guide or vote card open. Else null. */
export function labKeyFor(e: LabKeyEvent, ctx: LabKeyCtx): LabId | null {
  const i = KEYS[e.code];
  if (i === undefined || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  if (ctx.touch || !ctx.started || ctx.panel || ctx.journal || ctx.voteOpen) return null;
  if (typingTarget(e.target)) return null;
  return LAB_IDS[i];
}

/** APG radio group: arrows move with wrap (Left/Up back, Right/Down forward), Home and End go to the ends. Null for other keys. */
export function rovingNext(i: number, key: string, n = LAB_IDS.length): number | null {
  switch (key) {
    case 'ArrowLeft': case 'ArrowUp': return (i - 1 + n) % n;
    case 'ArrowRight': case 'ArrowDown': return (i + 1) % n;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}

/** Switch to `id` (clears input, saves, remounts; never pauses) and announce it. The current scheme, or an open vote card, does nothing. */
export function pickLab(id: LabId): boolean {
  const g = useGame.getState();
  if (g.controlLab === id || g.voteOpen) return false; // the vote card is modal: nothing behind it switches
  switchLab(id);
  useGame.setState({ message: `${LAB_NAMES[id]} controls` });
  return true;
}

/** The live store fields the key check needs; an open vote card keeps 1-4 out of the game. */
const ctxNow = (): LabKeyCtx => {
  const g = useGame.getState();
  return { touch: touchMode(), started: g.started, panel: g.panel, journal: g.journal, voteOpen: g.voteOpen };
};

/** Keys 1-4 switch the scheme on desktop, playing or paused. */
export function useLabKeys() {
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const id = labKeyFor(e, ctxNow());
      if (!id) return;
      e.preventDefault();
      pickLab(id);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
