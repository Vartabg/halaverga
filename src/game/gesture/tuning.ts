// Every Gesture Lab threshold from the spec, by section. Units: px = CSS px, ms, s, m, m/s, rad unless the name says DEG.
// Plain numbers only, so any lab module and the Player graph may read them. The few the landing graph needs live in tuningCore.ts
// and are re-exported here.
export { FACING_AIM, FACING_PATH, GOAL_PITCH_MAX, GOAL_PITCH_MIN, MAX_PITCH_RATE, MAX_YAW_RATE, MAX_YAW_RATE_RM, PITCH_MAX, PITCH_MIN, SNAP_INTENT } from './tuningCore';

// 1. Flight envelope
export const FLIGHT_SPEED = 13, SURGE_SPEED = 34;
/** Active and idle acceleration caps, m/s^2 (motion.advanceVelocity). */
export const ACCEL = 42, ACCEL_IDLE = 110;
export const FLIGHT_Y_MIN = 1.7, FLIGHT_Y_MAX = 105;
/** Curve cap: v <= sqrt(CURVE_K * r). */
export const CURVE_K = 33.6;

// 2.1 Pointer arbitration (touch start filter)
export const EDGE_STRIP = 12, BOTTOM_BAND = 28;
// 2.2 strokeBuffer
export const STROKE_RING = 512, WINDING_SEG = 4, SPEED_WIN_SHORT_MS = 60, SPEED_WIN_LONG_MS = 150;
// 2.3 oneEuro (CSS px)
export const EURO_MIN_CUTOFF = 1.0, EURO_D_CUTOFF = 1.0, EURO_BETA = 0.005;
// 2.4 resample
export const RDP_EPS = 2, RESAMPLE_N = 64, CATMULL_ALPHA = 0.5;

// 2.5 strokeFeatures: the ONE tap definition, hold, flick, swipe, circle
export const TAP_SLOP_TOUCH = 10, TAP_SLOP_MOUSE = 6, TAP_MS = 250;
export const HOLD_MS = 250, BRAKE_HOLD_MS = 900;
/** A still press on a drone becomes sustained fire after this long. */
export const SUSTAIN_MS = 180;
export const FLICK_SPEED = 0.9, FLICK_SPEED_MAX = 3, FLICK_MIN_PX = 40, FLICK_SNAP_DEG = 10;
export const SWIPE_STRAIGHT = 0.85, SWIPE_MIN_PX = 60, SWIPE_MAX_MS = 400, SWIPE_SECTOR_DEG = 45;
export const CIRCLE_CONDUCT_DEG = 330, CIRCLE_CONDUCT_RATE = 550, CIRCLE_R_MIN = 15, CIRCLE_R_MAX = 70;
export const CIRCLE_BRUSH_DEG = 300, CLOSURE_PX = 40, CLOSURE_FRAC = 0.3;
/** A stroke that fails every class nudges by this fraction of its chord. */
export const NUDGE_FRAC = 0.3;

// 2.6 Desktop hover ink. A 650 ms rest commits (350 ms cut a trackpad stroke whenever the player paused to think mid-curve);
// Brush swipes still commit mid-hover through straightFast.
export const REST_COMMIT_MS = 650, REST_COMMIT_MIN_PX = 60;

// 2.8 applyGesture
/** Largest offset-envelope derivative, m/s^2 (the envelope generators enforce it). */
export const OFFSET_JERK = 120;

// 3. Tap to Blast
export const R_EFF_PAD = 18, R_EFF_MIN = 28;
/** The pick also tests each drone where it was this long ago (Target Ghost). */
export const GHOST_MS = 80;
export const TRACK_FRAMES = 64, TRACK_DRONES = 8;
export const BURST_SHOTS = 3, LOCK_MAX = 3;
export const LASSO_DEG = 300, LASSO_NEAR_PX = 12;
/** Head leads the arm by this much during an aimed burst. */
export const HEAD_LEAD_MS = 60;

