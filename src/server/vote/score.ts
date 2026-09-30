// The arithmetic of the tally (spec 5.1). Pure. Every ballot weighs the same, whatever its unverifiable `tried` list claims.
import type { ControlId } from '@/game/controlTypes';

/**
 * Points one ballot with `k` tried controls hands out, per pair. A pick beats each of its k-1 rivals: the favorite gains `win` and
 * each rival `loss` (`pair` = k-1 rivals). A tie splits over all k(k-1)/2 pairs: in each pair both controls gain `win` and `loss`
 * (`pair` = k(k-1)/2). Either way a ballot hands out exactly 1 win-point and 1 loss-point in total: pair * win, or 2 * pair * win.
 */
export function pairWeights(k: number, tie: boolean): { win: number; loss: number; pair: number } {
  if (!(k >= 2)) return { win: 0, loss: 0, pair: 0 };
  return tie ? { win: 1 / (k * (k - 1)), loss: 1 / (k * (k - 1)), pair: (k * (k - 1)) / 2 } : { win: 1 / (k - 1), loss: 1 / (k - 1), pair: k - 1 };
}

/** Comparison points a control is shrunk toward an even record by: a lucky handful cannot look like a proven favorite (R1). */
export const RANK_SHRINK = 24;
/** A control can lead the order only with this many comparison points from this many distinct network groups (R1), and from at least a tenth of all the groups of its family: the fixed six is what a handful of fresh blocks costs, the tenth grows with the honest poll. */
export const LEAD_MIN_POINTS = 15;
export const LEAD_MIN_GROUPS = 6;
export const leadGroups = (allGroups: number): number => Math.max(LEAD_MIN_GROUPS, Math.ceil(allGroups / 10));

/**
 * The most the ballots of one network group that name the same favorite weigh between them: two fifths of the group cap (2 at the
 * default 5, at least 1). Honest ballots in a block name different favorites; a block whose ballots all name one control is the
 * shape of stuffing, so it counts for 2 votes for that control, not 5 (R1). A tie ballot names none and is not affected.
 */
export const groupFavCap = (cap: number): number => Math.max(1, Math.ceil((cap * 2) / 5));

/** Shrunk win rate (wins + m/2) / (wins + losses + m): 5 wins and 0 losses is 0.59, 50 and 0 is 0.84. 0 with no comparisons, so a control nobody met is last. */
export function shrunkRate(wins: number, losses: number, m = RANK_SHRINK): number {
  const n = wins + losses;
  return n > 0 && m >= 0 ? (wins + m / 2) / (n + m) : 0;
}

const micro = (x: number) => Math.round(x * 1e6);
export interface RankRow { wins: number; losses: number; groups: number }
/**
 * Ranking order (R1): controls that may lead (LEAD_MIN_POINTS comparison points from leadGroups(allGroups) groups that gave them wins)
 * first, then the rest; inside each part by shrunk rate descending, ties by comparison points descending, then registry order. A
 * few networks that all name one control cannot take first place, and a control with a short record cannot jump on a streak.
 * Comparisons run on values rounded to 1e-6, so float noise never reorders.
 */
export function rankOrder(rows: Record<string, RankRow>, registry: readonly ControlId[], allGroups = 0): ControlId[] {
  const need = leadGroups(allGroups);
  const key = (id: ControlId) => {
    const r = rows[id] ?? { wins: 0, losses: 0, groups: 0 }, n = r.wins + r.losses;
    return { lead: n >= LEAD_MIN_POINTS && r.groups >= need ? 1 : 0, w: micro(shrunkRate(r.wins, r.losses)), n: micro(n) };
  };
  const keys = new Map(registry.map(id => [id, key(id)]));
  return [...registry].sort((a, b) => {
    const x = keys.get(a)!, y = keys.get(b)!;
    return y.lead - x.lead || y.w - x.w || y.n - x.n || registry.indexOf(a) - registry.indexOf(b);
  });
}

/** One decimal, half up, on the value rounded to 1e-6 first. */
export const round1 = (x: number): number => Math.round(micro(x) / 1e5) / 10;
/** Down to a multiple of 5. Rounded to 1e-6 first, so 4.9999999 from scaled sums is 5. */
export const roundDown5 = (x: number): number => Math.floor(micro(x) / 5e6) * 5;
