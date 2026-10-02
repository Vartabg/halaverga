import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTED_KEYS, hydrateGame, overrideControlFields, overrideShooter, persistGame, saveControlFields, useGame, validHintProgress, type PersistedKey } from '../src/game/store';
import { settingsFor } from '../src/game/controlTypes';
import { applyControlsQuery } from '../src/ui/controls/controlsQuery';
import { START } from '../src/game/motion';
const saved: Record<string, string> = {}, STORAGE = 'halaverga-flight-v1';
// Every persisted key, set away from its default. The Record type makes a new key a compile error until it is added here.
const NON_DEFAULT: Record<PersistedKey, unknown> = {
  checkpoint: { x: 30, y: 61.415, z: -38 }, camera: 'first', quality: 'low', reduced: true, muted: false, discovered: true,
  tapControls: true, desktopMode: 'mouse', trackpadSteering: 'captured', sustainedEdges: false, reverseScroll: true,
  cruiseSpeed: 20, heroPoses: false, lookSensitivity: 1.7, flowIntroSeen: true, shooter: false, aimToggle: true, aimAssist: 1.5,
  controlsVersion: 7, autoFire: false, aimButton: false, hintProgress: { touch: 2, simple: 3, mouse: 1 },
  touchScheme: 'twin', touchLook: 1.6, touchAim: .7, lookAccel: false, edgeRest: false, invertY: true, flipSides: true,
  controlSize: 1.15, controlOpacity: .5, flyWhereILook: true, homeTipSeen: true, controlLab: 'brush',
};
const DEFAULTS: Record<PersistedKey, unknown> = {
  checkpoint: START, camera: 'third', quality: 'high', reduced: false, muted: true, discovered: false,
  tapControls: false, desktopMode: 'trackpad', trackpadSteering: 'free', sustainedEdges: true, reverseScroll: false,
  cruiseSpeed: 8, heroPoses: true, lookSensitivity: 1, flowIntroSeen: false, shooter: true, aimToggle: false, aimAssist: 1,
  controlsVersion: 6, autoFire: true, aimButton: true, hintProgress: { touch: 0, simple: 0, mouse: 0 },
  touchScheme: 'classic', touchLook: 1, touchAim: 1, lookAccel: true, edgeRest: true, invertY: false, flipSides: false,
  controlSize: 1, controlOpacity: .85, flyWhereILook: false, homeTipSeen: false, controlLab: 'standard',
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
afterEach(() => {
  // Ends every session override the test left behind (the pins are module state).
  saveControlFields({ controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' });
  vi.unstubAllGlobals(); Object.keys(saved).forEach(key => delete saved[key]);
});
describe('persistence', () => {
  it('defaults to the classic free trackpad while preserving an explicitly saved v4 profile', () => {
    hydrateGame(); expect(useGame.getState().trackpadSteering).toBe('free');
    for (const profile of ['simple', 'free', 'captured', 'flow']) {
      useGame.setState({ trackpadSteering: profile as 'simple' | 'free' | 'captured' | 'flow' });
      persistGame(); useGame.setState({ trackpadSteering: 'free' }); hydrateGame();
      expect(useGame.getState().trackpadSteering).toBe(profile);
    }
    saved[STORAGE] = JSON.stringify({ trackpadSteering: 'unknown' });
    hydrateGame(); expect(useGame.getState().trackpadSteering).toBe('free');
  });
  it('version 4: a pre-v4 simple (the PR #12 default) returns to free; free, captured and Flow stay; a v4 simple stays', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{}, 'free'], [{ controlsVersion: 3 }, 'free'], [{ trackpadSteering: 7 }, 'free'], [{ trackpadSteering: 'unknown', controlsVersion: 3 }, 'free'],
      ...[undefined, 1, 'x', 2, 3].map(v => [{ trackpadSteering: 'free', controlsVersion: v }, 'free'] as [Record<string, unknown>, string]),
      ...[undefined, 2, 3, 4, 5].map(v => [{ trackpadSteering: 'simple', controlsVersion: v }, v === 4 || v === 5 ? 'simple' : 'free'] as [Record<string, unknown>, string]),
      [{ trackpadSteering: 'captured' }, 'captured'], [{ trackpadSteering: 'flow' }, 'flow'],
      [{ trackpadSteering: 'captured', controlsVersion: 1 }, 'captured'], [{ trackpadSteering: 'flow', controlsVersion: 3 }, 'flow'],
    ];
    for (const [raw, want] of cases) {
      saved[STORAGE] = JSON.stringify({ camera: 'first', ...raw });
      hydrateGame();
      expect([raw, useGame.getState().trackpadSteering, useGame.getState().camera]).toEqual([raw, want, 'first']);
    }
  });
  it('writes controls version 6 after a migration, so a later explicit simple choice survives', () => {
    saved[STORAGE] = JSON.stringify({ trackpadSteering: 'simple', desktopMode: 'trackpad', controlsVersion: 3 });
    hydrateGame(); expect(useGame.getState().controlsVersion).toBe(6);
    persistGame(); expect(JSON.parse(saved[STORAGE])).toMatchObject({ trackpadSteering: 'free', controlsVersion: 6 });
    useGame.setState({ trackpadSteering: 'simple' }); persistGame();
    hydrateGame(); expect(useGame.getState().trackpadSteering).toBe('simple');
    expect(JSON.parse(saved[STORAGE]).controlsVersion).toBe(6);
    for (const [raw, want] of [[undefined, 6], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 7]] as const)
      { saved[STORAGE] = JSON.stringify({ controlsVersion: raw }); hydrateGame(); expect([raw, useGame.getState().controlsVersion]).toEqual([raw, want]); }
  });
  it('leaves desktopMode, the touch fields and a v3 hint progress alone when simple returns to free', () => {
    saved[STORAGE] = JSON.stringify({ trackpadSteering: 'simple', controlsVersion: 3, desktopMode: 'mouse', aimButton: false,
      hintProgress: { touch: 3, simple: 2, mouse: 1 }, touchScheme: 'classic', flyWhereILook: true });
    hydrateGame(); const s = useGame.getState();
    expect([s.trackpadSteering, s.desktopMode, s.aimButton, s.hintProgress, s.touchScheme, s.flyWhereILook, s.controlsVersion])
      .toEqual(['free', 'mouse', false, { touch: 3, simple: 2, mouse: 1 }, 'classic', true, 6]);
  });
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
  it('hydrates a missing or non-boolean autoFire as on, and a v3 aimButton from strict booleans (default on)', () => {
    for (const [raw, want] of [[undefined, true], ['no', true], [0, true], [null, true], [true, true], [false, false]] as const) {
      useGame.setState({ autoFire: !want });
      saved[STORAGE] = JSON.stringify(raw === undefined ? {} : { autoFire: raw });
      hydrateGame();
      expect([raw, useGame.getState().autoFire]).toEqual([raw, want]);
    }
    for (const [raw, want] of [[undefined, true], ['yes', true], [1, true], [true, true], [false, false]] as const) {
      saved[STORAGE] = JSON.stringify(raw === undefined ? { controlsVersion: 3 } : { aimButton: raw, controlsVersion: 3 });
      hydrateGame();
      expect([raw, useGame.getState().aimButton]).toEqual([raw, want]);
    }
  });
  it('validates hint progress: floors, clamps to each series length, and zeroes anything else', () => {
    const zeros = { touch: 0, simple: 0, mouse: 0 };
    const cases: [unknown, unknown][] = [
      ['x', zeros], [null, zeros], [undefined, zeros], [7, zeros], [[1, 2], zeros],
      [{ touch: 9, simple: -1, mouse: 2.7 }, { touch: 4, simple: 0, mouse: 2 }],
      [{ touch: NaN, simple: null, mouse: Infinity }, zeros], [{ touch: '1', simple: 4 }, { touch: 0, simple: 4, mouse: 0 }],
      [{ simple: 3 }, { touch: 0, simple: 3, mouse: 0 }], [{ touch: 1.99, simple: 4, mouse: 4 }, { touch: 1, simple: 4, mouse: 4 }],
    ];
    for (const [raw, want] of cases) expect([raw, validHintProgress(raw)]).toEqual([raw, want]);
    saved[STORAGE] = JSON.stringify({ hintProgress: { touch: 9, simple: -1, mouse: 2.7 }, controlsVersion: 3 });
    hydrateGame(); expect(useGame.getState().hintProgress).toEqual({ touch: 4, simple: 0, mouse: 2 });
    saved[STORAGE] = JSON.stringify({ hintProgress: 'x' });
    hydrateGame(); expect(useGame.getState().hintProgress).toEqual(zeros);
  });
  it('migrates a v2 save: Aim shown, touch hints restart, the classic one thumb (v6), version 6', () => {
    for (const version of [2, undefined, 1]) {
      saved[STORAGE] = JSON.stringify({ controlsVersion: version, aimButton: false, hintProgress: { touch: 2, simple: 3, mouse: 4 }, camera: 'first' });
      useGame.setState({ touchScheme: 'twin' });
      hydrateGame();
      const s = useGame.getState();
      expect([version, s.aimButton, s.hintProgress, s.touchScheme, s.controlsVersion, s.camera])
        .toEqual([version, true, { touch: 0, simple: 3, mouse: 4 }, 'classic', 6, 'first']);
    }
  });
  it('v6 (Garo 2026-09-26): saves below 6 move to the classic one thumb, a twin choice saved at 6 or later persists', () => {
    for (const version of [3, 4, 5]) {
      saved[STORAGE] = JSON.stringify({ controlsVersion: version, touchScheme: 'twin' });
      hydrateGame(); expect([version, useGame.getState().touchScheme, useGame.getState().controlsVersion]).toEqual([version, 'classic', 6]);
    }
    for (const version of [6, 7]) {
      saved[STORAGE] = JSON.stringify({ controlsVersion: version, touchScheme: 'twin' });
      hydrateGame(); expect([version, useGame.getState().touchScheme]).toEqual([version, 'twin']);
      saved[STORAGE] = JSON.stringify({ controlsVersion: version, touchScheme: 'classic' });
      hydrateGame(); expect([version, useGame.getState().touchScheme]).toEqual([version, 'classic']);
    }
    saved[STORAGE] = JSON.stringify({ controlsVersion: 6 }); hydrateGame(); expect(useGame.getState().touchScheme).toBe('classic');
    // Choosing twin now saves at 6 and survives the next load.
    useGame.setState({ touchScheme: 'twin' }); persistGame(); hydrateGame(); expect(useGame.getState().touchScheme).toBe('twin');
  });
  it('keeps every choice in a v3 save', () => {
    saved[STORAGE] = JSON.stringify({ controlsVersion: 3, aimButton: false, hintProgress: { touch: 3, simple: 1, mouse: 0 },
      touchScheme: 'classic', flyWhereILook: true, invertY: true, touchLook: 1.4 });
    hydrateGame();
    const s = useGame.getState();
    expect([s.aimButton, s.hintProgress, s.touchScheme, s.flyWhereILook, s.invertY, s.touchLook])
      .toEqual([false, { touch: 3, simple: 1, mouse: 0 }, 'classic', true, true, 1.4]);
  });
  it('clamps the numeric touch settings, and rejects non-numbers, non-booleans and unknown schemes', () => {
    const table: [string, unknown, unknown][] = [
      ['touchLook', 9, 2], ['touchLook', .1, .5], ['touchLook', 'x', 1], ['touchLook', NaN, 1],
      ['touchAim', 3, 1.5], ['touchAim', 0, .5], ['touchAim', null, 1],
      ['controlSize', 2, 1.2], ['controlSize', .2, .85], ['controlSize', '1.1', 1],
      ['controlOpacity', 5, 1], ['controlOpacity', 0, .4], ['controlOpacity', [], .85],
      ['touchScheme', 'thumbs', 'classic'], ['touchScheme', 'classic', 'classic'],
      ['invertY', 1, false], ['flipSides', 'true', false], ['flyWhereILook', 0, false], ['homeTipSeen', {}, false],
    ];
    for (const [key, raw, want] of table) {
      saved[STORAGE] = JSON.stringify({ controlsVersion: 3, [key]: raw });
      hydrateGame();
      expect([key, raw, useGame.getState()[key as PersistedKey]]).toEqual([key, raw, want]);
    }
  });
  it('version 5: an older save turns look acceleration, sustained edges and edge rest on; a v5 save keeps its choices', () => {
    for (const version of [undefined, 3, 4]) {
      saved[STORAGE] = JSON.stringify({ controlsVersion: version, lookAccel: false, sustainedEdges: false, camera: 'first' });
      useGame.setState({ lookAccel: false, sustainedEdges: false, edgeRest: false });
      hydrateGame(); const s = useGame.getState();
      expect([version, s.lookAccel, s.sustainedEdges, s.edgeRest, s.camera, s.controlsVersion]).toEqual([version, true, true, true, 'first', 6]);
    }
    saved[STORAGE] = JSON.stringify({ controlsVersion: 5, lookAccel: false, sustainedEdges: false, edgeRest: false });
    hydrateGame();
    expect([useGame.getState().lookAccel, useGame.getState().sustainedEdges, useGame.getState().edgeRest]).toEqual([false, false, false]);
    saved[STORAGE] = JSON.stringify({ controlsVersion: 5, lookAccel: 'no', sustainedEdges: 0, edgeRest: null });
    hydrateGame();
    expect([useGame.getState().lookAccel, useGame.getState().sustainedEdges, useGame.getState().edgeRest]).toEqual([true, true, true]);
  });
  it('never saves the vote card state', () => {
    useGame.setState({ voteOpen: true }); persistGame();
    expect(JSON.parse(saved[STORAGE])).not.toHaveProperty('voteOpen');
    expect(PERSISTED_KEYS as readonly string[]).not.toContain('voteOpen');
    saved[STORAGE] = JSON.stringify({ voteOpen: true }); useGame.setState({ voteOpen: false }); hydrateGame();
    expect(useGame.getState().voteOpen).toBe(false);
  });
  it('never saves the Controls sheet state (the pause card and Flight settings open it, so it must never come back open after a reload)', () => {
    useGame.setState({ controlsOpen: true }); persistGame();
    expect(JSON.parse(saved[STORAGE])).not.toHaveProperty('controlsOpen');
    expect(PERSISTED_KEYS as readonly string[]).not.toContain('controlsOpen');
    saved[STORAGE] = JSON.stringify({ controlsOpen: true }); useGame.setState({ controlsOpen: false }); hydrateGame();
    expect(useGame.getState().controlsOpen).toBe(false);
  });
  it('never saves the runtime-only touch state', () => {
    useGame.setState({ nearGround: true, leavePrompt: true, zoomNote: true });
    persistGame();
    const written = JSON.parse(saved[STORAGE]);
    for (const key of ['nearGround', 'leavePrompt', 'zoomNote', 'descendBlocked', 'hintVisible', 'landing', 'voteOpen']) expect(written).not.toHaveProperty(key);
    useGame.setState({ nearGround: false, leavePrompt: false, zoomNote: false });
    saved[STORAGE] = JSON.stringify({ ...written, nearGround: true, leavePrompt: true, zoomNote: true });
    hydrateGame();
    const s = useGame.getState();
    expect([s.nearGround, s.leavePrompt, s.zoomNote]).toEqual([false, false, false]);
  });
  it('Gesture Lab: controlLab is saved (standard by default, unknown values fall back), and ?controls is session-only', () => {
    for (const [raw, want] of [[undefined, 'standard'], ['draw', 'draw'], ['conduct', 'conduct'], ['brush', 'brush'], ['x', 'standard'], [3, 'standard']] as const) {
      saved[STORAGE] = JSON.stringify(raw === undefined ? { controlsVersion: 4 } : { controlLab: raw });
      hydrateGame(); expect([raw, useGame.getState().controlLab]).toEqual([raw, want]);
    }
    saved[STORAGE] = JSON.stringify({ controlLab: 'conduct' }); hydrateGame();
    applyControlsQuery('draw'); expect(useGame.getState().controlLab).toBe('draw');
    persistGame(); expect(JSON.parse(saved[STORAGE]).controlLab).toBe('conduct');
    overrideControlFields({ controlLab: 'brush' }); persistGame(); expect(JSON.parse(saved[STORAGE]).controlLab).toBe('conduct');
    applyControlsQuery('nope'); expect(useGame.getState().controlLab).toBe('brush');
    saveControlFields({ controlLab: 'draw' }); expect(JSON.parse(saved[STORAGE]).controlLab).toBe('draw');
    saveControlFields({ controlLab: 'standard' }); persistGame(); expect(JSON.parse(saved[STORAGE]).controlLab).toBe('standard');
  });
  it('keeps the persisted key list exactly as it was (no key for the new controls)', () => {
    expect([...PERSISTED_KEYS]).toEqual(['checkpoint', 'camera', 'quality', 'reduced', 'muted', 'discovered', 'tapControls', 'desktopMode', 'trackpadSteering', 'sustainedEdges', 'reverseScroll', 'cruiseSpeed', 'heroPoses', 'lookSensitivity', 'flowIntroSeen', 'shooter', 'aimToggle', 'aimAssist', 'controlsVersion', 'autoFire', 'aimButton', 'hintProgress',
      'touchScheme', 'touchLook', 'touchAim', 'lookAccel', 'edgeRest', 'invertY', 'flipSides', 'controlSize', 'controlOpacity', 'flyWhereILook', 'homeTipSeen', 'controlLab']);
  });
});

