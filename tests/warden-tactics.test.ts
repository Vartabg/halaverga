import { expect, it } from 'vitest';
import { createWardens, resetWardens } from '../src/game/wardenState';
import { chooseWardenMove } from '../src/game/wardenTactics';
import { WA } from '../src/game/banishState';
it.each([5, 7])('teaches two different attacks for warden%s, then varies a reproducible bag without three repeats', i => {
  const run = () => { const w = createWardens(); return Array.from({ length: 32 }, () => chooseWardenMove(w, i, 8, 2)); };
  const moves = run(); expect(moves).toEqual(run()); expect(moves[0]).not.toBe(moves[1]); expect(new Set(moves).size).toBe(2);
  for (let n = 2; n < moves.length; n++) expect(moves.slice(n - 2, n + 1).every(m => m === moves[n])).toBe(false);
  expect(moves.some((m, n) => n > 1 && m === moves[n - 1])).toBe(true); // Not a memorized ABAB loop.
});
it('never chooses a short cleave at long range; closing restores the alternate', () => {
  const w = createWardens(); for (let n = 0; n < 8; n++) expect(chooseWardenMove(w, 5, 35, 1)).toBe(WA.rush);
  expect(chooseWardenMove(w, 5, 6, 1)).toBe(WA.sweep);
});
it('distance and the previous successful defense alter eligible later choices', () => {
  let distanceChanges = 0, defenseChanges = 0;
  for (let n = 0; n < 80; n++) {
    const choose = (i: number, d: number, defense: number) => { const w = createWardens(); w.turns[i] = 4; w.seed[i] = n * 982451653; w.defense[i] = defense; return chooseWardenMove(w, i, d, 1); };
    distanceChanges += Number(choose(5, 5, 1) !== choose(5, 12, 1));
    defenseChanges += Number(choose(7, 12, 1) !== choose(7, 12, 2));
  }
  expect(distanceChanges).toBeGreaterThan(8); expect(defenseChanges).toBeGreaterThan(8);
});
it('escalates after damage or repeated exchanges without shortening away the tell, and resets the fight memory', () => {
  const w = createWardens(); chooseWardenMove(w, 5, 8, 2); const firstTell = w.tell[5];
  chooseWardenMove(w, 5, 8, 1); expect(w.fierce[5]).toBe(1); expect(w.tell[5]).toBeGreaterThanOrEqual(1.1);
  chooseWardenMove(w, 7, 15, 2); chooseWardenMove(w, 7, 15, 2); chooseWardenMove(w, 7, 15, 2); expect(w.fierce[7]).toBe(1);
  resetWardens(w); expect(w.turns.every(n => n === 0)).toBe(true); expect(w.defense.every(n => n === 0)).toBe(true);
  expect(chooseWardenMove(w, 5, 8, 2)).toBe(WA.rush); expect(w.tell[5]).toBe(firstTell);
});
