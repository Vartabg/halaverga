// The order check (audit 2026-10-02). A ballot is usually the starting control, flown first, against one control the card suggested,
// flown last, so a pick of the last-flown control may be novelty and a pick of the starting control may be practice. The stored entry
// keeps a tried bitmask and `last`, not the order, so "flown first" is read as the family's default (DEFAULT_CONTROL), the control every
// visitor starts on. Only a pick (not Can't tell) of a ballot that tried the default and flew another control last carries the order.
// It is a published check beside the ranking, never a correction of it: no score reads it. Weights are the tally's own, so a group
// over the cap counts for the cap here too. Its baseline (`even`) is equal liking, not "order did nothing": the two are the same only if
// the starting and the last-flown control are equally liked, so a gap from it is order, liking or both, and nothing here says which.
import { DEFAULT_CONTROL } from '@/game/controlTypes';
import type { LastFlown } from '@/lib/vote/ballot';
import type { DecodedEntry } from '@/lib/vote/entry';

/** Counted picks a ranked family needs before the order check is published: a share is then within about 7 points either way. */
export const LAST_FLOWN_MIN = 200;

export interface OrderAcc { n: number; last: number; first: number; even: number }
export const newOrderAcc = (): OrderAcc => ({ n: 0, last: 0, first: 0, even: 0 });

/** Adds one ballot of weight `s`. A ballot that tried k controls gives each of them a 1/k chance of the pick, the baseline for "if every control tried were liked equally". */
export function addOrder(acc: OrderAcc, e: DecodedEntry, s: number): void {
  const first = DEFAULT_CONTROL[e.device];
  if (e.favorite === null || e.last === first || !e.tried.includes(first)) return;
  acc.n += s;
  acc.even += s / e.tried.length;
  if (e.favorite === e.last) acc.last += s;
  else if (e.favorite === first) acc.first += s;
}

const micro = (x: number) => Math.round(x * 1e6) / 1e6;
/** The check in whole percents, or null while there are fewer than LAST_FLOWN_MIN counted picks. `n` is rounded to a whole number here, down to 5 by aggregate. */
export function orderResult(acc: OrderAcc): LastFlown | null {
  if (micro(acc.n) < LAST_FLOWN_MIN) return null;
  const share = (x: number) => Math.round((100 * x) / acc.n);
  return { n: Math.round(micro(acc.n)), last: share(acc.last), first: share(acc.first), even: share(acc.even) };
}
