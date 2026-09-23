import { create } from 'zustand';
import { START, validCheckpoint, type Vec } from './motion';
export type CameraMode = 'third' | 'first';
export type TrackpadProfile = 'simple' | 'free' | 'captured' | 'flow';
/** 2: one finger + keyboard became the trackpad default. A save from before it that holds the old default ('free') moves to 'simple'. */
export const CONTROLS_VERSION = 2;
type GameState = {
  started: boolean; paused: boolean; ready: boolean; panel: boolean; journal: boolean;
  camera: CameraMode; quality: 'high' | 'low'; reduced: boolean; muted: boolean; tapControls: boolean;
  desktopMode: 'trackpad' | 'mouse'; trackpadFlying: boolean;
  trackpadSteering: TrackpadProfile; sustainedEdges: boolean; reverseScroll: boolean; cruiseSpeed: number; heroPoses: boolean;
  lookSensitivity: number; flowIntroSeen: boolean;
  shooter: boolean; aimToggle: boolean; aimAssist: number; controlsVersion: number;
  flying: boolean; landing: boolean; canLand: boolean; nearTerminal: boolean; boundaryNear: boolean; clearanceActive: boolean; inputEpoch: number;
  checkpoint: Vec; discovered: boolean; message: string;
  set: (patch: Partial<Omit<GameState, 'set'>>) => void;
};
export const useGame = create<GameState>((set) => ({
  started: false, paused: true, ready: false, panel: false, journal: false,
  camera: 'third', quality: 'high', reduced: false, muted: true, tapControls: false,
  desktopMode: 'trackpad', trackpadFlying: false,
  trackpadSteering: 'simple', sustainedEdges: false, reverseScroll: false, cruiseSpeed: 8, heroPoses: true,
  lookSensitivity: 1, flowIntroSeen: false,
  shooter: true, aimToggle: false, aimAssist: 1, controlsVersion: CONTROLS_VERSION,
  flying: false, landing: false, canLand: false, nearTerminal: false, boundaryNear: false, clearanceActive: false, inputEpoch: 0,
  checkpoint: START, discovered: false, message: '', set,
}));
const STORAGE = 'halaverga-flight-v1';
// The single authoritative list of fields saved between sessions. persistGame
// writes exactly these keys; tests/persistence.test.ts pins hydrateGame to
// restore every entry and to ignore runtime-only state.
export const PERSISTED_KEYS = ['checkpoint', 'camera', 'quality', 'reduced', 'muted', 'discovered', 'tapControls', 'desktopMode', 'trackpadSteering', 'sustainedEdges', 'reverseScroll', 'cruiseSpeed', 'heroPoses', 'lookSensitivity', 'flowIntroSeen', 'shooter', 'aimToggle', 'aimAssist', 'controlsVersion'] as const;
export type PersistedKey = typeof PERSISTED_KEYS[number];
export function hydrateGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    const version = typeof saved.controlsVersion === 'number' && Number.isFinite(saved.controlsVersion) ? saved.controlsVersion : 0;
    // 'free' was the default before version 2, so an old 'free' is not a choice; explicit captured and Flow stay.
    const steering = version < CONTROLS_VERSION && saved.trackpadSteering === 'free' ? 'simple' : saved.trackpadSteering;
    useGame.setState({
      checkpoint: validCheckpoint(saved.checkpoint) ? saved.checkpoint : START,
      camera: saved.camera === 'first' ? 'first' : 'third',
      quality: saved.quality === 'low' ? 'low' : 'high',
      reduced: typeof saved.reduced === 'boolean' ? saved.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches,
      muted: saved.muted !== false, discovered: saved.discovered === true,
      tapControls: saved.tapControls === true,
      desktopMode: saved.desktopMode === 'mouse' ? 'mouse' : 'trackpad',
      trackpadSteering: ['flow', 'captured', 'free'].includes(steering) ? steering : 'simple',
      sustainedEdges: saved.sustainedEdges === true, reverseScroll: saved.reverseScroll === true,
      cruiseSpeed: typeof saved.cruiseSpeed === 'number' && Number.isFinite(saved.cruiseSpeed) ? Math.max(3, Math.min(34, saved.cruiseSpeed)) : 8,
      heroPoses: saved.heroPoses !== false,
      lookSensitivity: typeof saved.lookSensitivity === 'number' && Number.isFinite(saved.lookSensitivity) ? Math.max(.5, Math.min(2, saved.lookSensitivity)) : 1,
      flowIntroSeen: saved.flowIntroSeen === true,
      shooter: saved.shooter !== false,
      aimToggle: saved.aimToggle === true,
      aimAssist: typeof saved.aimAssist === 'number' && Number.isFinite(saved.aimAssist) ? Math.max(0, Math.min(1.5, saved.aimAssist)) : 1,
      // A newer build's save keeps its version, so this build never re-runs a migration that already ran.
      controlsVersion: Math.max(CONTROLS_VERSION, version),
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
export function persistGame() {
  try {
    const state = useGame.getState();
    const saved: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) saved[key] = state[key];
    if (shooterPin && state.shooter === shooterPin.session) saved.shooter = shooterPin.saved; else shooterPin = null;
    localStorage.setItem(STORAGE, JSON.stringify(saved));
  }
  catch { /* Private browsing may prohibit storage; play remains available. */ }
}
