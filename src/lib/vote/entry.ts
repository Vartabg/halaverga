// One stored vote: an 18-character string, the value of the vote hash field named by the nonce (spec section 4). Pure, shared by
// the handler, the reader, the audit and the tests. hour(10) device(1) favorite(1) mask(2) last(1) tag(3), all lowercase hex or
// digits. The indexes are positions in controlsFor(device), so the registry order is frozen per round (a test pins it).
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { VOTE_MIN_TRIED, type VotePayload, type VoteDevice } from './ballot';

export interface DecodedEntry { hour: string; device: VoteDevice; favorite: ControlId | null; tried: ControlId[]; last: ControlId; tag: string }
const DEVICE_CHAR: Record<VoteDevice, string> = { touch: 't', desktop: 'd' };
const HOUR_RE = /^\d{10}$/, TAG_RE = /^[0-9a-f]{3}$/, MASK_RE = /^[0-9a-f]{2}$/, DIGIT_RE = /^[0-9a-f]$/;
const ids = (device: VoteDevice): ControlId[] => controlsFor(device).map(c => c.id);

/** True for a real UTC hour, 'YYYYMMDDHH' (month 13, day 31 of April or hour 24 are not). */
function realHour(h: string): boolean {
  const [y, mo, d, hr] = [+h.slice(0, 4), +h.slice(4, 6), +h.slice(6, 8), +h.slice(8, 10)];
  const t = new Date(Date.UTC(y, mo - 1, d, hr));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === hr;
}

/** Encode a checked vote. Throws on anything that could not decode (a bad hour or tag, an id outside the family). */
export function encodeEntry(vote: Pick<VotePayload, 'device' | 'favorite' | 'last'> & { tried: readonly ControlId[] }, hour: string, group: string): string {
  const list = ids(vote.device);
  const at = (id: ControlId) => { const i = list.indexOf(id); if (i < 0) throw new Error('vote entry: id outside the family'); return i; };
  if (!HOUR_RE.test(hour) || !realHour(hour) || !TAG_RE.test(group)) throw new Error('vote entry: bad hour or group');
  const mask = vote.tried.reduce((m, id) => m | (1 << at(id)), 0);
  const fav = vote.favorite === 'tie' ? 'x' : at(vote.favorite).toString(16);
  return hour + DEVICE_CHAR[vote.device] + fav + mask.toString(16).padStart(2, '0') + at(vote.last).toString(16) + group;
}

/** Decode a stored entry, or null for anything malformed. The reader skips nulls, so a botched manual edit is never rendered. */
export function decodeEntry(s: unknown): DecodedEntry | null {
  if (typeof s !== 'string' || s.length !== 18) return null;
  const hour = s.slice(0, 10), d = s[10], f = s[11], mm = s.slice(12, 14), l = s[14], tag = s.slice(15);
  if (!HOUR_RE.test(hour) || !realHour(hour) || !MASK_RE.test(mm) || !TAG_RE.test(tag)) return null;
  const device: VoteDevice | null = d === 't' ? 'touch' : d === 'd' ? 'desktop' : null;
  if (!device || !DIGIT_RE.test(l)) return null;
  const list = ids(device), mask = parseInt(mm, 16);
  if (mask >> list.length !== 0) return null;
  const tried = list.filter((_, i) => mask & (1 << i));
  if (tried.length < VOTE_MIN_TRIED) return null;
  const last = list[parseInt(l, 16)];
  if (!last || !tried.includes(last)) return null;
  let favorite: ControlId | null = null;
  if (f !== 'x') {
    if (!DIGIT_RE.test(f)) return null;
    favorite = list[parseInt(f, 16)] ?? null;
    if (!favorite || !tried.includes(favorite)) return null;
  }
  return { hour, device, favorite, tried, last, tag };
}
