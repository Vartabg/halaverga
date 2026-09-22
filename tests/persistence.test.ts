import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTED_KEYS, hydrateGame, persistGame, useGame, type PersistedKey } from '../src/game/store';
import { START } from '../src/game/motion';
const saved: Record<string, string> = {};
const STORAGE = 'halaverga-flight-v1';
// Every persisted key, set away from its default. The Record type makes a new key a compile error until it is added here.
const NON_DEFAULT: Record<PersistedKey, unknown> = {
  checkpoint: { x: 30, y: 61.415, z: -38 }, camera: 'first', quality: 'low', reduced: true, muted: false, discovered: true,
  tapControls: true, desktopMode: 'mouse', trackpadSteering: 'captured', sustainedEdges: true, reverseScroll: true,
  cruiseSpeed: 20, heroPoses: false, lookSensitivity: 1.7, flowIntroSeen: true, shooter: false, aimToggle: true, aimAssist: 1.5,
};
const DEFAULTS: Record<PersistedKey, unknown> = {
  checkpoint: START, camera: 'third', quality: 'high', reduced: false, muted: true, discovered: false,
  tapControls: false, desktopMode: 'trackpad', trackpadSteering: 'free', sustainedEdges: false, reverseScroll: false,
  cruiseSpeed: 8, heroPoses: true, lookSensitivity: 1, flowIntroSeen: false, shooter: true, aimToggle: false, aimAssist: 1,
};
const expectAll = (table: Record<PersistedKey, unknown>) => {
  const s = useGame.getState();
  for (const key of PERSISTED_KEYS) expect([key, s[key]]).toEqual([key, table[key]]);
};
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = value; },
    removeItem: (key: string) => { delete saved[key]; },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  useGame.setState(DEFAULTS as never);
});
afterEach(() => { vi.unstubAllGlobals(); Object.keys(saved).forEach(key => delete saved[key]); });
describe('persistence', () => {
  it('writes exactly the authoritative persisted key list', () => {
    persistGame();
    expect(Object.keys(JSON.parse(saved[STORAGE])).sort()).toEqual([...PERSISTED_KEYS].sort());
  });
  it('covers every persisted key in both tables and moves every key off its default', () => {
    expect(Object.keys(NON_DEFAULT).sort()).toEqual([...PERSISTED_KEYS].sort());
    for (const key of PERSISTED_KEYS) expect([key, NON_DEFAULT[key]]).not.toEqual([key, DEFAULTS[key]]);
  });
  it('restores every persisted key and ignores runtime-only keys', () => {
    useGame.setState({ started: true, paused: false, message: 'live' });
    saved[STORAGE] = JSON.stringify({ ...NON_DEFAULT, started: false, paused: true, ready: true, message: 'poison' });
    hydrateGame();
    expectAll(NON_DEFAULT);
    const s = useGame.getState();
    expect(s.started).toBe(true); expect(s.paused).toBe(false); expect(s.ready).toBe(false); expect(s.message).toBe('live');
  });
  it('round-trips a full settings state through persist and hydrate', () => {
    useGame.setState(NON_DEFAULT as never);
    persistGame();
    useGame.setState(DEFAULTS as never);
    expectAll(DEFAULTS);
    hydrateGame();
    expectAll(NON_DEFAULT);
  });
  it('hydrates an absent shooter setting as on and the aim settings as defaults', () => {
    useGame.setState({ shooter: false, aimToggle: true, aimAssist: 0 });
    saved[STORAGE] = JSON.stringify({ camera: 'first' });
    hydrateGame();
    const s = useGame.getState();
    expect(s.shooter).toBe(true); expect(s.aimToggle).toBe(false); expect(s.aimAssist).toBe(1);
    saved[STORAGE] = JSON.stringify({ shooter: 'no', aimToggle: 'yes' });
    hydrateGame();
    expect(useGame.getState().shooter).toBe(true); expect(useGame.getState().aimToggle).toBe(false);
  });
  it('clamps aim assist strength to [0, 1.5] and rejects non-numbers', () => {
    for (const [raw, want] of [[9, 1.5], [-1, 0], ['x', 1], [null, 1], [0, 0], [1.5, 1.5]] as const) {
      saved[STORAGE] = JSON.stringify({ aimAssist: raw });
      hydrateGame();
      expect([raw, useGame.getState().aimAssist]).toEqual([raw, want]);
    }
  });
  it('keeps ignoring runtime-only keys after the shooter settings were added', () => {
    useGame.setState({ started: false, paused: true, panel: false, message: '', trackpadFlying: false });
    saved[STORAGE] = JSON.stringify({ shooter: false, started: true, paused: false, panel: true, message: 'poison', trackpadFlying: true, flying: true });
    hydrateGame();
    const s = useGame.getState();
    expect(s.shooter).toBe(false);
    expect(s.started).toBe(false); expect(s.paused).toBe(true); expect(s.panel).toBe(false);
    expect(s.message).toBe(''); expect(s.trackpadFlying).toBe(false); expect(s.flying).toBe(false);
  });
});
