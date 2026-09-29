import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_TYPES, idFor, settingsFor, type ControlFamily, type ControlId } from '../src/game/controlTypes';
import { START } from '../src/game/motion';
import { runtime } from '../src/game/runtime';
import { hydrateGame, saveControlFields, useGame, type ControlFields } from '../src/game/store';
import { applyControlsQuery } from '../src/ui/controls/controlsQuery';
import { currentControlId, selectControl } from '../src/ui/controls/selectControl';

const STORAGE = 'halaverga-flight-v1', saved: Record<string, string> = {};
const FIELDS = ['controlLab', 'touchScheme', 'trackpadSteering', 'desktopMode'] as const;
const DEFAULT_FIELDS: ControlFields = { controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' };
const touched = (s: ControlFields): ControlFields => ({ controlLab: s.controlLab, touchScheme: s.touchScheme, trackpadSteering: s.trackpadSteering, desktopMode: s.desktopMode });
const firstFamily = (id: ControlId): ControlFamily => CONTROL_TYPES.find(c => c.id === id)!.families[0];

/**
 * A frozen reference of the OLD writers (commit 1c4e76d), applied to a store the way each control did it:
 * TouchSettings save({touchScheme}), the Desktop controls select save({desktopMode}), TrackpadSettings save({trackpadSteering}),
 * and switchLab(id) for the labs. The old writers of the non-lab controls never touched controlLab (faithful here on purpose).
 */
function oldWriter(id: ControlId, s: ControlFields): ControlFields {
  const next = { ...s };
  switch (id) {
    case 'one-finger': next.touchScheme = 'classic'; break;
    case 'twin-stick': next.touchScheme = 'twin'; break;
    case 'cursor': next.desktopMode = 'trackpad'; next.trackpadSteering = 'free'; break;
    case 'one-finger-keys': next.desktopMode = 'trackpad'; next.trackpadSteering = 'simple'; break;
    case 'flow': next.desktopMode = 'trackpad'; next.trackpadSteering = 'flow'; break;
    case 'captured': next.desktopMode = 'trackpad'; next.trackpadSteering = 'captured'; break;
    case 'mouse-keys': next.desktopMode = 'mouse'; break;
    default: next.controlLab = id; // draw, conduct, brush
  }
  return next;
}
/**
 * The one intended difference (docs/DECISIONS.md, 2026-09-28): picking a non-lab control also puts the lab back on standard.
 * idFor gives a running lab priority, so without this a pick made while Draw is on would be saved but never take effect.
 */
const expectedAfterPick = (id: ControlId, s: ControlFields): ControlFields => {
  const old = oldWriter(id, s);
  return isLab(id) ? old : { ...old, controlLab: 'standard' };
};
const isLab = (id: ControlId) => id === 'draw' || id === 'conduct' || id === 'brush';
/** Which input layer mounts: Experience (lab), TouchControls (scheme) and useTrackpad (profile) read exactly these fields. */
function inputLayerOf(s: ControlFields): string {
  if (s.controlLab !== 'standard') return `lab:${s.controlLab}`;
  return `touch:${s.touchScheme}|desktop:${s.desktopMode === 'mouse' ? 'mouse' : s.trackpadSteering}`;
}
const reset = (fields: ControlFields = DEFAULT_FIELDS) => {
  saveControlFields(fields);
  useGame.setState({ voteOpen: false, started: true, paused: false, inputEpoch: 0, message: '', checkpoint: START });
  for (const key of Object.keys(saved)) delete saved[key];
};

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved[k] ?? null, setItem: (k: string, v: string) => { saved[k] = v; }, removeItem: (k: string) => { delete saved[k]; } });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} });
  reset();
});
afterEach(() => { reset(); vi.unstubAllGlobals(); });

describe('selectControl parity with the old writers', () => {
  for (const c of CONTROL_TYPES) {
    it(`${c.id}: same four fields and same input layer as the old writer`, () => {
      const family = firstFamily(c.id), before = touched(useGame.getState());
      // The current control may already be c (the default): start from a state that differs when possible.
      const expected = expectedAfterPick(c.id, before);
      expect(expected).toEqual(oldWriter(c.id, before)); // from the default start the lab is already standard: no difference at all
      const changed = selectControl(c.id, { family });
      expect(changed).toBe(idFor(before, family) !== c.id);
      expect(touched(useGame.getState())).toEqual(expected);
      expect(inputLayerOf(useGame.getState())).toBe(inputLayerOf(expected));
      expect(currentControlId(family)).toBe(c.id);
    });
    it(`${c.id}: same fields as the old writer from a lab-on, twin, mouse start, and the lab cleared for a non-lab pick`, () => {
      const start: ControlFields = { controlLab: 'brush', touchScheme: 'twin', trackpadSteering: 'flow', desktopMode: 'mouse' };
      reset(start);
      const family = firstFamily(c.id), expected = expectedAfterPick(c.id, start), old = oldWriter(c.id, start);
      selectControl(c.id, { family });
      expect(touched(useGame.getState())).toEqual(expected);
      // Every field but the lab matches the old writer; the lab is cleared for a non-lab pick (the one intended difference).
      expect({ ...touched(useGame.getState()), controlLab: 'x' }).toEqual({ ...old, controlLab: 'x' });
      expect(useGame.getState().controlLab).toBe(isLab(c.id) ? c.id : 'standard');
      expect(inputLayerOf(useGame.getState())).toBe(inputLayerOf(expected));
    });
  }
});

