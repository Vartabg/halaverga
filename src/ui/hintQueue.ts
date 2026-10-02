// The one hint slot's picker: pure, no React, first-load (Experience and HintSlot import it, so it holds no control names, vote copy or
// markers). One line at a time under the top row. Not a timed queue: most of these are true while a state holds (a surface in reach, a
// limit ahead, a terminal near), so the highest one that is true wins and the rest wait, and a lower one comes back when it clears.
// Timing stays where it was: `message` clears after 4 s (HintSlot's clock), a coach line keeps its own clock in ControlsHint (and that clock
// waits while the slot shows anything else).
import type { Coach, useGame } from '@/game/store';

export type HintKind = 'message' | 'record' | 'land' | 'limit' | 'blocked' | 'coach';
export interface Hint { kind: HintKind; text: string }
export interface HintInput {
  message: string; flying: boolean; canLand: boolean; limitCue: string; limitHint: string; descendBlocked: boolean;
  nearTerminal: boolean; coach: Coach | null;
  /** The Controls sheet, the vote card, the Field guide or Flight settings is open: the slot says nothing under a dialog. */
  hidden: boolean;
}
/** The land and no-landing texts are asserted by the browser specs: caps stay. */
export const LAND_TEXT = 'SURFACE IN REACH · LAND', BLOCKED_TEXT = 'NO LANDING BELOW · MOVE TO OPEN GROUND', RECORD_TEXT = '◇ Municipal record · Read ↗';

/** What Experience used to compute inline for the flight toast, moved as it was: land, a limit cue, no landing below, then a plain limit hint. */
function flightLine(i: HintInput): Hint | null {
  if (i.flying && i.canLand) return { kind: 'land', text: LAND_TEXT };
  if (i.limitCue && i.limitCue !== 'solid') return i.limitHint ? { kind: 'limit', text: i.limitHint } : null;
  if (i.flying && i.descendBlocked) return { kind: 'blocked', text: BLOCKED_TEXT };
  return i.limitHint ? { kind: 'blocked', text: i.limitHint } : null;
}

/**
 * Highest first: a message (a switch notice, a sound nudge, a lab fault, a vote toast), the Municipal record (a Read button: it outranks
 * a landing, because a terminal in reach is the rarer thing), the flight lines above (land, limit, no landing below), then the coach line
 * the controls lessons publish. Null while a dialog is open. A message that was pre-empted is dropped (as it always was), a coach line is not:
 * it keeps its clock and returns once nothing above it is true.
 */
export function pickHint(i: HintInput): Hint | null {
  if (i.hidden) return null;
  if (i.message) return { kind: 'message', text: i.message };
  if (i.nearTerminal) return { kind: 'record', text: RECORD_TEXT };
  return flightLine(i) ?? (i.coach ? { kind: 'coach', text: i.coach.text } : null);
}

type Game = ReturnType<typeof useGame.getState>;
/** The slot's inputs from the store (a pure read, so HintSlot and ControlsHint both ask the same question). */
export const hintInput = (s: Game): HintInput => ({
  message: s.message, flying: s.flying, canLand: s.canLand, limitCue: s.limitCue, limitHint: s.limitHint, descendBlocked: s.descendBlocked,
  nearTerminal: s.nearTerminal, coach: s.coach, hidden: s.controlsOpen || s.voteOpen || s.journal || s.panel,
});
/** The slot is covered by a dialog or showing something other than the coach line: the coach's clocks wait (addendum G1). */
export const slotBusy = (s: Game): boolean => { const i = hintInput(s); return i.hidden || pickHint({ ...i, coach: null }) !== null; };
/** A dialog covers the slot: a message's 4 s clock waits too, so a control's name is on screen for its 4 s once the sheet is closed. */
export const slotHidden = (s: Game): boolean => hintInput(s).hidden;
/** The `(pointer: coarse)` test the blaster HUD used for the controls lessons. */
export const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
