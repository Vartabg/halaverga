// Pure helpers for the play lifecycle (landing-safe: no DOM, no three.js).
export type Orientation = 'landscape' | 'portrait';
/** Wider than tall is landscape; a square counts as portrait. */
export const orientationOf = (w: number, h: number): Orientation => (w > h ? 'landscape' : 'portrait');
/** Only a real rotation counts: Safari's toolbar showing or hiding changes the height, never the orientation. */
export const isOrientationFlip = (prev: Orientation, next: Orientation) => prev !== next;
/** Live play: the game is running and no pause card, settings panel or field guide is open. */
export const isPlaying = (s: { started: boolean; paused: boolean; panel: boolean; journal: boolean }) =>
  s.started && !s.paused && !s.panel && !s.journal;
