// Which address a vote is limited by (spec 3.1). Only on Vercel, and only the platform's own header: the last entry of
// x-vercel-forwarded-for is the hop closest to us. x-forwarded-for, forwarded and x-real-ip are never read (F6: x-real-ip is a plain
// request header anywhere that is not Vercel, so a fallback to it is a spoof path), so a caller cannot pick its own key: a request
// without the platform header shares the one 'none' key. Anywhere else (dev, next start, another host) every caller is the one fixed
// string 'local', so spoofing gains nothing and a self-hosted copy fails closed.
export function clientAddress(headers: Headers, onVercel: boolean): string {
  if (!onVercel) return 'local';
  return (headers.get('x-vercel-forwarded-for') ?? '').split(',').at(-1)!.trim() || 'none';
}
