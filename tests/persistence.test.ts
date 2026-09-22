import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTED_KEYS, hydrateGame, persistGame, useGame } from '../src/game/store';
import { START } from '../src/game/motion';
const saved: Record<string, string> = {};
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = value; },
    removeItem: (key: string) => { delete saved[key]; },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { vi.unstubAllGlobals(); Object.keys(saved).forEach(key => delete saved[key]); });
describe('persistence', () => {
  it('defaults to simple controls while preserving an explicitly saved comparison profile', () => {
    hydrateGame(); expect(useGame.getState().trackpadSteering).toBe('simple');
    for (const profile of ['simple', 'free', 'captured', 'flow']) {
      useGame.setState({ trackpadSteering: profile as 'simple' | 'free' | 'captured' | 'flow' });
      persistGame(); useGame.setState({ trackpadSteering: 'simple' }); hydrateGame();
      expect(useGame.getState().trackpadSteering).toBe(profile);
    }
    saved['halaverga-flight-v1'] = JSON.stringify({ trackpadSteering: 'unknown' });
    hydrateGame(); expect(useGame.getState().trackpadSteering).toBe('simple');
  });
  it('writes exactly the authoritative persisted key list', () => {
    persistGame();
    expect(Object.keys(JSON.parse(saved['halaverga-flight-v1'])).sort()).toEqual([...PERSISTED_KEYS].sort());
  });
  it('restores every persisted key and ignores runtime-only keys', () => {
    useGame.setState({ started: true, paused: false, message: 'live' });
    const checkpoint = { x: 30, y: 61.415, z: -38 };
    saved['halaverga-flight-v1'] = JSON.stringify({
      checkpoint, camera: 'first', quality: 'low', reduced: true, muted: false, discovered: true,
      tapControls: true, desktopMode: 'mouse', trackpadSteering: 'captured', sustainedEdges: true,
      reverseScroll: true, cruiseSpeed: 20, heroPoses: false, lookSensitivity: 1.7, flowIntroSeen: true,
      started: false, paused: true, ready: true, message: 'poison',
    });
    hydrateGame();
    const s = useGame.getState();
    expect(s.checkpoint).toEqual(checkpoint);
    expect(s.camera).toBe('first'); expect(s.quality).toBe('low'); expect(s.reduced).toBe(true);
    expect(s.muted).toBe(false); expect(s.discovered).toBe(true); expect(s.tapControls).toBe(true);
    expect(s.desktopMode).toBe('mouse'); expect(s.trackpadSteering).toBe('captured');
    expect(s.sustainedEdges).toBe(true); expect(s.reverseScroll).toBe(true);
    expect(s.cruiseSpeed).toBe(20); expect(s.heroPoses).toBe(false);
    expect(s.lookSensitivity).toBe(1.7); expect(s.flowIntroSeen).toBe(true);
    expect(s.started).toBe(true); expect(s.paused).toBe(false); expect(s.message).toBe('live');
  });
  it('round-trips a full settings state through persist and hydrate', () => {
    useGame.setState({
      checkpoint: { x: 30, y: 61.415, z: -38 }, camera: 'first', quality: 'low', reduced: true,
      muted: false, discovered: true, tapControls: true, desktopMode: 'mouse',
      trackpadSteering: 'flow', sustainedEdges: true, reverseScroll: true, cruiseSpeed: 12, heroPoses: false, lookSensitivity: 1.4, flowIntroSeen: true,
    });
    persistGame();
    useGame.setState({
      checkpoint: START, camera: 'third', quality: 'high', reduced: false, muted: true,
      discovered: false, tapControls: false, desktopMode: 'trackpad', trackpadSteering: 'free',
      sustainedEdges: false, reverseScroll: false, cruiseSpeed: 8, heroPoses: true, lookSensitivity: 1, flowIntroSeen: false,
    });
    hydrateGame();
    const s = useGame.getState();
    expect(s.checkpoint).toEqual({ x: 30, y: 61.415, z: -38 });
    expect(s.camera).toBe('first'); expect(s.quality).toBe('low'); expect(s.reduced).toBe(true);
    expect(s.muted).toBe(false); expect(s.discovered).toBe(true); expect(s.tapControls).toBe(true);
    expect(s.desktopMode).toBe('mouse'); expect(s.trackpadSteering).toBe('flow');
    expect(s.lookSensitivity).toBe(1.4); expect(s.flowIntroSeen).toBe(true);
    expect(s.sustainedEdges).toBe(true); expect(s.reverseScroll).toBe(true);
    expect(s.cruiseSpeed).toBe(12); expect(s.heroPoses).toBe(false);
  });
});
