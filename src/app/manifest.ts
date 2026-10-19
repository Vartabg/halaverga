import type { MetadataRoute } from 'next';
// Installed from Safari's Share › Add to Home Screen, the game opens full screen in either orientation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Halaverga — War in Heaven', short_name: 'Halaverga',
    description: 'A winged warrior defends a celestial sanctuary against the abyssal host. A playable biblical fantasy adaptation.',
    start_url: '/', display: 'standalone', orientation: 'any',
    background_color: '#1c2023', theme_color: '#1c2023',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
