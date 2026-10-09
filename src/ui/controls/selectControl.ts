// Lazy-only: the one writer of touchScheme, trackpadSteering, desktopMode and controlLab for a player's pick (after the ?controls= query
// and a lab fault, which pin the session only). Every layer sees one atomic change and remounts exactly as if chosen in Settings.
import { controlById, idFor, settingsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { clearInput, exitOwnPointerLock } from '@/game/runtime';
import { saveControlFields, useGame } from '@/game/store';

/** The control the saved-or-session settings describe for this family. */
export const currentControlId = (family: ControlFamily): ControlId => idFor(useGame.getState(), family);

let held = '';
/**
 * The name of a control picked while paused (the pause card's or Flight settings' Controls row), held for the hint slot. Resume empties `message`
 * and the slot is not on screen while paused, so the name waits here; the Controls button takes it once play is back (addendum D6).
 */
export const takeHeldName = (): string => { const name = held; held = ''; return name; };

/**
 * Switches to `id`. Returns false and does nothing when it is already the current control or the vote card is open. Otherwise, in
 * order: drop all held input (position and velocity stay), free a locked pointer without pausing, one state change (settings,
 * inputEpoch + 1, a message), and save the fields (ending only their own session pins). Never touches paused, started or checkpoint.
 */
export function selectControl(id: ControlId, { family }: { family: ControlFamily }): boolean {
  const state = useGame.getState();
  if (state.voteOpen || idFor(state, family) === id) return false;
  clearInput();
  // useInput pauses on an unexpected pointer-lock exit; this one is expected.
  if (typeof document !== 'undefined' && document.pointerLockElement) exitOwnPointerLock();
  const patch = settingsFor(id);
  const message = `${controlById(id).label} controls`;
  held = state.paused ? message : '';
  saveControlFields(patch, { inputEpoch: state.inputEpoch + 1, message });
  return true;
}
