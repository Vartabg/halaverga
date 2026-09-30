// The two answers every vote route gives for a method it does not serve. Next auto-implements OPTIONS by listing every exported method
// (P5: seven for /api/vote) and answers an unexported one with a bare 405 (no Allow, no cache header, I2), so each route exports these
// for the methods it refuses. `allow` is the honest list, OPTIONS and HEAD included where they work.
import { refuse } from './guards';

export const notAllowed = (allow: string) => (): Response => refuse(405, 'method', { Allow: allow });
export const optionsOf = (allow: string) => (): Response => new Response(null, { status: 204, headers: { Allow: allow, 'Cache-Control': 'no-store' } });
