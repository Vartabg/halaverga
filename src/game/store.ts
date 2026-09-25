import { create } from 'zustand';
import { START, validCheckpoint, type Vec } from './motion';
export type CameraMode = 'third' | 'first';
export type TrackpadProfile = 'simple' | 'free' | 'captured' | 'flow';
/**
 * 2: one finger + keyboard became the trackpad default. A save from before it that holds the old default ('free') moves to 'simple'.
 * 3: industry touch controls, Garo 2026-09-24 (twin stick, Aim button shown, the touch hints start over).
 * 4: the classic free trackpad is the desktop default again (Garo 2026-09-24). A save from before 4 holding 'simple' returns to 'free'.
 * 5: easier 360 turns (Garo 2026-09-25). A save from before 5 turns look acceleration and sustained edges on and gains edge rest on;
 *    a save at 5 or later keeps its own choices.
 */
export const CONTROLS_VERSION = 5;
export type TouchScheme = 'twin' | 'classic';
export type HintSeries = 'touch' | 'simple' | 'mouse';
/** The Gesture Lab (docs: gesture lab spec 8). 'standard' is the restored desktop + twin-stick controls and stays the default. */
export type ControlLab = 'standard' | 'draw' | 'conduct' | 'brush';
export const CONTROL_LABS: readonly ControlLab[] = ['standard', 'draw', 'conduct', 'brush'];
export const isControlLab = (v: unknown): v is ControlLab => typeof v === 'string' && (CONTROL_LABS as readonly string[]).includes(v);
export type HintProgress = Record<HintSeries, number>;
/** Steps per progressive hint series; progress === HINT_STEPS[series] means done. */
export const HINT_STEPS: Readonly<HintProgress> = { touch: 4, simple: 4, mouse: 4 };
/** Each field: finite → floored and clamped to [0, HINT_STEPS[k]]; otherwise 0. A non-object → all 0. */
export function validHintProgress(raw: unknown): HintProgress {
  const o = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const one = (k: HintSeries) => { const v = o[k]; return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(HINT_STEPS[k], Math.floor(v))) : 0; };
  return { touch: one('touch'), simple: one('simple'), mouse: one('mouse') };
}
type GameState = {
  started: boolean; paused: boolean; ready: boolean; panel: boolean; journal: boolean;
  camera: CameraMode; quality: 'high' | 'low'; reduced: boolean; muted: boolean; tapControls: boolean;
  desktopMode: 'trackpad' | 'mouse'; trackpadFlying: boolean;
  trackpadSteering: TrackpadProfile; sustainedEdges: boolean; reverseScroll: boolean; cruiseSpeed: number; heroPoses: boolean;
  lookSensitivity: number; flowIntroSeen: boolean;
  shooter: boolean; aimToggle: boolean; aimAssist: number; controlsVersion: number;
  autoFire: boolean; aimButton: boolean; hintProgress: HintProgress;
  /** Touch controls (v3). touchLook/touchAim/controlSize/controlOpacity are multipliers clamped to TOUCH_RANGES. */
  touchScheme: TouchScheme; touchLook: number; touchAim: number; lookAccel: boolean; invertY: boolean; flipSides: boolean;
  /** Twin look thumb: a fast swipe that rests at an edge keeps turning (v5, on by default). */
  edgeRest: boolean;
  controlSize: number; controlOpacity: number; flyWhereILook: boolean; homeTipSeen: boolean;
  /** Gesture Lab scheme, and 'Shots slow me down' (off: lab shots skip the hip-fire speed clamp, gesture.exemptHip). */
  controlLab: ControlLab; labShotsSlow: boolean;
  /** Runtime only: a landable surface is within reach below (Descend reads Land), the Leave card, the pinch-zoom note, and a held
   *  Descend that the clearance assist stopped with no landable spot near (Descend reads "No landing"). */
  nearGround: boolean; leavePrompt: boolean; zoomNote: boolean; descendBlocked: boolean;
  /** Runtime only (never saved): a controls hint is on screen, so other notices wait (one message at a time). */
  hintVisible: boolean;
  /** Runtime only (never saved): the vote card is open (the lab keys and auto-open wait). */
  voteOpen: boolean;
  flying: boolean; landing: boolean; canLand: boolean; nearTerminal: boolean; boundaryNear: boolean; clearanceActive: boolean; inputEpoch: number;
  checkpoint: Vec; discovered: boolean; message: string;
  set: (patch: Partial<Omit<GameState, 'set'>>) => void;
};
export const useGame = create<GameState>((set) => ({
  started: false, paused: true, ready: false, panel: false, journal: false,
  camera: 'third', quality: 'high', reduced: false, muted: true, tapControls: false,
  desktopMode: 'trackpad', trackpadFlying: false,
  trackpadSteering: 'free', sustainedEdges: true, reverseScroll: false, cruiseSpeed: 8, heroPoses: true,
  lookSensitivity: 1, flowIntroSeen: false,
  shooter: true, aimToggle: false, aimAssist: 1, controlsVersion: CONTROLS_VERSION,
  autoFire: true, aimButton: true, hintProgress: { touch: 0, simple: 0, mouse: 0 }, hintVisible: false,
  touchScheme: 'twin', touchLook: 1, touchAim: 1, lookAccel: true, edgeRest: true, invertY: false, flipSides: false,
  controlSize: 1, controlOpacity: .85, flyWhereILook: false, homeTipSeen: false, controlLab: 'standard', labShotsSlow: false,
  nearGround: false, leavePrompt: false, zoomNote: false, descendBlocked: false, voteOpen: false,
  flying: false, landing: false, canLand: false, nearTerminal: false, boundaryNear: false, clearanceActive: false, inputEpoch: 0,
  checkpoint: START, discovered: false, message: '', set,
}));
const STORAGE = 'halaverga-flight-v1';
// The single authoritative list of fields saved between sessions. persistGame
// writes exactly these keys; tests/persistence.test.ts pins hydrateGame to
// restore every entry and to ignore runtime-only state.
export const PERSISTED_KEYS = ['checkpoint', 'camera', 'quality', 'reduced', 'muted', 'discovered', 'tapControls', 'desktopMode', 'trackpadSteering', 'sustainedEdges', 'reverseScroll', 'cruiseSpeed', 'heroPoses', 'lookSensitivity', 'flowIntroSeen', 'shooter', 'aimToggle', 'aimAssist', 'controlsVersion', 'autoFire', 'aimButton', 'hintProgress',
  'touchScheme', 'touchLook', 'touchAim', 'lookAccel', 'edgeRest', 'invertY', 'flipSides', 'controlSize', 'controlOpacity', 'flyWhereILook', 'homeTipSeen', 'controlLab', 'labShotsSlow'] as const;
