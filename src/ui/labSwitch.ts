// Switching the Gesture Lab scheme (spec 8). Landing-safe: plain store and runtime calls, no lab module. Every switch drops all held
// input (clearInput also releases the lab's aimed fire and clears the gesture bus) and bumps inputEpoch, so the controls remount.
import { chooseControlLab, overrideControls, useGame, type ControlLab } from '@/game/store';
import { clearInput } from '@/game/runtime';

/** The player's choice from a picker: saved, and it ends a ?controls= session override. Returns the scheme that was left. */
export function switchLab(id: ControlLab): ControlLab {
  const left = useGame.getState().controlLab;
  if (left === id) return left;
  clearInput();
  chooseControlLab(id);
  useGame.setState(s => ({ inputEpoch: s.inputEpoch + 1 }));
  return left;
}

/** A lab chunk that failed to load or render: back to the standard controls for this session (the saved choice stays). */
export function labFault(message: string) {
  if (useGame.getState().controlLab === 'standard') return;
  clearInput();
  overrideControls('standard');
  useGame.setState(s => ({ inputEpoch: s.inputEpoch + 1, message }));
}

/** ?controls=standard|draw|conduct|brush: this session only (the pause card and settings pickers save a choice). */
export function readControlsQuery(query: URLSearchParams) {
  const v = query.get('controls');
  if (v === 'standard' || v === 'draw' || v === 'conduct' || v === 'brush') overrideControls(v);
}
