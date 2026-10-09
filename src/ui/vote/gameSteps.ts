// The two anonymous funnel steps that come from the game itself, scene ready and Begin (docs/voting.md, "Anonymous counts"). They are
// read from the game store by the vote layer, a lazy chunk, so the landing first load grows by nothing: Experience and Player stay
// untouched. Each is sent once per page load by the count function in lib/track, which holds the opt-out; the listener removes itself when both are sent.
import { useGame } from '@/game/store';
import { track } from '@/lib/track';

/** Count the scene becoming ready (the suit, the city and the collision map are loaded) and then Begin being tapped. Returns the cleanup. */
export function watchGameSteps(): () => void {
  let ready = false, began = false, stop = () => {};
  const look = (s: { ready: boolean; started: boolean }) => {
    if (s.ready && !ready) { ready = true; track('scene_ready'); }
    if (s.started && !began) { began = true; track('begin'); }
    if (ready && began) stop();
  };
  stop = useGame.subscribe(look);
  look(useGame.getState());
  return () => stop();
}
