import { useEffect } from 'react';
import { useGame } from '@/game/store';
/**
 * What stands in for the Controls sheet when its chunk could not load (Experience's Boundary fallback). The pause card hides while the
 * sheet is open, so a Controls row that opened a sheet that never shows would leave the player with nothing: this puts the flag back at once.
 */
export default function SheetLost() {
  const open = useGame(s => s.controlsOpen);
  useEffect(() => { if (open) useGame.setState({ controlsOpen: false }); }, [open]);
  return null;
}
