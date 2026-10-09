import dynamic from 'next/dynamic';
import Boundary from './Boundary';
// The one landing-side door to the pause card's controls (the Controls row, the tried line and the vote door): a single lazy chunk, so
// the landing first load carries no control names, copy or picker code. Flight settings imports the Controls row directly (it is a
// chunk already). A chunk that fails to load (deploy skew, offline) only leaves those rows out: the Boundary keeps the pause card, with
// Resume, the Field guide and Flight settings, standing.
const Controls = dynamic(() => import('./controls/PauseControls'), { ssr: false, loading: () => null });
const skip = () => {};
export default function LazyControls() {
  return <Boundary fallback={null} onError={skip}><Controls /></Boundary>;
}
