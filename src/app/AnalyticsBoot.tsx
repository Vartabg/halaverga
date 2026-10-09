// Server component: puts the anonymous-counts boot script on the game page, on Vercel builds only (the vendor script exists nowhere
// else, so a local build would only log a 404). Not in the root layout on purpose: /privacy and /results stay free of any script.
import { TRACK_BOOT } from '@/lib/trackBoot';

export default function AnalyticsBoot() {
  return process.env.VERCEL ? <script dangerouslySetInnerHTML={{ __html: TRACK_BOOT }} /> : null;
}
