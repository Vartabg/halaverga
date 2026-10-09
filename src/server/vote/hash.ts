// A scrambled, per-day form of the caller's network address, used only as a rate-limit key that expires within the hour.
// The raw address is never stored or logged. The UTC date in the message means the same address maps to a new key daily.
import { createHmac } from 'node:crypto';

export const utcDate = (now: number) => new Date(now).toISOString().slice(0, 10);

const HEX = /^[0-9a-f]{1,4}$/, V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const v4Ok = (m: RegExpMatchArray | null) => !!m && m.slice(1).every((n) => Number(n) <= 255);

/**
 * The network a rate-limit key stands for. IPv4 as is; IPv6 cut to its /64 (review 2026-09-25: a home or VPS user holds a whole
 * /64, so keying on the full address let one person send every request from a fresh key and fill the global cap alone). An
 * IPv4-mapped IPv6 address (::ffff:a.b.c.d) is its IPv4 address. Brackets and a zone (%eth0) are dropped; anything unparseable is
 * used as given, lowercased.
 */
export function ipNetwork(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!ip.includes(':')) return ip;
  const halves = ip.split('::');
  if (halves.length > 2) return ip;
  const part = (s: string) => (s ? s.split(':') : []);
  let head = part(halves[0]), tail = halves.length === 2 ? part(halves[1]) : [];
  // An embedded IPv4 tail (::ffff:1.2.3.4 or 64:ff9b::1.2.3.4) becomes two groups.
  const last = (tail.length ? tail : head).at(-1) ?? '', v4 = last.match(V4);
  if (v4) {
    if (!v4Ok(v4)) return ip;
    const groups = [((+v4[1] << 8) | +v4[2]).toString(16), ((+v4[3] << 8) | +v4[4]).toString(16)];
    if (tail.length) tail = [...tail.slice(0, -1), ...groups]; else head = [...head.slice(0, -1), ...groups];
  }
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return ip;
  const g = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (!g.every((h) => HEX.test(h))) return ip;
  const n = g.map((h) => parseInt(h, 16));
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff) return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  return `${n.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** HMAC-SHA256(salt, network + '|' + UTC date) as hex, first 24 characters. The network is ipNetwork(ip). */
export function ipKey(ip: string, salt: string, now: number): string {
  return createHmac('sha256', salt).update(`${ipNetwork(ip)}|${utcDate(now)}`).digest('hex').slice(0, 24);
}
