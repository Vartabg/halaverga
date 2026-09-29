// Lazy-only: the one writer of touchScheme, trackpadSteering, desktopMode and controlLab for a player's pick (after the ?controls= query
// and a lab fault, which pin the session only). Every layer sees one atomic change and remounts exactly as if chosen in Settings.
import { controlById, idFor, settingsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { clearInput, runtime } from '@/game/runtime';
import { saveControlFields, useGame } from '@/game/store';

/** The control the saved-or-session settings describe for this family. */
export const currentControlId = (family: ControlFamily): ControlId => idFor(useGame.getState(), family);

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
  if (typeof document !== 'undefined' && document.pointerLockElement) { runtime.trackpad.unlocking = true; document.exitPointerLock(); }
  const patch = settingsFor(id);
  saveControlFields(patch, { inputEpoch: state.inputEpoch + 1, message: `${controlById(id).label} controls` });
  return true;
}
