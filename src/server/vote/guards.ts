// Request guards for POST /api/vote (spec 2.2, 2.3): the CSRF origin rule, a body reader with a byte cap and a deadline, and the
// one refusal shape. Nothing here echoes input.
import { VOTE_MAX_BYTES } from '@/lib/vote/ballot';

export const BODY_DEADLINE_MS = 2000;
const first = (h: string | null) => (h ? h.split(',')[0].trim() : '');

/**
 * Cross-site requests are refused: Sec-Fetch-Site present and not same-origin, or an Origin whose host is not this request's host
 * (the forwarded host counts behind a proxy). A missing Origin and Sec-Fetch-Site pass (curl): this is CSRF protection, not
 * anti-bot (W7).
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  const hosts = [first(req.headers.get('x-forwarded-host')), first(req.headers.get('host'))].map(h => h.toLowerCase());
  return hosts.some(h => h !== '' && h === host);
}

export type BodyRead = { ok: true; text: string } | { ok: false; status: 400 | 408 | 413; error: string };
const fail = (status: 400 | 408 | 413, error: string): BodyRead => ({ ok: false, status, error });

/**
 * Read the body as UTF-8 text. 413 over `max` bytes (a declared length over it is refused unread; a stream is cancelled the moment
 * it passes it, never buffered whole), 408 when it is not complete within `deadlineMs` (the reader is cancelled), 400 for invalid
 * UTF-8 or a stream error. A byte order mark is kept in the text, so the JSON parse rejects it.
 */
export async function readBody(req: Request, max = VOTE_MAX_BYTES, deadlineMs = BODY_DEADLINE_MS): Promise<BodyRead> {
  if (Number(req.headers.get('content-length')) > max) return fail(413, 'too-large');
  if (!req.body) return { ok: true, text: '' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>(resolve => { timer = setTimeout(() => resolve('late'), deadlineMs); });
  const stop = () => { void reader.cancel().catch(() => {}); };
  try {
    for (;;) {
      const r = await Promise.race([reader.read(), late]);
      if (r === 'late') { stop(); return fail(408, 'slow'); }
      if (r.done) break;
      size += r.value.byteLength;
      if (size > max) { stop(); return fail(413, 'too-large'); }
      chunks.push(r.value);
    }
  } catch { return fail(400, 'bad-vote'); } finally { clearTimeout(timer); }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  try { return { ok: true, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(all) }; } catch { return fail(400, 'bad-vote'); }
}

/** A refusal: JSON `{ok:false,error}`, never cached, echoing nothing. `extra` adds headers such as Retry-After. */
export function refuse(status: number, error: string, extra: Record<string, string> = {}): Response {
  return Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}
