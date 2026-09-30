// Which address a vote is limited by (spec 3.1). Only on Vercel, and only the platform's own headers: the last entry is the hop
// closest to us. x-forwarded-for and forwarded are never read, so a caller cannot pick its own key. Anywhere else (dev, next start,
// another host) every caller is the one fixed string 'local', so spoofing gains nothing and a self-hosted copy fails closed.
export function clientAddress(headers: Headers, onVercel: boolean): string {
  if (!onVercel) return 'local';
  const raw = headers.get('x-vercel-forwarded-for') || headers.get('x-real-ip') || '';
  return raw.split(',').at(-1)!.trim() || 'none';
}
