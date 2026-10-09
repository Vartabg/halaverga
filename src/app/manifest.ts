import type { MetadataRoute } from 'next';
// Installed from Safari's Share › Add to Home Screen, the game opens full screen in either orientation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Halaverga — Return to Earth', short_name: 'Halaverga',
    description: 'An expedition through the ruins of tomorrow. A playable browser flight study.',
    start_url: '/', display: 'standalone', orientation: 'any',
    background_color: '#162b32', theme_color: '#162b32',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
