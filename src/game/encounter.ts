// Original encounter fiction. Lesser demons keep the fast chain; wardens answer two armor breaks before the finishing blow.
export const ELITES = [5, 7] as const;
export const isElite = (i: number) => i === 5 || i === 7;
export const armorFor = (i: number) => isElite(i) ? 2 : 0;
export const ELITE = { reaction: .45, exchange: 1.6, bind: .65, cast: 2.4 } as const;
export const castDuration = (i: number) => isElite(i) ? ELITE.cast : 1.1;
export const bindDuration = (i: number) => isElite(i) ? ELITE.bind : .18;
