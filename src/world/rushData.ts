// What speed looks like (Garo 2026-11-10: "that thrill and rush"). Plain numbers only, so the suit can publish its wingtips and
// the tests can read the curves without a renderer.
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** from / full: the speeds (m/s) between which the air streaks come in. Vapour comes off the wingtips at speed, sooner in a hard
 * bank or a pull-up. tube: the streaks' inner and outer radius around the line of flight, and the length of air they fill (m). */
export const RUSH = { from: 14, full: 62, vapourFrom: 24, vapourFull: 70, streaks: 72, inner: 2.4, outer: 10, tube: 46, life: .42 } as const;
/** 0 to 1: how strongly the air streaks past. Nothing while slow or under reduced motion. */
export const streakStrength = (speed: number, reduced: boolean) => reduced ? 0 : smooth(RUSH.from, RUSH.full, speed);
/** 0 to 1: vapour off the wingtips, from speed and from how hard the angel is turning or pulling (rad/s). */
export const vapourStrength = (speed: number, turn: number, reduced: boolean) =>
  reduced ? 0 : Math.min(1, smooth(RUSH.vapourFrom, RUSH.vapourFull, speed) * (.45 + Math.min(1.2, Math.abs(turn)) * .9));
/** Streak length (m): a streak is the air's travel in about a twentieth of a second, so it reads as motion, not as an object. */
export const streakLength = (speed: number) => 1.2 + speed * .055;
/** The wingtips in the world, published by the suit each frame (Suit.tsx) and read by the vapour trails. */
export const wingTips = { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 }, live: false };
