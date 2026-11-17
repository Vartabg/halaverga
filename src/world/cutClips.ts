// The three sword cuts as motion-capture clips (docs/plans/2026-11-16-real-fight.md B6). Each cut of the string (swordString.ts
// CUTS) plays its own Quaternius stroke from archangel.glb, then its recovery as the act's tail. The marks are measured by the build
// (scripts/real_bodies/clips.py, art/real-bodies/asset.json `cuts`) from the sword hand's speed in the game rig, and
// tests/cut-clips.test.ts recomputes them from the GLB: `raised` is the top of the windup (the hand's slowest frame before its
// peak), where a dive holds the blade and a landing releases it; `impact` is the hand's fastest frame, where the blade meets the
// body. watcher.glb carries the same three strokes (cut2 without its tail), so the Watchers' blows share these marks.
// Plain data; no three.js import.

/** clip: the stroke; rec: its recovery (played on at full weight when the stroke ends); raised and impact in clip seconds. */
export type CutClip = { readonly clip: string; readonly rec: string; readonly raised: number; readonly impact: number };
export const CUT_CLIPS: readonly CutClip[] = [
  { clip: 'cut0', rec: 'cut0Rec', raised: .1333, impact: .2333 }, // Sword_Regular_A: the cross cut
  { clip: 'cut1', rec: 'cut1Rec', raised: .1333, impact: .2333 }, // Sword_Regular_B: the rising cut
  { clip: 'cut2', rec: 'cut2Rec', raised: .5333, impact: .6333 }, // Sword_Regular_C to its first slow frame: the casting blow
];
/** The clip entry for cut `n` (the cross cut for anything out of range). */
export const cutClip = (n: number): CutClip => CUT_CLIPS[n] ?? CUT_CLIPS[0];
