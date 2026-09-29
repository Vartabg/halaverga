import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_FAMILIES, CONTROL_TYPES, DEFAULT_CONTROL, controlById, controlKey, controlsFor, idFor, isControlFor, isControlId, parseControlParam, settingsFor,
  type ControlFamily, type ControlId,
} from '../src/game/controlTypes';
import type { ControlFields } from '../src/game/store';

const DEFAULT_FIELDS: ControlFields = { controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' };
const ids = (family: ControlFamily) => controlsFor(family).map(c => c.id);

describe('control registry', () => {
  it('has ten unique ids', () => {
    const all = CONTROL_TYPES.map(c => c.id);
    expect(all).toHaveLength(10);
    expect(new Set(all).size).toBe(10);
    for (const id of all) expect(isControlId(id)).toBe(true);
    for (const junk of ['standard', '', 'Draw', null, undefined, 3]) expect(isControlId(junk)).toBe(false);
  });
  it('lists the touch and desktop controls in sheet order', () => {
    expect(ids('touch')).toEqual(['one-finger', 'twin-stick', 'draw', 'conduct', 'brush']);
    expect(ids('desktop')).toEqual(['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush']);
    expect(CONTROL_FAMILIES).toEqual(['touch', 'desktop']);
    expect(isControlFor('draw', 'touch') && isControlFor('draw', 'desktop')).toBe(true);
    expect(isControlFor('flow', 'touch')).toBe(false);
    expect(isControlFor('twin-stick', 'desktop')).toBe(false);
    expect(isControlFor('nope', 'desktop')).toBe(false);
  });
  it('defaults to One finger on touch and Cursor on desktop', () => {
    expect(DEFAULT_CONTROL).toEqual({ touch: 'one-finger', desktop: 'cursor' });
    expect(idFor(DEFAULT_FIELDS, 'touch')).toBe('one-finger');
    expect(idFor(DEFAULT_FIELDS, 'desktop')).toBe('cursor');
  });
  it('has a label, a line of at most 70 characters and a hint of at most 50', () => {
    for (const c of CONTROL_TYPES) {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.line.trim().length).toBeGreaterThan(0);
      expect(c.line.length).toBeLessThanOrEqual(70);
      if (c.hint !== undefined) { expect(c.hint.trim().length).toBeGreaterThan(0); expect(c.hint.length).toBeLessThanOrEqual(50); }
      expect(controlById(c.id)).toBe(c);
    }
  });
  it('makes settingsFor return a copy of the exact patch', () => {
    expect(settingsFor('twin-stick')).toEqual({ controlLab: 'standard', touchScheme: 'twin' });
    expect(settingsFor('mouse-keys')).toEqual({ controlLab: 'standard', desktopMode: 'mouse' });
    expect(settingsFor('flow')).toEqual({ controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'flow' });
    expect(settingsFor('brush')).toEqual({ controlLab: 'brush' });
    const copy = settingsFor('draw'); copy.controlLab = 'brush';
    expect(settingsFor('draw')).toEqual({ controlLab: 'draw' });
  });
  it('round-trips every id through idFor in every family that lists it, and a lab beats the underlying fields', () => {
    for (const c of CONTROL_TYPES) for (const family of c.families) {
      expect([c.id, family, idFor({ ...DEFAULT_FIELDS, ...settingsFor(c.id) }, family)]).toEqual([c.id, family, c.id]);
    }
    for (const lab of ['draw', 'conduct', 'brush'] as const) for (const family of CONTROL_FAMILIES) {
      expect(idFor({ controlLab: lab, touchScheme: 'twin', trackpadSteering: 'flow', desktopMode: 'mouse' }, family)).toBe(lab);
    }
  });
  it('makes idFor total and stable over all field combinations, and lands inside the family list', () => {
    let count = 0;
    for (const touchScheme of ['classic', 'twin'] as const) for (const trackpadSteering of ['free', 'simple', 'flow', 'captured'] as const)
      for (const desktopMode of ['trackpad', 'mouse'] as const) for (const controlLab of ['standard', 'draw', 'conduct', 'brush'] as const)
        for (const family of CONTROL_FAMILIES) {
          const fields: ControlFields = { controlLab, touchScheme, trackpadSteering, desktopMode };
          const id = idFor(fields, family); count++;
          expect(isControlFor(id, family)).toBe(true);
          expect(idFor({ ...fields }, family)).toBe(id);
        }
    expect(count).toBe(128);
  });
  it('parses ?controls=: standard clears only the lab, ids apply their patch, junk is null', () => {
    expect(parseControlParam('standard')).toEqual({ controlLab: 'standard' });
    for (const c of CONTROL_TYPES) expect(parseControlParam(c.id)).toEqual(settingsFor(c.id));
    for (const junk of ['nope', '', null, undefined, 'Draw', 'DRAW', ' draw', 'toString', '__proto__']) expect(parseControlParam(junk)).toBeNull();
  });
  it('formats a vote key as family:id', () => {
    expect(controlKey('touch', 'one-finger')).toBe('touch:one-finger');
    expect(controlKey('desktop', 'draw')).toBe('desktop:draw');
    const seen = new Set<string>();
    for (const c of CONTROL_TYPES) for (const family of c.families) seen.add(controlKey(family, c.id as ControlId));
    expect(seen.size).toBe(13);
  });
  it('imports nothing at runtime: only `import type` from @/game/store', () => {
    const source = readFileSync(new URL('../src/game/controlTypes.ts', import.meta.url), 'utf8');
    const imports = source.split('\n').filter(line => /^\s*(import|export\s.*\sfrom)\s/.test(line) && / from /.test(line));
    expect(imports).toEqual(["import type { ControlFields } from '@/game/store';"]);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
    expect(source.split('\n').length).toBeLessThan(200);
  });
});
