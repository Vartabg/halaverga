// The results reader's maths (spec 5.1), pure: entries and void members in, VoteResults out. Nothing is trusted from the store
// beyond decodeEntry, and nothing depends on limits other than cap and minv, so turning unit, block, global or max can never change
// a published number. tally() is the exact arithmetic; aggregate() publishes it with every count-like number rounded down to a
// multiple of 5 and no wins or losses, so the public JSON never re-adds to the exact number of ballots (R2).
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { MIN_PUBLIC_TAGS, VOTE_ROUND, VOTE_SCHEMA, VOTE_DEVICES, type ControlResult, type FamilyResults, type VoteDevice, type VoteResults } from '@/lib/vote/ballot';
import { decodeEntry, type DecodedEntry } from '@/lib/vote/entry';
import { CAP_DEFAULT, MINV_DEFAULT } from './limits';
import { groupFavCap, pairWeights, rankOrder, round1, roundDown5 } from './score';

/** HGETALL reply to [field, value] pairs: Upstash's flat array, or the object form. Anything else is empty. */
export function hashToPairs(raw: unknown): [string, string][] {
  if (Array.isArray(raw)) {
    const out: [string, string][] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) if (typeof raw[i] === 'string' && typeof raw[i + 1] === 'string') out.push([raw[i], raw[i + 1]]);
    return out;
  }
  if (typeof raw === 'object' && raw !== null) return Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string');
  return [];
}

const HOUR_VOID = /^\d{10}$/, GROUP_VOID = /^T:(\d{8}|\d{10}):([0-9a-f]{3})$/;
/** SMEMBERS of the void set. `H` voids an hour, `T:<D>:<g>` a network group for a day, `T:<H>:<g>` for an hour (kept as `D:g` and
 *  `H:g`). Malformed members are ignored. */
export function parseVoid(members: unknown): { hours: Set<string>; groups: Set<string> } {
  const hours = new Set<string>(), groups = new Set<string>();
  for (const m of Array.isArray(members) ? members : []) {
    if (typeof m !== 'string') continue;
    const g = GROUP_VOID.exec(m);
    if (HOUR_VOID.test(m)) hours.add(m);
    else if (g) groups.add(`${g[1]}:${g[2]}`);
  }
  return { hours, groups };
}

/** The exact tally: what the maths gives before publishing hides the low digits. */
export interface ExactControl extends ControlResult { wins: number; losses: number }
export interface ExactFamily extends Omit<FamilyResults, 'controls'> { controls: Record<string, ExactControl> | null }
export interface ExactResults extends Omit<VoteResults, 'families'> { families: Record<VoteDevice, ExactFamily> }

const zero = () => ({ picked: 0, tried: 0, wins: 0, losses: 0, rate: null as number | null, tie: 0 });
const micro = (x: number) => Math.round(x * 1e6) / 1e6;

/** `favCap` (optional) is the most one group's ballots naming the same favorite weigh together; it defaults to groupFavCap(cap) (R1). */
export interface TallyOpts { cap: number; minVotes: number; favCap?: number }

