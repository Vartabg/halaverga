'use client';
import ControlsPicker from './ControlsPicker';
import ControlsLayer from './ControlsLayer';
import { useControlKeys } from './controlKeys';
import DemoNote from './DemoNote';

// The one lazy entry the landing page imports (a single dynamic call site, used three times in Experience: the header's trigger, the
// sheet beside the header, and the start card's note).
function Trigger({ failed }: { failed?: boolean }) {
  useControlKeys();
  return failed ? null : <ControlsPicker />;
}
export default function ControlsEntry({ part, failed }: { part: 'trigger' | 'sheet' | 'note'; failed?: boolean }) {
  return part === 'note' ? <DemoNote /> : part === 'sheet' ? <ControlsLayer /> : <Trigger failed={failed} />;
}
