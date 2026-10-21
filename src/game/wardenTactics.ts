import { WA, WARDEN } from './banishState';
import type { Wardens } from './wardenState';
export const CLEAVE = { range: 14, tell: 1.3, duration: .25, cosine: .35 } as const;
export const FAN = { tell: 1.6, gap: 3.8, retreat: 8 } as const;
/** Teach the signature, answer with the other move, then use a reproducible weighted bag. Never three repeats. */
export function chooseWardenMove(w: Wardens, i: number, distance: number, armor: number) {
  const first = i === 5 ? WA.rush : WA.volley, second = i === 5 ? WA.sweep : WA.fan;
  const previous = w.move[i], turn = w.turns[i];
  w.fierce[i] = Number(armor < 2 || turn >= 2);
  w.seed[i] = (Math.imul(w.seed[i], 1664525) + 1013904223) >>> 0;
  const choice = w.seed[i] / 4294967296;
  const weight = i === 5 ? (distance < 8 ? .75 : .45) + (w.defense[i] === 1 ? .15 : -.1)
    : .5 + (w.defense[i] === 2 ? .2 : -.1);
  let move: number = !turn ? first : turn === 1 ? second : choice < weight ? second : first;
  if (turn > 1 && w.streak[i] >= 2) move = previous === first ? second : first;
  // A cleave cannot reach across the arena. Re-entering close range makes it eligible again.
  if (i === 5 && distance > CLEAVE.range - 1) move = first;
  w.streak[i] = previous === move ? w.streak[i] + 1 : 1;
  w.move[i] = move; w.turns[i]++;
  const base = move === WA.rush ? WARDEN.rushTell : move === WA.volley ? WARDEN.volleyTell : move === WA.sweep ? CLEAVE.tell : FAN.tell;
  w.tell[i] = base - (w.fierce[i] ? .15 : 0);
  return move;
}
