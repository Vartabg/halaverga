import { Suspense, useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { CanvasTexture, EquirectangularReflectionMapping, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import Boundary from '@/ui/Boundary';
import BackdropSky from './BackdropSky';
import EnvironmentLight from './EnvironmentLight';
import { Sky } from './Sky';
import { BACKDROP_TURN, BACKDROP_URL } from './backdropConst';

/** The painted dawn as the scene's sky and its reflection: one 2048x1024 sRGB equirect (a photographed Poly Haven sky, painted
 * offline, see docs/art/hermon-sky). The scene's code loads it only here, after Begin, never in the landing page's JavaScript; the
 * landing page's lazy chunks may still start the image download while it is showing. The sky sphere uses the full image; the
 * environment map is built from a 256x128 copy, so the large image is never filtered into a cube target. */
function Painted() {
  const map = useLoader(TextureLoader, BACKDROP_URL);
  const small = useMemo(() => {
    map.colorSpace = SRGBColorSpace; map.wrapS = RepeatWrapping; map.needsUpdate = true;   // before any child reads it: no linear-read first frame
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    canvas.getContext('2d')?.drawImage(map.image as CanvasImageSource, 0, 0, 256, 128);
    const copy = new CanvasTexture(canvas);
    copy.colorSpace = SRGBColorSpace; copy.mapping = EquirectangularReflectionMapping;
    return copy;
  }, [map]);
  useEffect(() => () => small.dispose(), [small]);
  return <><BackdropSky map={map} /><EnvironmentLight source={small} turn={BACKDROP_TURN} /></>;
}

/** The painted backdrop with the procedural dome as its fallback: a slow decode shows the dome, a missing file or a decode error
 * keeps it, and the scene is never blocked or faulted by the art. Retry clears the loader cache (clearWorldCache in Suit.tsx). */
export default function Backdrop() {
  const fallback = <><EnvironmentLight /><Sky /></>;
  return <Boundary fallback={fallback} onError={() => {}}><Suspense fallback={fallback}><Painted /></Suspense></Boundary>;
}
