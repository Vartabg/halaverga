import { afterEach, describe, expect, it, vi } from 'vitest';
import { notePointer, onTouchCapable, resetPointerMode, touchCapable, touchMode } from '../src/game/pointerMode';
afterEach(() => { vi.unstubAllGlobals(); resetPointerMode(); });
const media = (coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }));
describe('pointer mode', () => {
  it('falls back to false when matchMedia is missing, and to the coarse-pointer query before any pointer', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(touchMode()).toBe(false);
    resetPointerMode(); media(true); expect(touchMode()).toBe(true);
    resetPointerMode(); media(false); expect(touchMode()).toBe(false);
    resetPointerMode(); vi.stubGlobal('matchMedia', () => { throw new Error('blocked'); }); expect(touchMode()).toBe(false);
  });
  it('creates the media query once and reads its live value (touchMode runs every frame)', () => {
    const list = { matches: false }, spy = vi.fn(() => list);
    vi.stubGlobal('matchMedia', spy);
    for (let i = 0; i < 100; i++) touchMode();
    expect(spy).toHaveBeenCalledTimes(1);
    list.matches = true; expect(touchMode()).toBe(true); expect(spy).toHaveBeenCalledTimes(1);
  });
  it('the last pointer decides: touch and pen are touch, mouse is mouse, anything else is ignored', () => {
    media(false);
    notePointer('touch'); expect(touchMode()).toBe(true);
    notePointer(''); notePointer('eraser'); expect(touchMode()).toBe(true);
    notePointer('mouse'); expect(touchMode()).toBe(false);
    notePointer('pen'); expect(touchMode()).toBe(true);
    expect(touchMode()).toBe(true); // a noted pointer outranks the media query, cached as not coarse (iPad with a trackpad)
    resetPointerMode(); const list = { matches: true }; vi.stubGlobal('matchMedia', () => list);
    notePointer('mouse'); expect(touchMode()).toBe(false);
  });
  it('notePointer returns true only when the effective mode changes', () => {
    media(true);
    expect(notePointer('touch')).toBe(false); // coarse fallback already said touch
    expect(notePointer('pen')).toBe(false);
    expect(notePointer('mouse')).toBe(true);
    expect(notePointer('mouse')).toBe(false);
    expect(notePointer('unknown')).toBe(false);
    expect(notePointer('touch')).toBe(true);
    resetPointerMode(); media(false);
    expect(notePointer('mouse')).toBe(false);
    expect(notePointer('touch')).toBe(true);
  });
});
describe('touch capability', () => {
  const touchPoints = (n: number) => vi.stubGlobal('navigator', { maxTouchPoints: n });
  it('a desktop with no touch points and a fine pointer is never touch, even for a pen', () => {
    touchPoints(0); media(false);
    expect(touchCapable()).toBe(false);
    expect(notePointer('pen')).toBe(false); expect(touchMode()).toBe(false);
    notePointer('mouse'); notePointer('pen'); expect(touchMode()).toBe(false);
  });
  it('a touch laptop (touch points, fine pointer) is capable: mouse first, touch after a pen, mouse again after the mouse', () => {
    touchPoints(5); media(false);
    expect(touchCapable()).toBe(true); expect(touchMode()).toBe(false);
    expect(notePointer('pen')).toBe(true); expect(touchMode()).toBe(true);
    expect(notePointer('mouse')).toBe(true); expect(touchMode()).toBe(false);
  });
  it('a touch pointer latches capability on a device reporting no touch points; reset clears it', () => {
    touchPoints(0); media(false);
    expect(notePointer('touch')).toBe(true);
    expect(touchCapable()).toBe(true); notePointer('mouse'); expect(touchCapable()).toBe(true);
    notePointer('pen'); expect(touchMode()).toBe(true);
    resetPointerMode(); expect(touchCapable()).toBe(false); expect(touchMode()).toBe(false);
  });
  it('notifies a listener once per flip (latch or coarse change) and never after unsubscribe', () => {
    touchPoints(0);
    let change: (() => void) | null = null;
    const list = { matches: false, addEventListener: vi.fn((_: string, fn: () => void) => { change = fn; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => list);
    const fn = vi.fn(), other = vi.fn();
    const off = onTouchCapable(fn), offOther = onTouchCapable(other);
    expect(list.addEventListener).toHaveBeenCalledTimes(1);
    offOther();
    notePointer('mouse'); expect(fn).not.toHaveBeenCalled();
    notePointer('touch'); notePointer('touch'); expect(fn).toHaveBeenCalledTimes(1);
    off(); expect(list.removeEventListener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    resetPointerMode(); touchPoints(0);
    const coarseFn = vi.fn(), offCoarse = onTouchCapable(coarseFn);
    list.matches = true; change!(); change!(); expect(coarseFn).toHaveBeenCalledTimes(1);
    list.matches = false; change!(); expect(coarseFn).toHaveBeenCalledTimes(2);
    offCoarse(); list.matches = true; change!(); expect(coarseFn).toHaveBeenCalledTimes(2);
  });
});