// The per-field session pin: one helper behind ?shooter=, ?controls= and a lab fault.
describe('session pins per field', () => {
  const SAVED = { controlsVersion: 6, touchScheme: 'twin', trackpadSteering: 'captured', desktopMode: 'mouse', controlLab: 'draw' };
  const stored = () => JSON.parse(saved[STORAGE]);
  const start = () => { saved[STORAGE] = JSON.stringify(SAVED); hydrateGame(); };
  const OTHER = { touchScheme: 'classic', trackpadSteering: 'flow', desktopMode: 'trackpad', controlLab: 'conduct' } as const;
  for (const key of ['touchScheme', 'trackpadSteering', 'desktopMode', 'controlLab'] as const) {
    it(`${key}: a session override is not saved; a change by the player is, and ends the pin`, () => {
      start();
      overrideControlFields({ [key]: OTHER[key] });
      expect(useGame.getState()[key]).toBe(OTHER[key]);
      persistGame(); expect(stored()[key]).toBe(SAVED[key]);
      useGame.setState({ camera: 'first' }); persistGame(); expect(stored()[key]).toBe(SAVED[key]);
      const player = key === 'controlLab' ? 'brush' : key === 'desktopMode' ? 'mouse' : key === 'touchScheme' ? 'twin' : 'simple';
      useGame.setState({ [key]: player }); persistGame(); expect(stored()[key]).toBe(player);
      // The pin is gone: coming back to the old session value now saves it.
      useGame.setState({ [key]: OTHER[key] }); persistGame(); expect(stored()[key]).toBe(OTHER[key]);
    });
  }
  it('a lab fault keeps the saved lab, and a later save of an unrelated field never drops the pin', () => {
    start();
    overrideControlFields({ controlLab: 'standard' });
    for (const camera of ['first', 'third', 'first'] as const) { useGame.setState({ camera }); persistGame(); expect(stored()).toMatchObject({ controlLab: 'draw', camera }); }
    expect(useGame.getState().controlLab).toBe('standard');
    saveControlFields({ touchScheme: 'classic' }); // an unrelated field's save leaves the lab pin alone
    expect(stored()).toMatchObject({ controlLab: 'draw', touchScheme: 'classic' });
  });
  it('overrideShooter behaves as before', () => {
    start(); expect(useGame.getState().shooter).toBe(true);
    overrideShooter(false); persistGame(); expect(useGame.getState().shooter).toBe(false); expect(stored().shooter).toBe(true);
    overrideShooter(true); overrideShooter(false); persistGame(); expect(stored().shooter).toBe(true);
    useGame.setState({ shooter: true }); persistGame(); expect(stored().shooter).toBe(true);
    useGame.setState({ shooter: false }); persistGame(); expect(stored().shooter).toBe(false);
    overrideShooter(true); persistGame(); expect(stored().shooter).toBe(false);
  });
  it('a pinned key updated twice keeps the FIRST saved value', () => {
    start();
    applyControlsQuery('draw'); applyControlsQuery('brush'); applyControlsQuery('conduct');
    expect(useGame.getState().controlLab).toBe('conduct');
    persistGame(); expect(stored().controlLab).toBe('draw');
  });
  it('one-finger-keys pins three fields; a later Brush pick saves only the lab; Flow unpins exactly its own keys', () => {
    start();
    applyControlsQuery('one-finger-keys');
    const session = { controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'simple' };
    const live = () => { const s = useGame.getState(); return { controlLab: s.controlLab, desktopMode: s.desktopMode, trackpadSteering: s.trackpadSteering }; };
    expect(live()).toEqual(session);
    persistGame(); expect(stored()).toMatchObject({ controlLab: 'draw', desktopMode: 'mouse', trackpadSteering: 'captured' });
    // A phone pick pins nothing: the twin-stick session pin sits beside the three.
    applyControlsQuery('twin-stick');
    expect(useGame.getState().touchScheme).toBe('twin');
    // The player picks Brush: only controlLab is unpinned and saved.
    saveControlFields(settingsFor('brush'));
    expect(stored()).toMatchObject({ controlLab: 'brush', desktopMode: 'mouse', trackpadSteering: 'captured' });
    expect(live()).toEqual({ ...session, controlLab: 'brush' });
    // The player picks Flow: desktopMode, trackpadSteering and controlLab are saved; touchScheme's pin stays.
    saveControlFields(settingsFor('flow'));
    expect(stored()).toMatchObject({ controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'flow' });
    expect(live()).toEqual({ controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'flow' });
  });
  it('Flow keeps a pin on a field it does not patch (touchScheme keeps its ORIGINAL saved value)', () => {
    saved[STORAGE] = JSON.stringify({ ...SAVED, touchScheme: 'classic' }); hydrateGame();
    applyControlsQuery('twin-stick');
    saveControlFields(settingsFor('flow'));
    expect(useGame.getState().touchScheme).toBe('twin');
    expect(stored()).toMatchObject({ touchScheme: 'classic', trackpadSteering: 'flow', desktopMode: 'trackpad', controlLab: 'standard' });
    saveControlFields(settingsFor('twin-stick'));
    expect(stored()).toMatchObject({ touchScheme: 'twin' });
  });
  it('restores every persisted key through hydrate after pins were used', () => {
    useGame.setState(NON_DEFAULT as never);
    applyControlsQuery('flow'); persistGame();
    useGame.setState(DEFAULTS as never);
    // A pin the state no longer matches is dropped; the stored session-independent values come back.
    hydrateGame();
    for (const key of PERSISTED_KEYS) if (!['controlLab', 'desktopMode', 'trackpadSteering'].includes(key)) expect([key, useGame.getState()[key]]).toEqual([key, NON_DEFAULT[key]]);
    expect(stored()).toMatchObject({ controlLab: 'brush', desktopMode: 'mouse', trackpadSteering: 'captured' });
  });
});
