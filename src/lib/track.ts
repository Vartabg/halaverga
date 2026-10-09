// Anonymous funnel counts (docs/voting.md, "Anonymous counts"). Five fixed stage names, each sent at most once per page load as a bare
// Vercel Web Analytics event: no payload, no identifier, nothing the visitor picked. It does nothing on the server or in tests, when the
// browser sends Do Not Track or Global Privacy Control, or when the vendor script's queue function is not on the page (not a Vercel
// build, blocked, or failed to load), and it never throws. trackBoot.ts puts the script on the game page under the same opt-out.
export const STAGES = ['begin', 'scene_ready', 'second_way_20s', 'vote_card_shown', 'vote_sent'] as const;
export type Stage = (typeof STAGES)[number];
type Page = Window & { va?: (command: 'event', event: { name: Stage }) => void; doNotTrack?: string };
type Browser = Navigator & { msDoNotTrack?: string; globalPrivacyControl?: boolean };
const sent = new Set<Stage>();

export function track(stage: Stage): void {
  try {
    if (typeof window === 'undefined' || sent.has(stage) || !STAGES.includes(stage)) return;
    const page = window as Page, browser = navigator as Browser;
    if ([browser.doNotTrack, page.doNotTrack, browser.msDoNotTrack].some(v => v === '1' || v === 'yes') || browser.globalPrivacyControl === true) return;
    if (typeof page.va !== 'function') return;
    sent.add(stage);
    page.va('event', { name: stage });
  } catch { /* a count must never break the game */ }
}
