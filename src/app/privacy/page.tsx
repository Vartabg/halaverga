// How a vote is counted, as a static page (spec 1.10): no store call, no vote data, no client JS. The ballot links here in a new tab.
import type { Metadata } from 'next';
import { RESULTS_CSS } from '../results/resultsCss';
import { PRIVACY_FULL } from '@/lib/vote/privacy';

export const metadata: Metadata = { title: 'Halaverga vote privacy', robots: { index: false, follow: false } };

export default function PrivacyPage() {
  return (
    <main className="vr-page">
      <style dangerouslySetInnerHTML={{ __html: RESULTS_CSS }} />
      <h1 className="vr-title">Halaverga vote privacy</h1>
      <p>{PRIVACY_FULL}</p>
      <p><a href="/">Back to the game</a></p>
    </main>
  );
}
