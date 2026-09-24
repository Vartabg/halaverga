import { afterEach, describe, expect, it, vi } from 'vitest';
import { notePointer, resetPointerMode, touchMode } from '../src/game/pointerMode';
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
