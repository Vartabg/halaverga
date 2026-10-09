// Network keys and the daily group tag (spec 3.1). A strict parse turns an address into a unit network (IPv4 /32, IPv6 /64) and a
// block network (IPv4 /24, IPv6 /48); anything that does not parse maps to the one shared bucket 'bad', so many spellings of one
// address are one key or 'bad', never many keys. voteKeys keys them with the secret salt and the UTC date: the rate keys are 6 hex
// (24 bits, a leaked key still matches about 256 IPv4 addresses) and the tag kept with every vote is 3 hex (12 bits, about 4,096
// blocks per tag), unlinkable across days. The raw address is never stored or logged.
import { createHmac } from 'node:crypto';
import { VOTE_ROUND } from '@/lib/vote/ballot';
import { utcDate } from './limits';

export interface Networks { unit: string; block: string }
export interface VoteKeys { unit: string; block: string; tag: string; round: string }
const FIXED = new Set(['local', 'none', 'bad']);
const OCTET = '(0|[1-9]\\d{0,2})';
const V4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
const HEX = /^[0-9a-f]{1,4}$/;

function v4Octets(s: string): number[] | null {
  const m = V4.exec(s);
  const o = m ? m.slice(1).map(Number) : null;
  return o && o.every(n => n <= 255) ? o : null;
}

/** Eight 16-bit groups of a strictly written IPv6 address (:: compression and an embedded IPv4 tail allowed), or null. */
function v6Groups(s: string): number[] | null {
  const halves = s.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const part = (p: string) => (p === '' ? [] : p.split(':'));
  const head = part(halves[0]), tail = halves.length === 2 ? part(halves[1]) : [];
  const last = halves.length === 2 ? tail : head, tip = last.at(-1);
  if (tip !== undefined && tip.includes('.')) {
    const o = v4Octets(tip);
    if (!o) return null;
    last.splice(-1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
  }
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  return all.length === 8 && all.every(g => HEX.test(g)) ? all.map(g => parseInt(g, 16)) : null;
}

/** The unit and block network of an address string (already trimmed); 'local', 'none' and 'bad' are their own buckets. */
export function networkOf(raw: string): Networks {
  if (FIXED.has(raw)) return { unit: raw, block: raw };
  const bad = { unit: 'bad', block: 'bad' };
  if (!raw.includes(':')) {
    const o = v4Octets(raw);
    return o ? { unit: `4:${o.join('.')}`, block: `4:${o.slice(0, 3).join('.')}` } : bad;
  }
  const g = v6Groups(raw);
  if (!g) return bad;
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) {
    const o = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    return { unit: `4:${o.join('.')}`, block: `4:${o.slice(0, 3).join('.')}` };
  }
  const h = g.map(x => x.toString(16));
  return { unit: `6:${h.slice(0, 4).join(':')}`, block: `6:${h.slice(0, 3).join(':')}` };
}

/**
 * Keyed, per-day rate keys and group tag: HMAC-SHA256(salt, kind|network|YYYYMMDD) in hex, cut to 6, 6 and 3 characters. `round` is
 * the one key that does not carry the day: HMAC(salt, r|network|round), 6 hex, for a counter that lasts 30 days and stores no vote
 * (a host can send only a few counted ballots per round however many days it waits). Its network is the unit network, the address
 * for IPv4 and the /64 for IPv6 (F2: a /48 key let 10 requests refuse every neighbour of a carrier pool for 30 days, and a shared
 * counter must never be fillable by one host faster than by its neighbours).
 */
export function voteKeys(raw: string, salt: string, now: number): VoteKeys {
  const net = networkOf(raw), day = utcDate(now);
  const mac = (kind: string, network: string, n: number) => createHmac('sha256', salt).update(`${kind}|${network}|${day}`).digest('hex').slice(0, n);
  const round = createHmac('sha256', salt).update(`r|${net.unit}|${VOTE_ROUND}`).digest('hex').slice(0, 6);
  return { unit: mac('u', net.unit, 6), block: mac('b', net.block, 6), tag: mac('g', net.block, 3), round };
}
