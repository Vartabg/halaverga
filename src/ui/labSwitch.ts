// A lab chunk that failed to load or render falls back to the standard controls for this session. Landing-safe: plain store and runtime
// calls, no lab module, no fresh chunk fetch (it must work when the network is down). The player's own picks are selectControl's.
import { overrideControlFields, useGame } from '@/game/store';
import { clearInput } from '@/game/runtime';

/** A lab chunk that failed to load or render: back to the standard controls for this session (the saved choice stays). */
export function labFault(message: string) {
  if (useGame.getState().controlLab === 'standard') return;
  clearInput();
  overrideControlFields({ controlLab: 'standard' });
  useGame.setState(s => ({ inputEpoch: s.inputEpoch + 1, message }));
}
