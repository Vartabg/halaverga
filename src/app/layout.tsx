import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Halaverga — Return to Earth', description: 'An expedition through the ruins of tomorrow. A playable browser flight study.',
  robots: { index: false, follow: false },
  // Add to Home Screen opens full screen (no Safari bars to swipe into). Next 16 emits only mobile-web-app-capable, so the
  // older Apple name is added through `other` for iOS versions that still read it.
  appleWebApp: { capable: true, title: 'Halaverga', statusBarStyle: 'black-translucent' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};
// Page zoom stays allowed (no maximumScale/userScalable): play blocks pinch itself and pausing gives it back.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#162b32' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
