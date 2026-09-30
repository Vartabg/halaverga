// Neon connection string -> the SQL-over-HTTP endpoint (spec-neon 1.1, 2.3). Never throws, never logs, never echoes the string:
// anything unusable is null, and the caller treats null as "no store", so the vote is closed.
export interface NeonConn { endpoint: string; connectionString: string }

export function parseNeonUrl(cs: string): NeonConn | null {
  if (typeof cs !== 'string' || cs.length < 20 || cs.length > 2048 || /[\u0000- \u007f]/.test(cs)) return null;
  let u: URL;
  try { u = new URL(cs); } catch { return null; }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
  if (!u.username || !u.password || !u.hostname || u.pathname.length < 2) return null;
  if (!u.hostname.includes('.') || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(u.hostname)) return null;
  // The transport is always https on the host alone (any port in the string is ignored); the full string travels in one header.
  return { endpoint: `https://${u.hostname.toLowerCase()}/sql`, connectionString: cs };
}
