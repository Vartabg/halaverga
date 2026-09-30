// The owner's console for a Neon deployment (spec-neon 4.7): each runbook line as the Redis command it replaces and the SQL to paste
// into the Neon SQL editor. Nothing in the app imports this file and nothing runs these statements: they are text for docs/vote-runbook.md,
// and tests/pg proves each one against a real Postgres next to the Redis command. The namespace is checked, so the text can never
// carry anything but the fixed words below.
import { VOTE_KEY_TAG } from '@/lib/vote/ballot';

export interface RunbookItem { id: string; title: string; redis: string; sql: string }

const upsert = (key: string, pairs: [string, string][]) =>
  `INSERT INTO public.hv_hash (k, field, value) VALUES ${pairs.map(([f, v]) => `('${key}','${f}','${v}')`).join(',')} ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;`;
const flat = (pairs: [string, string][]) => pairs.map((p) => p.join(' ')).join(' ');

/** `ns` is `hv:<VERCEL_ENV>`; `hv:production` is the live namespace. Throws on anything else. */
export function runbook(ns = 'hv:production', day = '20260930', hour = '2026093014', group = 'a3f'): RunbookItem[] {
  if (!/^hv:[a-z]{1,20}$/.test(ns) || !/^\d{8}$/.test(day) || !/^\d{10}$/.test(hour) || !/^[0-9a-f]{3}$/.test(group)) throw new Error('runbook: bad namespace, day, hour or group');
  const ctl = `${ns}:ctl`, votes = `${ns}:vote:${VOTE_KEY_TAG}`, voids = `${ns}:void:${VOTE_KEY_TAG}`, member = `T:${day}:${group}`;
  const set = (pairs: [string, string][]) => ({ redis: `HSET ${ctl} ${flat(pairs)}`, sql: upsert(ctl, pairs) });
  const shield: [string, string][] = [['unit', '4'], ['block', '10'], ['global', '300'], ['cap', '3']];
  const shareDay: [string, string][] = [['unit', '20'], ['block', '200'], ['global', '3000'], ['cap', '40'], ['max', '12000'], ['round', '50']];
  const gone = ['unit', 'block', 'global', 'cap', 'max', 'round'];
  return [
    { id: 'close', title: 'Kill switch: close the vote', ...set([['mode', 'closed']]) },
    { id: 'reopen', title: 'Reopen the vote', redis: `HDEL ${ctl} mode`, sql: `DELETE FROM public.hv_hash WHERE k = '${ctl}' AND field = 'mode';` },
    { id: 'shield', title: 'Shield: tighter limits for a scare', ...set(shield) },
    { id: 'share-day', title: 'Share day: wider limits', ...set(shareDay) },
    { id: 'cap', title: 'Change the per-group cap on counted votes', ...set([['cap', '3']]) },
    { id: 'minv', title: 'Change the votes needed before a ranking shows', ...set([['minv', '200']]) },
    { id: 'max', title: 'Change the ceiling on stored votes', ...set([['max', '12000']]) },
    { id: 'clear-knobs', title: 'Put the limits back to their defaults', redis: `HDEL ${ctl} ${gone.join(' ')}`, sql: `DELETE FROM public.hv_hash WHERE k = '${ctl}' AND field IN (${gone.map((f) => `'${f}'`).join(',')});` },
    { id: 'show-knobs', title: 'Show the knobs', redis: `HGETALL ${ctl}`, sql: `SELECT field, value FROM public.hv_hash WHERE k = '${ctl}' ORDER BY field;` },
    { id: 'void-group', title: 'Void one network group for a day', redis: `SADD ${voids} ${member}`, sql: `INSERT INTO public.hv_set (k, member) VALUES ('${voids}','${member}') ON CONFLICT DO NOTHING;` },
    { id: 'void-group-hour', title: 'Void one network group for one hour', redis: `SADD ${voids} T:${hour}:${group}`, sql: `INSERT INTO public.hv_set (k, member) VALUES ('${voids}','T:${hour}:${group}') ON CONFLICT DO NOTHING;` },
    { id: 'void-hour', title: 'Void a whole hour', redis: `SADD ${voids} ${hour}`, sql: `INSERT INTO public.hv_set (k, member) VALUES ('${voids}','${hour}') ON CONFLICT DO NOTHING;` },
    { id: 'unvoid', title: 'Un-void a group', redis: `SREM ${voids} ${member}`, sql: `DELETE FROM public.hv_set WHERE k = '${voids}' AND member = '${member}';` },
    { id: 'list-voids', title: 'List the voids', redis: `SMEMBERS ${voids}`, sql: `SELECT member FROM public.hv_set WHERE k = '${voids}' ORDER BY member;` },
    { id: 'count', title: 'How many votes are stored', redis: `HLEN ${votes}`, sql: `SELECT count(*) FROM public.hv_hash WHERE k = '${votes}';` },
    { id: 'reset-poll', title: 'Reset the poll (after the launch check)', redis: `DEL ${votes}`, sql: `DELETE FROM public.hv_hash WHERE k = '${votes}';` },
    { id: 'counted-today', title: "Today's counted-request counter", redis: `GET ${ns}:rlg:${day}`, sql: `SELECT v, exp FROM public.hv_kv WHERE k = '${ns}:rlg:' || to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD');` },
    { id: 'audit-day-group', title: 'Audit: votes per day and network group (an entry is 18 characters: hour 1-10, device 11, favorite 12, mask 13-14, last 15, tag 16-18)', redis: '', sql: `SELECT substr(value,1,8) AS day, substr(value,16,3) AS tag, count(*) AS n FROM public.hv_hash WHERE k = '${votes}' GROUP BY 1,2 ORDER BY n DESC, tag LIMIT 20;` },
    { id: 'audit-hour', title: 'Audit: votes per hour', redis: '', sql: `SELECT substr(value,1,10) AS hour, count(*) FROM public.hv_hash WHERE k = '${votes}' GROUP BY 1 ORDER BY 1;` },
  ];
}
