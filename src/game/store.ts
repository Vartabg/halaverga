import { create } from 'zustand';
import { START, validCheckpoint, type Vec } from './motion';
export type CameraMode = 'third' | 'first';
export type TrackpadProfile = 'free' | 'captured' | 'flow';
type GameState = {
  started: boolean; paused: boolean; ready: boolean; panel: boolean; journal: boolean;
  camera: CameraMode; quality: 'high' | 'low'; reduced: boolean; muted: boolean; tapControls: boolean;
  desktopMode: 'trackpad' | 'mouse'; trackpadFlying: boolean;
  trackpadSteering: TrackpadProfile; sustainedEdges: boolean; reverseScroll: boolean; cruiseSpeed: number; heroPoses: boolean;
  lookSensitivity: number; flowIntroSeen: boolean;
  flying: boolean; landing: boolean; canLand: boolean; nearTerminal: boolean; boundaryNear: boolean; clearanceActive: boolean; inputEpoch: number;
  checkpoint: Vec; discovered: boolean; message: string;
  set: (patch: Partial<Omit<GameState, 'set'>>) => void;
};
export const useGame = create<GameState>((set) => ({
  started: false, paused: true, ready: false, panel: false, journal: false,
  camera: 'third', quality: 'high', reduced: false, muted: true, tapControls: false,
  desktopMode: 'trackpad', trackpadFlying: false,
  trackpadSteering: 'free', sustainedEdges: false, reverseScroll: false, cruiseSpeed: 8, heroPoses: true,
  lookSensitivity: 1, flowIntroSeen: false,
  flying: false, landing: false, canLand: false, nearTerminal: false, boundaryNear: false, clearanceActive: false, inputEpoch: 0,
  checkpoint: START, discovered: false, message: '', set,
}));
const STORAGE = 'halaverga-flight-v1';
// The single authoritative list of fields saved between sessions. persistGame
// writes exactly these keys; tests/persistence.test.ts pins hydrateGame to
// restore every entry and to ignore runtime-only state.
export const PERSISTED_KEYS = ['checkpoint', 'camera', 'quality', 'reduced', 'muted', 'discovered', 'tapControls', 'desktopMode', 'trackpadSteering', 'sustainedEdges', 'reverseScroll', 'cruiseSpeed', 'heroPoses', 'lookSensitivity', 'flowIntroSeen'] as const;
export type PersistedKey = typeof PERSISTED_KEYS[number];
export function hydrateGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    useGame.setState({
      checkpoint: validCheckpoint(saved.checkpoint) ? saved.checkpoint : START,
      camera: saved.camera === 'first' ? 'first' : 'third',
      quality: saved.quality === 'low' ? 'low' : 'high',
      reduced: typeof saved.reduced === 'boolean' ? saved.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches,
      muted: saved.muted !== false, discovered: saved.discovered === true,
      tapControls: saved.tapControls === true,
      desktopMode: saved.desktopMode === 'mouse' ? 'mouse' : 'trackpad',
      trackpadSteering: saved.trackpadSteering === 'flow' ? 'flow' : saved.trackpadSteering === 'captured' ? 'captured' : 'free',
      sustainedEdges: saved.sustainedEdges === true, reverseScroll: saved.reverseScroll === true,
      cruiseSpeed: typeof saved.cruiseSpeed === 'number' && Number.isFinite(saved.cruiseSpeed) ? Math.max(3, Math.min(34, saved.cruiseSpeed)) : 8,
      heroPoses: saved.heroPoses !== false,
      lookSensitivity: typeof saved.lookSensitivity === 'number' && Number.isFinite(saved.lookSensitivity) ? Math.max(.5, Math.min(2, saved.lookSensitivity)) : 1,
      flowIntroSeen: saved.flowIntroSeen === true,
    });
  } catch { useGame.setState({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }); }
}
export function persistGame() {
  try {
    const state = useGame.getState();
    const saved: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) saved[key] = state[key];
    localStorage.setItem(STORAGE, JSON.stringify(saved));
  }
  catch { /* Private browsing may prohibit storage; play remains available. */ }
}
