import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import Boundary from './Boundary';
// The one landing-side door to the shared controls list (pause card and Field guide): a single lazy chunk, so the landing first load
// carries no control names, copy or picker code. Flight settings imports the section directly (it is a chunk already).
// A chunk that fails to load (deploy skew, offline) only leaves the list out: the Boundary keeps the pause card and the Field guide,
// the text alternative, standing.
const Section = dynamic(() => import('./controls/ControlsSection'), { ssr: false, loading: () => null });
const skip = () => {};
export default function LazyControls(props: ComponentProps<typeof Section>) {
  return <Boundary fallback={null} onError={skip}><Section {...props} /></Boundary>;
}
