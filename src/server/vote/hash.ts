// A scrambled, per-day form of the caller's network address, used only as a rate-limit key that expires within the hour.
// The raw address is never stored or logged. The UTC date in the message means the same address maps to a new key daily.
import { createHmac } from 'node:crypto';

export const utcDate = (now: number) => new Date(now).toISOString().slice(0, 10);

/** HMAC-SHA256(salt, ip + '|' + UTC date) as hex, first 24 characters. */
export function ipKey(ip: string, salt: string, now: number): string {
  return createHmac('sha256', salt).update(`${ip}|${utcDate(now)}`).digest('hex').slice(0, 24);
}
