// The Gesture Lab thresholds the landing page's graph needs (runtime.readIntent, applyGesture, presentation). Plain numbers, no
// imports: tuning.ts re-exports them, so it stays the one list, while the landing first load carries only these few (Turbopack
// keeps a whole module, so importing tuning.ts there would bring every lab constant).
export const PITCH_MIN = -1.3, PITCH_MAX = 1.25;
/** A gesture never drives pitch beyond this band (it does not pull a pitch that is already outside it back in). */
export const GOAL_PITCH_MIN = -1.0, GOAL_PITCH_MAX = 0.9;
/**
 * Largest yaw and pitch rates gestureBefore applies, rad/s. The yaw cap is only headroom: each scheme's own curve is the real limit
 * (Conduct 4.2, Brush whirl peak 6.44, Draw 2.5 outside a wrap and 6.0 inside one). Pitch: Conduct 1.0, Soar/Dive headroom.
 */
export const MAX_YAW_RATE = 7.0, MAX_PITCH_RATE = 1.5;
/** The yaw cap under reduced motion (a 360 takes 2.5 s or more). */
export const MAX_YAW_RATE_RM = 2.5;
/** Intent components below this snap to 0 (so a decay tail ends and moving() turns false). */
export const SNAP_INTENT = 0.02;
// 3.6 / 4.5 Body facing reach (presentation.FACING is {yaw .3, pitchUp .4, pitchDown .15})
export const FACING_PATH = { yaw: 0.6, pitchUp: 0.7, pitchDown: 0.9 } as const;
export const FACING_AIM = { yaw: 0.9, pitchUp: 0.6, pitchDown: 0.5 } as const;
