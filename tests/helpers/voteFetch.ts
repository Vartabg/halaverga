import type { VoteStorage } from '@/ui/vote/voteTracker';

export function memory(): VoteStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
export type Step = number | 'throw' | 'hang';
export function fakeFetch(steps: Step[], onCall?: () => void) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (url: string, init?: RequestInit) => {
    calls.push({ url, init }); onCall?.();
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    if (step === 'hang') return new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return Promise.resolve({ status: step, json: async () => ({ ok: step === 200 }) });
  };
  return { f, calls };
}
export const bodies = (calls: { init?: RequestInit }[]) => calls.map(c => String(c.init?.body));