export function tally(entries: unknown, voidMembers: unknown, opts: TallyOpts, now: number, open: boolean): ExactResults {
  const cap = Number.isFinite(opts.cap) && opts.cap > 0 ? opts.cap : CAP_DEFAULT;
  const minVotes = Number.isFinite(opts.minVotes) && opts.minVotes >= 0 ? opts.minVotes : MINV_DEFAULT;
  const favCap = opts.favCap !== undefined && Number.isFinite(opts.favCap) && opts.favCap > 0 ? opts.favCap : groupFavCap(cap);
  const { hours, groups: voided } = parseVoid(voidMembers);
  // Group the kept entries by (day, network group, family): the scale of a group is min(1, cap / n).
  const byGroup = new Map<string, { nonce: string; e: DecodedEntry }[]>();
  for (const [nonce, value] of hashToPairs(entries)) {
    const e = decodeEntry(value);
    if (!e || hours.has(e.hour) || voided.has(`${e.hour.slice(0, 8)}:${e.tag}`) || voided.has(`${e.hour}:${e.tag}`)) continue;
    const key = `${e.hour.slice(0, 8)}|${e.tag}|${e.device}`;
    const list = byGroup.get(key);
    if (list) list.push({ nonce, e }); else byGroup.set(key, [{ nonce, e }]);
  }
  const rows: Record<VoteDevice, Record<string, ReturnType<typeof zero>>> = { touch: {}, desktop: {} };
  const votes = { touch: 0, desktop: 0 }, tie = { touch: 0, desktop: 0 }, nGroups = { touch: 0, desktop: 0 };
  // The groups that gave each control at least one win-point: a control leads only if enough separate networks back it (R1).
  const backers: Record<VoteDevice, Record<string, Set<string>>> = { touch: {}, desktop: {} };
  for (const d of VOTE_DEVICES) for (const c of controlsFor(d)) { rows[d][c.id] = zero(); backers[d][c.id] = new Set(); }
  for (const key of [...byGroup.keys()].sort()) {
    const list = byGroup.get(key)!.sort((a, b) => (a.nonce < b.nonce ? -1 : a.nonce > b.nonce ? 1 : 0));
    const scale = Math.min(1, cap / list.length), device = list[0].e.device, r = rows[device];
    const named = new Map<string, number>(); // ballots per favorite in this group: they share groupFavCap between them (R1)
    for (const { e } of list) if (e.favorite !== null) named.set(e.favorite, (named.get(e.favorite) ?? 0) + 1);
    nGroups[device]++;
    for (const { e } of list) {
      const k = e.tried.length, w = pairWeights(k, e.favorite === null);
      const s = e.favorite === null ? scale : Math.min(scale, favCap / named.get(e.favorite)!);
      votes[device] += s;
      for (const t of e.tried) r[t].tried += s;
      if (e.favorite !== null) {
        const f = e.favorite;
        r[f].picked += s;
        for (const t of e.tried) if (t !== f) { r[f].wins += s * w.win; r[t].losses += s * w.loss; }
        backers[device][f].add(key);
      } else {
        tie[device] += s;
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
          const a = e.tried[i], b = e.tried[j];
          r[a].wins += s * w.win; r[b].wins += s * w.win; r[a].losses += s * w.loss; r[b].losses += s * w.loss;
        }
        for (const t of e.tried) backers[device][t].add(key);
      }
    }
  }
  const families = {} as Record<VoteDevice, ExactFamily>;
  for (const d of VOTE_DEVICES) {
    const registry = controlsFor(d).map(c => c.id) as ControlId[];
    const ranked = micro(votes[d]) >= minVotes && nGroups[d] >= MIN_PUBLIC_TAGS;
    const controls: Record<string, ExactControl> = {}, rank: Record<string, { wins: number; losses: number; groups: number }> = {};
    for (const id of registry) {
      const { picked, tried, wins, losses } = rows[d][id], n = wins + losses;
      controls[id] = { picked: Math.round(micro(picked)), tried: Math.round(micro(tried)), wins: round1(wins), losses: round1(losses), rate: n > 0 ? Math.round((100 * wins) / n) : null };
      rank[id] = { wins, losses, groups: backers[d][id].size };
    }
    families[d] = { votes: roundDown5(votes[d]), ranked, tie: ranked ? Math.round(micro(tie[d])) : null, order: ranked ? rankOrder(rank, registry, nGroups[d]) : null, controls: ranked ? controls : null };
  }
  return { v: VOTE_SCHEMA, round: VOTE_ROUND, asOf: new Date(now).toISOString().slice(0, 19) + 'Z', open, families };
}

/** The public numbers: picked, tried and the tie count down to a multiple of 5, no wins or losses, the rate and the order as they are. */
export function aggregate(entries: unknown, voidMembers: unknown, opts: TallyOpts, now: number, open: boolean): VoteResults {
  const t = tally(entries, voidMembers, opts, now, open), families = {} as Record<VoteDevice, FamilyResults>;
  for (const d of VOTE_DEVICES) {
    const f = t.families[d], controls: Record<string, ControlResult> | null = f.controls && {};
    if (controls && f.controls) for (const [id, c] of Object.entries(f.controls)) controls[id] = { picked: roundDown5(c.picked), tried: roundDown5(c.tried), rate: c.rate };
    families[d] = { ...f, tie: f.tie === null ? null : roundDown5(f.tie), controls };
  }
  return { ...t, families };
}
