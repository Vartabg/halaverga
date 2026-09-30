// How a vote is counted, as a static page (spec 1.10): no store call, no vote data, no client JS. The ballot links here in a new tab.
import type { Metadata } from 'next';
import { PRIVACY_FULL } from '@/lib/vote/privacy';
import s from '../results/results.module.css';

export const metadata: Metadata = { title: 'Halaverga vote privacy', robots: { index: false, follow: false } };

export default function PrivacyPage() {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Halaverga vote privacy</h1>
      <p>{PRIVACY_FULL}</p>
      <p><a href="/">Back to the game</a></p>
    </main>
  );
}