// 4. Draw the flight
/** Ray depth d_i = d_hero + DRAW_D0 + DRAW_M_PER_PX * arcPx, capped at DRAW_D_MAX. */
export const DRAW_D0 = 7, DRAW_M_PER_PX = 0.1, DRAW_D_MAX = 120;
/** Points blend from the hero to their ray over the first DRAW_BLEND_M of world arc. */
export const DRAW_BLEND_M = 12, DRAW_MIN_R = 5, DRAW_SPACING = 1.5, DRAW_MAX_PTS = 96;
export const DRAW_BOUNDS_PAD = 12, DRAW_Y_MIN = 4, DRAW_Y_MAX = 100, DRAW_AMBER_M = 2;
/** The hero stays this far behind the drawn arc. */
export const DRAW_LAG_M = 4;
export const INK_WORLD_MS = 150, SCRUB_FRAC = 0.3, SCRUB_MS = 300;
/** Heading easing toward the tangent after release, rad/s. */
export const HEADING_EASE = 3.5;
/** Draw's yaw easing cap on normal strokes (the effective cap before turn-360), and the gain and cap once a stroke wrapped. */
export const DRAW_EASE_CAP = 2.5, WRAP_HEADING_EASE = 6.0, YAW_GAIN_WRAP = 8;
export const LAND_NORMAL_Y = 0.75, LAND_RETARGET_FRAC = 0.2, LAND_LIFT_M = 1.2, LAND_HANDOFF_M = 8;
export const SWEEP_RADIUS = 1.05, SWEEP_STEP_M = 2, SWEEP_MAX_FRAME = 4, SWEEP_MAX_PATH = 60, SWEEP_LAND_EXCLUDE_M = 3;
export const FOLLOW_LOOKAHEAD_MIN = 3, FOLLOW_LOOKAHEAD_K = 0.35, FOLLOW_BASE = 18;
export const DRAW_PITCH_K = 0.8, DRAW_PITCH_MIN = -0.9, DRAW_PITCH_MAX = 0.7;
export const SPIN_TURN_DEG = 300;
export const ABORT_DEV_M = 3, ABORT_DEV_S = 0.5, ABORT_CLEAR_S = 0.3, ABORT_SLOW_FRAC = 0.3, ABORT_SLOW_S = 0.35;
export const EXIT_SPEED = 8, EXIT_DECAY_S = 1.5;

// 5. Conduct
export const STEER_TAU = 0.3, STEER_DEPTH = 30, STEER_GAIN = 2.5, STEER_YAW_MAX = 1.5, STEER_PITCH_MAX = 1.0;
export const STEER_DEADZONE_DEG = 4, STEER_GRACE_MS = 120;
/** CSS px per mm for the tempo measure. */
export const PX_PER_MM = 6;
export const STIR_FULL_MMS = 120, THROTTLE_RISE = 1.5, THROTTLE_FLOOR = 0.25, LIFT_TAU = 0.6;
export const DASH_MIN = 6, DASH_MAX = 14, DASH_S = 0.45, DASH_COOLDOWN = 0.6;
export const ROLL_FREEZE_DEG = 200, ROLL_SPARKLE_DEG = 300, ROLL_S = 0.7, ROLL_OFFSET_M = 3, ROLL_PEAK = 10;

// 6. Brush strokes
export const BRUSH_CRUISE = 13;
export const TURN_MIN_DEG = 20, TURN_MAX_DEG = 90, TURN_MIN_PX = 60, TURN_MAX_PX = 300;
export const TURN_DUR_BASE = 0.45, TURN_DUR_K = 0.55, TURN_PEAK_K = 1.5, TURN_PEAK_MAX = 2.5, TURN_DODGE = 4;
export const SOAR_MIN_S = 0.5, SOAR_MAX_S = 0.9, SOAR_PITCH = 0.35;
export const DIVE_FLOOR_M = 5;

// 3.6 / 4.5 Body facing reach: FACING_PATH and FACING_AIM (tuningCore.ts).

// 7. Feedback and discoverability
export const INK_W_SLOW = 10, INK_W_FAST = 4, INK_COLOR = '#58e1ff';
export const SET_MS = 120, SET_GAIN = 1.3, FEEDBACK_MS = 50, REJECT_MS = 250;
export const TRAIL_S = 1.2, TRAIL_W_MIN = 0.06, TRAIL_W_MAX = 0.12, MAX_CHANNELS = 4;
/** Each ghost plays ONBOARD_LOOPS times (3: two left a new player too little time while getting oriented), then replays after 8 s. */
export const ONBOARD_GHOST_MS = 600, ONBOARD_LOOPS = 3, ONBOARD_REPLAY_S = 8;
export const RM_INK_FADE_MS = 150, RM_OFFSET_SCALE = 0.6;

// 10-11. Performance and local telemetry
export const INK_DPR_MAX = 2, MAX_EXTRA_DRAWS = 2, MAX_LAB_TRIANGLES = 1500;
export const LAB_STATS_KEY = 'halaverga.lab.v1', STROKE_LOG_CAP = 50;
