import { afterEach, describe, expect, it, vi } from 'vitest';
import { headerBand, readInsets, viewportBox } from '../src/ui/touchInsets';
// The touch layer's screen geometry: the visual viewport box (with a fallback), safe-area insets from the probe's padding, and the
// band under the header where touches may start.
afterEach(() => { vi.unstubAllGlobals(); });
describe('viewportBox', () => {
  it('uses the visual viewport (offset and size) when present', () => {
    vi.stubGlobal('window', { visualViewport: { offsetLeft: 12, offsetTop: 30, width: 700, height: 320 }, innerWidth: 852, innerHeight: 393 });
    expect(viewportBox()).toEqual({ x: 12, y: 30, w: 700, h: 320 });
  });
  it('falls back to the inner size without a visual viewport, or with an empty one', () => {
    vi.stubGlobal('window', { innerWidth: 852, innerHeight: 393 });
    expect(viewportBox()).toEqual({ x: 0, y: 0, w: 852, h: 393 });
    vi.stubGlobal('window', { visualViewport: { offsetLeft: 0, offsetTop: 0, width: 0, height: 0 }, innerWidth: 393, innerHeight: 852 });
    expect(viewportBox()).toEqual({ x: 0, y: 0, w: 393, h: 852 });
  });
});
describe('readInsets', () => {
  it('reads the probe padding and treats junk as zero', () => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '0px', paddingRight: '47px', paddingBottom: '21px', paddingLeft: 'auto' }));
    expect(readInsets({} as HTMLElement)).toEqual({ top: 0, right: 47, bottom: 21, left: 0 });
  });
  it('is all zero without a probe', () => {
    expect(readInsets(null)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
describe('headerBand', () => {
  it('is the header bottom in box coordinates plus 8 px', () => {
    vi.stubGlobal('document', { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 72, height: 44 }) }) });
    expect(headerBand({ y: 0 }, 0)).toBe(80);
    expect(headerBand({ y: 30 }, 0)).toBe(50);
  });
  it('falls back to 44 px under the top inset when the header is missing or collapsed', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(headerBand({ y: 0 }, 0)).toBe(52);
    expect(headerBand({ y: 0 }, 59)).toBe(111);
    vi.stubGlobal('document', { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 0, height: 0 }) }) });
    expect(headerBand({ y: 0 }, 20)).toBe(72);
  });
});
