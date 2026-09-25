// In-game vote: the one shape shared by the client card and the /api/vote server (spec 3.1). Pure: no Node, no DOM, no
// Next imports, so the lazy client chunk can use it too. The server trusts nothing here without parseVote.
export const VOTE_LABS = ['standard', 'draw', 'conduct', 'brush'] as const;
export type VoteLab = (typeof VOTE_LABS)[number];
export type VoteDevice = 'touch' | 'desktop';
export const VOTE_DEVICES: readonly VoteDevice[] = ['touch', 'desktop'];
export type VoteRating = 1 | 2 | 3 | 4 | 5;
// Bump when the controls change meaningfully: a new round starts a fresh tally and lets every device vote again.
export const VOTE_ROUND = 'r1';
export const VOTE_MAX_BYTES = 2048;
export const NOTE_MAX = 280;
const NOTE_RAW_MAX = 400;
const BUILD_MAX = 40;
// Display and tests only. The client build is a hint: any short string is accepted, and a mismatch just counts as stale.
export const BUILD_RE = /^(\d{4}-\d{2}-\d{2} · ([0-9a-f]{7,12}|uncommitted)|local development build)$/;

export interface VotePayload {
  favorite: VoteLab;
  ratings: Partial<Record<VoteLab, VoteRating>>;
  tried: VoteLab[];
  device: VoteDevice;
  build: string;
  note?: string;
  /** One random id per Send (the client's single retry reuses it), so a vote the server counted before the reply was lost is
   *  never counted twice. Checked once, then forgotten; never stored with the vote. */
  nonce?: string;
}
export type VoteParse = { ok: true; vote: VotePayload } | { ok: false; status: 400 | 413 };

export interface VoteResults {
  round: string;
  total: number;
  favorite: Record<VoteLab, number>;
  favoriteByDevice: Record<VoteDevice, Record<VoteLab, number>>;
  rating: Record<VoteLab, { avg: number | null; n: number }>;
  tried: Record<VoteLab, number>;
  device: Record<VoteDevice, number>;
  builds: Record<string, number>;
  notes: number;
  stale: number;
}

const KEYS = new Set(['favorite', 'ratings', 'tried', 'device', 'build', 'note', 'nonce']);
export const NONCE_RE = /^[0-9a-f-]{16,64}$/;
export const isVoteLab = (v: unknown): v is VoteLab => typeof v === 'string' && (VOTE_LABS as readonly string[]).includes(v);
const isDevice = (v: unknown): v is VoteDevice => v === 'touch' || v === 'desktop';
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** UTF-8 byte length without allocating a buffer. */
export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** The lowercase media type before any parameters: 'Application/JSON; charset=utf-8' gives 'application/json'. */
export function mediaType(header: string | null | undefined): string {
  return (header ?? '').split(';')[0].trim().toLowerCase();
}

/** Trim, drop control characters except newline, collapse 3+ newlines to 2, and cap at NOTE_MAX code points. */
export function cleanNote(raw: string): string {
  const s = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const points = Array.from(s);
  return points.length > NOTE_MAX ? points.slice(0, NOTE_MAX).join('').trimEnd() : s;
}

function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function validate(v: unknown): VotePayload | null {
  if (!isPlainObject(v)) return null;
  for (const k of Object.keys(v)) if (!KEYS.has(k)) return null;
  const { favorite, ratings, tried, device, build, note, nonce } = v;
  if (nonce !== undefined && (typeof nonce !== 'string' || !NONCE_RE.test(nonce))) return null;
  if (!isVoteLab(favorite) || !isDevice(device)) return null;
  if (!Array.isArray(tried) || tried.length < 1 || tried.length > VOTE_LABS.length) return null;
  if (!tried.every(isVoteLab) || new Set(tried).size !== tried.length || !tried.includes(favorite)) return null;
  const labs = tried as VoteLab[];
  if (typeof build !== 'string' || build.length > BUILD_MAX) return null;
  if (ratings !== undefined && !isPlainObject(ratings)) return null;
  const out: Partial<Record<VoteLab, VoteRating>> = {};
  for (const [k, r] of Object.entries(ratings ?? {})) {
    if (!isVoteLab(k) || !labs.includes(k)) return null;
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 5) return null;
    out[k] = r as VoteRating;
  }
  const vote: VotePayload = { favorite, ratings: out, tried: [...labs], device, build };
  if (typeof nonce === 'string') vote.nonce = nonce;
  if (note !== undefined) {
    if (typeof note !== 'string' || note.length > NOTE_RAW_MAX * 2 || codePoints(note) > NOTE_RAW_MAX) return null;
    const clean = cleanNote(note);
    if (clean) vote.note = clean;
  }
  return vote;
}

/** Parse a raw request body. Over VOTE_MAX_BYTES gives 413; anything that is not exactly a valid vote gives 400. */
export function parseVote(text: string): VoteParse {
  if (typeof text !== 'string') return { ok: false, status: 400 };
  if (byteLength(text) > VOTE_MAX_BYTES) return { ok: false, status: 413 };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, status: 400 }; }
  const vote = validate(raw);
  return vote ? { ok: true, vote } : { ok: false, status: 400 };
}
