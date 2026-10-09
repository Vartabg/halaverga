// Neon connection string -> the SQL-over-HTTP endpoint (spec-neon 1.1, 2.3). Never throws, never logs, never echoes the string:
// anything unusable is null, and the caller treats null as "no store", so the vote is closed.
// CODE-10: only a Neon host is accepted (*.neon.tech). DATABASE_URL is also what an unrelated Postgres project sets, and its password
// would travel as a header to https://<that host>/sql while the vote created hv_* tables in it. localhost and 127.0.0.1 pass only
// when a test injects allowLocal; nothing in the app ever does.
export interface NeonConn { endpoint: string; connectionString: string }
export interface NeonUrlOptions { allowLocal?: boolean }

const NEON_HOST = /^([a-z0-9-]+\.)+neon\.tech$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function parseNeonUrl(cs: string, opts: NeonUrlOptions = {}): NeonConn | null {
  if (typeof cs !== 'string' || cs.length < 20 || cs.length > 2048 || /[\u0000- \u007f]/.test(cs)) return null;
  let u: URL;
  try { u = new URL(cs); } catch { return null; }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
  if (!u.username || !u.password || !u.hostname || u.pathname.length < 2) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) || !(NEON_HOST.test(host) || (opts.allowLocal === true && LOCAL_HOSTS.includes(host)))) return null;
  // The transport is always https on the host alone (any port in the string is ignored); the full string travels in one header.
  return { endpoint: `https://${host}/sql`, connectionString: cs };
}