/** [min, max, default] for the numeric touch settings. */
export const TOUCH_RANGES = { touchLook: [.5, 2, 1], touchAim: [.5, 1.5, 1], controlSize: [.85, 1.2, 1], controlOpacity: [.4, 1, .85] } as const;
const ranged = (v: unknown, [lo, hi, fallback]: readonly [number, number, number]) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const strict = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
export type PersistedKey = typeof PERSISTED_KEYS[number];
export function hydrateGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    const version = typeof saved.controlsVersion === 'number' && Number.isFinite(saved.controlsVersion) ? saved.controlsVersion : 0;
    // 'simple' was the default from version 2 to 3 and cannot be told apart from a choice, so it returns to 'free'; captured and Flow stay.
    const steering = version < 4 && saved.trackpadSteering === 'simple' ? 'free' : saved.trackpadSteering;
    // Version 3 shows the Aim button and restarts the touch hints, which now teach the twin-stick controls.
    const before3 = version < 3, hints = validHintProgress(saved.hintProgress);
    // Version 5 turns the turning aids on for every older save; from 5 on the saved choice holds (missing or invalid: on).
    const before5 = version < 5;
    if (before3) hints.touch = 0;
    useGame.setState({
      checkpoint: validCheckpoint(saved.checkpoint) ? saved.checkpoint : START,
      camera: saved.camera === 'first' ? 'first' : 'third',
      quality: saved.quality === 'low' ? 'low' : 'high',
      reduced: typeof saved.reduced === 'boolean' ? saved.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches,
      muted: saved.muted !== false, discovered: saved.discovered === true,
      tapControls: saved.tapControls === true,
      desktopMode: saved.desktopMode === 'mouse' ? 'mouse' : 'trackpad',
      trackpadSteering: ['simple', 'free', 'captured', 'flow'].includes(steering) ? steering : 'free',
      sustainedEdges: before5 || strict(saved.sustainedEdges, true), reverseScroll: saved.reverseScroll === true,
      cruiseSpeed: typeof saved.cruiseSpeed === 'number' && Number.isFinite(saved.cruiseSpeed) ? Math.max(3, Math.min(34, saved.cruiseSpeed)) : 8,
      heroPoses: saved.heroPoses !== false,
      lookSensitivity: typeof saved.lookSensitivity === 'number' && Number.isFinite(saved.lookSensitivity) ? Math.max(.5, Math.min(2, saved.lookSensitivity)) : 1,
      flowIntroSeen: saved.flowIntroSeen === true,
      shooter: saved.shooter !== false,
      aimToggle: saved.aimToggle === true,
      aimAssist: typeof saved.aimAssist === 'number' && Number.isFinite(saved.aimAssist) ? Math.max(0, Math.min(1.5, saved.aimAssist)) : 1,
      // A newer build's save keeps its version, so this build never re-runs a migration that already ran.
      controlsVersion: Math.max(CONTROLS_VERSION, version),
      autoFire: saved.autoFire !== false, aimButton: before3 || strict(saved.aimButton, true),
      hintProgress: hints,
      touchScheme: saved.touchScheme === 'classic' ? 'classic' : 'twin',
      touchLook: ranged(saved.touchLook, TOUCH_RANGES.touchLook), touchAim: ranged(saved.touchAim, TOUCH_RANGES.touchAim),
      lookAccel: before5 || strict(saved.lookAccel, true), edgeRest: before5 || strict(saved.edgeRest, true), invertY: strict(saved.invertY, false), flipSides: strict(saved.flipSides, false),
      controlSize: ranged(saved.controlSize, TOUCH_RANGES.controlSize), controlOpacity: ranged(saved.controlOpacity, TOUCH_RANGES.controlOpacity),
      flyWhereILook: strict(saved.flyWhereILook, false), homeTipSeen: strict(saved.homeTipSeen, false),
      // No migration: a save without a lab choice (every save before the lab) plays the standard controls.
      controlLab: isControlLab(saved.controlLab) ? saved.controlLab : 'standard', labShotsSlow: strict(saved.labShotsSlow, false),
    });
  } catch { useGame.setState({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }); }
}
// A session override of the blaster (?shooter=0/1, a fault) is not saved: persistGame keeps writing the stored choice
// until the player changes the setting themselves.
let shooterPin: { session: boolean; saved: boolean } | null = null;
export function overrideShooter(on: boolean) {
  if (shooterPin) shooterPin.session = on; else shooterPin = { session: on, saved: useGame.getState().shooter };
  useGame.setState({ shooter: on });
}
// ?controls=draw (or a lab chunk that fails to load) switches the scheme for this session only; a choice in the picker is saved.
let labPin: { session: ControlLab; saved: ControlLab } | null = null;
export function overrideControls(id: ControlLab) {
  if (labPin) labPin.session = id; else labPin = { session: id, saved: useGame.getState().controlLab };
  useGame.setState({ controlLab: id });
}
/** The player's own choice (picker): saved, and it ends any session override. */
export function chooseControlLab(id: ControlLab) {
  labPin = null;
  useGame.setState({ controlLab: id }); persistGame();
}
export function persistGame() {
  try {
    const state = useGame.getState();
    const saved: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) saved[key] = state[key];
    if (shooterPin && state.shooter === shooterPin.session) saved.shooter = shooterPin.saved; else shooterPin = null;
    if (labPin && state.controlLab === labPin.session) saved.controlLab = labPin.saved; else labPin = null;
    localStorage.setItem(STORAGE, JSON.stringify(saved));
  }
  catch { /* Private browsing may prohibit storage; play remains available. */ }
}
