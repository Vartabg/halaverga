// POST /api/vote logic (spec 3.1), kept out of the route file so tests can inject every dependency. Checks run in a fixed
// order: setup, origin, content type, size, shape, the per-IP limit (instance memo, then Upstash), the global hourly limit
// (only for requests that passed the per-IP check), the Send nonce (a retry already counted answers ok), then one write
// transaction. IPv6 callers are limited per /64 (hash.ipNetwork). Nothing here logs or echoes an IP, a body,
// a note, a build or a token.
import { parseVote, mediaType, VOTE_MAX_BYTES, VOTE_ROUND, type VotePayload } from '@/lib/vote/shape';
import { BUILD_STAMP } from '@/ui/buildInfo';
import { ipKey } from './hash';
import { MemoLimit } from './memoLimit';
import { envCredentials, storeFromEnv, type Command, type VoteEnv, type VoteStore } from './store';

export const IP_LIMIT = 20;
export const GLOBAL_LIMIT = 600;
export const NOTE_TTL_S = 7_776_000; // 90 days
export const NOTES_KEEP = 200;
/** How long a Send's nonce is remembered, s: far longer than the client's retry window. */
export const NONCE_TTL_S = 3600;
const HOUR_MS = 3_600_000;

export interface VoteDeps {
  store: VoteStore | null;
  salt: string;
  ns: string;
  serverBuild: string;
  now: () => number;
  memo: MemoLimit;
}

// One memo per server instance, shared across requests.
const instanceMemo = new MemoLimit();

export function depsFromEnv(env: VoteEnv = process.env, fetchImpl?: typeof fetch): VoteDeps {
  const creds = envCredentials(env);
  return {
    store: storeFromEnv(env, fetchImpl),
    salt: env.VOTE_SALT || creds?.token || '',
    ns: `hv:${env.VERCEL_ENV || 'local'}`,
    serverBuild: BUILD_STAMP,
    now: Date.now,
    memo: instanceMemo,
  };
}

const NO_STORE = { 'Cache-Control': 'no-store' };
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: NO_STORE });

const first = (h: string | null) => (h ? h.split(',')[0].trim() : '');

function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  const hosts = [first(req.headers.get('x-forwarded-host')), first(req.headers.get('host'))].map((h) => h.toLowerCase());
  return hosts.some((h) => h !== '' && h === host);
}

/** Read at most `max` bytes of the body; null when it is larger (the stream is cancelled, never buffered whole). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

const clientIp = (req: Request) => first(req.headers.get('x-forwarded-for')) || req.headers.get('x-real-ip')?.trim() || 'unknown';
const stamp = (now: number, len: 8 | 10) => new Date(now).toISOString().replace(/[-T:]/g, '').slice(0, len);

/** SET key 0 EX ttl NX + INCR key in one transaction; returns the count after this request. */
async function bump(store: VoteStore, key: string, ttl: number): Promise<number> {
  const out = await store.exec([['SET', key, 0, 'EX', ttl, 'NX'], ['INCR', key]]);
  return Number(out[1]);
}

export function voteWrites(vote: VotePayload, ns: string, serverBuild: string, now: number): Command[] {
  const h = `${ns}:vote:${VOTE_ROUND}`;
  const cmds: Command[] = [
    ['HINCRBY', h, 'total', 1],
    ['HINCRBY', h, `fav:${vote.favorite}`, 1],
    ['HINCRBY', h, `favdev:${vote.device}:${vote.favorite}`, 1],
    ['HINCRBY', h, `dev:${vote.device}`, 1],
  ];
  for (const id of vote.tried) cmds.push(['HINCRBY', h, `tried:${id}`, 1]);
  for (const [id, r] of Object.entries(vote.ratings)) {
    cmds.push(['HINCRBY', h, `rsum:${id}`, r as number], ['HINCRBY', h, `rn:${id}`, 1]);
  }
  // The client build is only compared, never stored: a mismatch means an old tab voted after a deploy.
  if (vote.build !== serverBuild) cmds.push(['HINCRBY', h, 'stale', 1]);
  cmds.push(['HINCRBY', `${ns}:builds:${VOTE_ROUND}`, serverBuild, 1]);
  if (vote.note) {
    const notes = `${ns}:notes:${VOTE_ROUND}:${stamp(now, 8)}`;
    cmds.push(['HINCRBY', h, 'notes', 1]);
    cmds.push(['LPUSH', notes, JSON.stringify({ favorite: vote.favorite, device: vote.device, note: vote.note })]);
    cmds.push(['LTRIM', notes, 0, NOTES_KEEP - 1], ['EXPIRE', notes, NOTE_TTL_S]);
  }
  return cmds;
}

export async function handleVote(req: Request, deps: VoteDeps): Promise<Response> {
  const { store } = deps;
  if (!store) return fail(503, 'voting-not-set-up');
  if (!sameOrigin(req)) return fail(403, 'cross-site');
  if (mediaType(req.headers.get('content-type')) !== 'application/json') return fail(415, 'json-only');
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > VOTE_MAX_BYTES) return fail(413, 'too-large');
  const text = await readLimited(req, VOTE_MAX_BYTES).catch(() => null);
  if (text === null) return fail(413, 'too-large');
  const parsed = parseVote(text);
  if (!parsed.ok) return parsed.status === 413 ? fail(413, 'too-large') : fail(400, 'bad-vote');

  const now = deps.now();
  const key = ipKey(clientIp(req), deps.salt, now);
  if (deps.memo.over(key, Math.floor(now / HOUR_MS), IP_LIMIT)) return fail(429, 'too-many');
  try {
    if (await bump(store, `${deps.ns}:rl:${key}`, 3600) > IP_LIMIT) return fail(429, 'too-many');
    if (await bump(store, `${deps.ns}:rlg:${stamp(now, 10)}`, 7200) > GLOBAL_LIMIT) return fail(429, 'busy');
    // A retried Send whose first try was already counted (the reply was lost or late) answers ok without counting again.
    const seen = parsed.vote.nonce ? `${deps.ns}:seen:${parsed.vote.nonce}` : null;
    if (seen && (await store.exec([['SET', seen, 1, 'EX', NONCE_TTL_S, 'NX']]))[0] === null) return Response.json({ ok: true }, { headers: NO_STORE });
    try { await store.exec(voteWrites(parsed.vote, deps.ns, deps.serverBuild, now)); } catch (e) {
      if (seen) await store.exec([['DEL', seen]]).catch(() => {}); // not counted: let the retry count it
      throw e;
    }
  } catch {
    console.error('[vote] store request failed');
    return fail(502, 'store-failed');
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
