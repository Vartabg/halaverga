import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPointerMode } from '../src/game/pointerMode';
import { currentFamily, familyOf, onFamily, resetFamily, watchFamily } from '../src/ui/controls/family';

let handlers: { type: string; fn: (e: { pointerType: string }) => void; capture: unknown }[];
const coarse = (matches: boolean) => vi.stubGlobal('matchMedia', () => ({ matches }));
const stubWindow = () => {
  handlers = [];
  vi.stubGlobal('window', { addEventListener: (type: string, fn: (e: { pointerType: string }) => void, capture: unknown) => { handlers.push({ type, fn, capture }); } });
};
beforeEach(() => { resetPointerMode(); resetFamily(); coarse(false); });
afterEach(() => { vi.unstubAllGlobals(); resetPointerMode(); resetFamily(); });

describe('familyOf', () => {
  it('follows touch only on a touch-capable device, mouse always, and ignores pen and unknown pointers', () => {
    coarse(false);
    expect(familyOf('touch', 'desktop')).toBe('desktop');
    expect(familyOf('touch', 'touch')).toBe('touch');
    expect(familyOf('mouse', 'touch')).toBe('desktop');
    expect(familyOf('mouse', 'desktop')).toBe('desktop');
    for (const prev of ['touch', 'desktop'] as const) for (const t of ['pen', '', 'kinect', 'TOUCH']) expect(familyOf(t, prev)).toBe(prev);
    resetPointerMode(); coarse(true);
    expect(familyOf('touch', 'desktop')).toBe('touch');
    expect(familyOf('mouse', 'touch')).toBe('desktop');
    expect(familyOf('pen', 'desktop')).toBe('desktop');
    expect(familyOf('pen', 'touch')).toBe('touch');
  });
});

describe('currentFamily', () => {
  it('starts from touchMode(): a coarse primary pointer is touch, a fine one is desktop', () => {
    coarse(true); expect(currentFamily()).toBe('touch');
    resetPointerMode(); resetFamily(); coarse(false); expect(currentFamily()).toBe('desktop');
  });
});

describe('watchFamily', () => {
  it('installs exactly one window pointerdown capture listener, however often it is called', () => {
    stubWindow();
    watchFamily(); watchFamily(); watchFamily();
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toMatchObject({ type: 'pointerdown', capture: true });
  });
  it('is driven by the event\'s own pointerType and notifies only on a change', () => {
    coarse(true); stubWindow();
    const seen: string[] = [];
    const off = onFamily(f => seen.push(f));
    watchFamily();
    const fire = (pointerType: string) => handlers[0].fn({ pointerType });
    expect(currentFamily()).toBe('touch');
    fire('mouse'); expect(currentFamily()).toBe('desktop');
    fire('mouse'); expect(seen).toEqual(['desktop']);
    fire('pen'); expect(currentFamily()).toBe('desktop');
    fire('touch'); expect(currentFamily()).toBe('touch'); expect(seen).toEqual(['desktop', 'touch']);
    off(); fire('mouse'); expect(currentFamily()).toBe('desktop'); expect(seen).toEqual(['desktop', 'touch']);
  });
  it('ignores touch events on a device that cannot touch', () => {
    coarse(false); stubWindow(); watchFamily();
    handlers[0].fn({ pointerType: 'touch' });
    expect(currentFamily()).toBe('desktop');
  });
  it('installs nothing without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(() => watchFamily()).not.toThrow();
  });
});
