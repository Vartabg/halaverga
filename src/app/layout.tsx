import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
// The one type family, self-hosted: next/font downloads Geist at build time and serves it with the static assets, so the page makes no request
// to a font service (the privacy page promises only Vercel analytics). It is a CSS variable, read by globals.css with a system sans behind it.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap', fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] });
export const metadata: Metadata = {
  title: 'Halaverga — The Watchers of Hermon', description: 'Mount Hermon at dawn in the days of Jared. A 3D flight action experience inspired by the Book of Enoch.',
  robots: { index: false, follow: false },
  // Add to Home Screen opens full screen (no Safari bars to swipe into). Next 16 emits only mobile-web-app-capable, so the
  // older Apple name is added through `other` for iOS versions that still read it.
  appleWebApp: { capable: true, title: 'Halaverga', statusBarStyle: 'black-translucent' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};
// Page zoom stays allowed (no maximumScale/userScalable): play blocks pinch itself and pausing gives it back. The theme colour is the obsidian panel.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#14111d' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={sans.variable}><body>{children}</body></html>;
}