describe('selectControl', () => {
  it('releases held input, keeps paused, started, checkpoint and position, and bumps inputEpoch once with the message', () => {
    runtime.keys.add('KeyW'); runtime.trackpad.active = true; runtime.thumb.active = true; runtime.thumb.throttle = 1; runtime.stick.active = true;
    runtime.position.x = 12; runtime.velocity.y = 3;
    const checkpoint = { x: 1, y: 2, z: 3 };
    useGame.setState({ checkpoint, paused: true, started: true, inputEpoch: 4 });
    const seen: { epoch: number; fields: ControlFields; message: string }[] = [];
    const off = useGame.subscribe((s, p) => { if (s.inputEpoch !== p.inputEpoch) seen.push({ epoch: s.inputEpoch, fields: touched(s), message: s.message }); });
    expect(selectControl('flow', { family: 'desktop' })).toBe(true);
    off();
    expect(runtime.keys.size).toBe(0); expect(runtime.trackpad.active).toBe(false); expect(runtime.thumb.active).toBe(false);
    expect(runtime.thumb.throttle).toBe(0); expect(runtime.stick.active).toBe(false);
    expect(runtime.position.x).toBe(12); expect(runtime.velocity.y).toBe(3);
    const s = useGame.getState();
    expect([s.paused, s.started, s.checkpoint]).toEqual([true, true, checkpoint]);
    // One state change carries the settings, the epoch and the message together.
    expect(seen).toEqual([{ epoch: 5, fields: { ...DEFAULT_FIELDS, trackpadSteering: 'flow' }, message: 'Flow controls' }]);
    runtime.position.x = START.x; runtime.velocity.y = 0;
  });
  it('does nothing for the current control or while the vote card is open', () => {
    let notified = 0;
    const off = useGame.subscribe(() => { notified++; });
    expect(selectControl('cursor', { family: 'desktop' })).toBe(false);
    expect(selectControl('one-finger', { family: 'touch' })).toBe(false);
    expect(notified).toBe(0);
    runtime.keys.add('KeyA');
    useGame.setState({ voteOpen: true }); notified = 0;
    expect(selectControl('brush', { family: 'desktop' })).toBe(false);
    expect(touched(useGame.getState())).toEqual(DEFAULT_FIELDS);
    expect(runtime.keys.has('KeyA')).toBe(true); expect(notified).toBe(0);
    expect(saved[STORAGE]).toBeUndefined();
    off(); runtime.keys.clear();
  });
  it('sets runtime.trackpad.unlocking before exitPointerLock, and only when a lock is held', () => {
    const order: string[] = [];
    vi.stubGlobal('document', { pointerLockElement: {}, exitPointerLock: () => { order.push(`exit unlocking=${runtime.trackpad.unlocking}`); } });
    runtime.trackpad.unlocking = false;
    selectControl('captured', { family: 'desktop' });
    expect(order).toEqual(['exit unlocking=true']);
    runtime.trackpad.unlocking = false;
    vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => { order.push('no lock: should not exit'); } });
    selectControl('mouse-keys', { family: 'desktop' });
    expect(order).toHaveLength(1); expect(runtime.trackpad.unlocking).toBe(false);
  });
  it('saves to halaverga-flight-v1, and hydrate derives the same id for every control', () => {
    for (const c of CONTROL_TYPES) {
      const family = firstFamily(c.id);
      reset({ ...DEFAULT_FIELDS, controlLab: c.id === 'draw' ? 'brush' : 'draw', touchScheme: c.id === 'one-finger' ? 'twin' : 'classic',
        trackpadSteering: c.id === 'cursor' ? 'flow' : 'free', desktopMode: 'trackpad' });
      expect(selectControl(c.id, { family })).toBe(true);
      const written = JSON.parse(saved[STORAGE]);
      expect(touched(written)).toEqual(touched(useGame.getState()));
      saveControlFields(DEFAULT_FIELDS); // scramble the live state, then restore from storage
      saved[STORAGE] = JSON.stringify(written);
      hydrateGame();
      expect([c.id, currentControlId(family)]).toEqual([c.id, c.id]);
    }
  });
});

describe('applyControlsQuery', () => {
  for (const c of CONTROL_TYPES) {
    it(`${c.id}: changes the session and leaves the saved choice alone`, () => {
      saved[STORAGE] = JSON.stringify({ controlsVersion: 6, controlLab: 'conduct', touchScheme: 'twin', trackpadSteering: 'captured', desktopMode: 'mouse' });
      hydrateGame(); reset(touched(useGame.getState())); saved[STORAGE] = JSON.stringify(touched(useGame.getState()));
      const stored = touched(useGame.getState());
      applyControlsQuery(c.id);
      expect(touched(useGame.getState())).toEqual({ ...stored, ...settingsFor(c.id) });
      useGame.setState({ camera: 'first' });
      saveControlFields({}); // persist with every pin in place
      expect(touched(JSON.parse(saved[STORAGE]))).toEqual(stored);
    });
  }
  it('accepts standard and ignores anything else', () => {
    reset({ ...DEFAULT_FIELDS, controlLab: 'draw' });
    applyControlsQuery('standard'); expect(useGame.getState().controlLab).toBe('standard');
    for (const junk of ['', 'nope', 'Draw', 'toString', 'draw ', '1']) { applyControlsQuery(junk); expect(useGame.getState().controlLab).toBe('standard'); }
    expect(touched(useGame.getState())).toEqual(DEFAULT_FIELDS);
  });
});
