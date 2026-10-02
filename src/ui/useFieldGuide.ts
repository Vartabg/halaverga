import { useEffect, useState, type ComponentType } from 'react';
import { useGame } from '@/game/store';
// The Field guide (its copy, the record, the build stamp, the QR) is a chunk, not landing first-load code. Like the touch controls it is
// held in state, not in next/dynamic: every open that finds it missing calls import() again, so a load that failed (offline, deploy
// skew) is retried by the next open instead of leaving a dead component behind. It is warmed once hydration is done. `journal` stays
// the store's one "guide wanted" flag (the header button, the skip link, the terminal and the E key all set it): while the chunk is on
// its way the pause card stays with a status line, and a failed load puts `journal` back so nothing is stranded.
export const GUIDE_LOADING = 'Opening field guide…', GUIDE_FAILED = 'The field guide could not load. Try again.';
type GuideProps = { onClose: () => void };
const loadGuide = () => import('./FieldGuide');
export function useFieldGuide(hydrated: boolean) {
  const journal = useGame(s => s.journal), paused = useGame(s => s.paused);
  const [Guide, setGuide] = useState<ComponentType<GuideProps> | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { if (hydrated) void loadGuide().then(m => setGuide(() => m.default)).catch(() => {}); }, [hydrated]);
  useEffect(() => {
    if (!journal || Guide) return;
    let live = true;
    loadGuide().then(m => { setGuide(() => m.default); setFailed(false); }, () => { if (live) { useGame.setState({ journal: false }); setFailed(true); } });
    return () => { live = false; };
  }, [journal, Guide]);
  // A failure note belongs to the pause it happened in: playing again clears it.
  useEffect(() => { if (!paused) setFailed(false); }, [paused]);
  const fail = () => { useGame.setState({ journal: false }); setFailed(true); };
  // Guide is only handed out while it is wanted and loaded: a falsy Guide with `journal` set means "still loading" (or failed).
  return { Guide: journal ? Guide : null, fail, note: journal && !Guide ? GUIDE_LOADING : failed ? GUIDE_FAILED : '' };
}
