'use client';
import ControlsPicker from './ControlsPicker';
import { useControlKeys } from './controlKeys';
import DemoNote from './DemoNote';

// The one lazy entry the landing page imports (a single dynamic call site, used twice in Experience: header slot and start card).
function Trigger({ failed }: { failed?: boolean }) {
  useControlKeys();
  return failed ? null : <ControlsPicker />;
}
export default function ControlsEntry({ part, failed }: { part: 'trigger' | 'note'; failed?: boolean }) {
  return part === 'note' ? <DemoNote /> : <Trigger failed={failed} />;
}
