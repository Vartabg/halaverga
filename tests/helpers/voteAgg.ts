import { controlsFor, type ControlId } from '@/game/controlTypes';
import { MIN_PUBLIC_TAGS, type VoteDevice } from '@/lib/vote/ballot';
import { encodeEntry } from '@/lib/vote/entry';
import { tally, type ExactResults, type TallyOpts } from '@/server/vote/aggregate';

// Shared by the aggregate tests: build ballots as entries, group them by network tag, read a control's row.
export const NOW = Date.UTC(2026, 8, 30, 14, 5, 12);
export const D = '20260930', H1 = '2026093014', H2 = '2026093015';
export const OPTS = { cap: 5, minVotes: 30 };
export const ids = (d: VoteDevice) => controlsFor(d).map(c => c.id);
export const tag = (i: number) => (0x100 + i).toString(16); // 3 hex characters for 0..3839
let seq = 0;
export const nonce = () => (++seq).toString(16).padStart(32, '0');
export interface B { favorite: ControlId | 'tie'; tried: ControlId[]; tag: string; device?: VoteDevice; hour?: string; last?: ControlId }
export const pairOf = (b: B): [string, string] => [nonce(), encodeEntry({ device: b.device ?? 'desktop', favorite: b.favorite, tried: b.tried, last: b.last ?? b.tried[0] }, b.hour ?? H1, b.tag)];
export const flat = (bs: B[]) => bs.flatMap(pairOf);
/** The exact tally (what the public numbers are cut down from; the published shape is tested through aggregate itself). */
// favCap defaults to cap here: these fixtures test the cap arithmetic on its own. The R1 tests pass their own favCap or use `aggR`.
export const agg = (bs: B[], voids: unknown = [], opts: TallyOpts = OPTS, open = true) => tally(flat(bs), voids, { favCap: opts.cap, ...opts }, NOW, open);
/** The production reading: favCap left to its default, groupFavCap(cap). */
export const aggR = (bs: B[], voids: unknown = [], opts: TallyOpts = OPTS, open = true) => tally(flat(bs), voids, opts, NOW, open);
/** `n` ballots, each in its own network group (tags start at `from`). */
export const spread = (n: number, mk: (i: number) => Omit<B, 'tag'>, from = 0): B[] => Array.from({ length: n }, (_, i) => ({ ...mk(i), tag: tag(from + i) }));
export const desk = (r: ExactResults) => r.families.desktop;
export const ctl = (r: ExactResults, id: string, d: VoteDevice = 'desktop') => r.families[d].controls![id];
export const FILL: Omit<B, 'tag'> = { favorite: 'flow', tried: ['flow', 'captured'] };
/** 12 filler groups of one flow-over-captured ballot each: they make a family ranked without touching other controls. */
export const fillers = (from = 200) => spread(MIN_PUBLIC_TAGS, () => FILL, from);
export const min = { cap: 5, minVotes: 10 };
export const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
