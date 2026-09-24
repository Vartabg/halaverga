import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Node environment: history, navigator, matchMedia, document, visualViewport and requestAnimationFrame are stubbed.
const mode = { touch: true };
vi.mock('@/game/pointerMode', () => ({ touchMode: () => mode.touch, notePointer: () => false, resetPointerMode: () => {} }));
vi.mock('@/game/store', async (original) => ({ ...await original<typeof import('../src/game/store')>(), persistGame: vi.fn() }));
type Session = typeof import('../src/ui/playSession');
type Store = typeof import('../src/game/store');
let session: Session, store: Store, frames: Array<() => void>, history: { length: number; state: unknown; pushState: ReturnType<typeof vi.fn>; back: ReturnType<typeof vi.fn> };
const doc = { referrer: '' };
const meta = { content: 'width=device-width, initial-scale=1, viewport-fit=cover',
  getAttribute: vi.fn(() => meta.content), setAttribute: vi.fn((_: string, v: string) => { meta.content = v; }) };
const flush = () => new Promise(r => setTimeout(r, 0));
beforeEach(async () => {
  vi.resetModules(); mode.touch = true; frames = []; meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  history = { length: 2, state: null, pushState: vi.fn((s: unknown) => { history.state = s; history.length++; }), back: vi.fn() };
  doc.referrer = '';
  vi.stubGlobal('history', history);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('visualViewport', { scale: 1 });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frames.push(fn); return frames.length; });
  vi.stubGlobal('document', { get referrer() { return doc.referrer; }, visibilityState: 'visible', querySelector: (sel: string) => (sel === 'meta[name="viewport"]' ? meta : null) });
  vi.stubGlobal('window', { scrollX: 0, scrollY: 0, scrollTo: vi.fn() });
  session = await import('../src/ui/playSession'); store = await import('../src/game/store');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('history sentinel', () => {
  it('arms exactly once in touch mode', () => {
    session.armHistoryGuard(); session.armHistoryGuard();
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.pushState).toHaveBeenCalledWith({ halavergaPlay: 1 }, '');
  });
  it('never arms in a fresh tab with nothing to go back to (QR code, Messages); arms when a referring page could be left', () => {
    history.length = 1; session.armHistoryGuard(); expect(session.onPlayGesture()).toBe(true);
    expect(history.pushState).not.toHaveBeenCalled();
    doc.referrer = 'https://github.com/'; session.armHistoryGuard();
    expect(history.pushState).toHaveBeenCalledTimes(1);
  });
  it('never arms in mouse mode', () => {
    mode.touch = false; session.armHistoryGuard();
    expect(session.onPlayGesture()).toBe(true);
    expect(history.pushState).not.toHaveBeenCalled();
  });
  it('keepPlaying re-arms after a pop and drops the Leave card', () => {
    session.armHistoryGuard(); history.state = null; store.useGame.setState({ leavePrompt: true });
    session.keepPlaying();
    expect(history.pushState).toHaveBeenCalledTimes(2);
    expect(store.useGame.getState().leavePrompt).toBe(false);
  });
  it('leaveGame saves first, then goes back; still here after 400 ms it stays paused with no Leave card', () => {
    vi.useFakeTimers(); store.useGame.setState({ started: true, paused: true, leavePrompt: true });
    session.leaveGame();
    const saved = vi.mocked(store.persistGame);
    expect(saved).toHaveBeenCalledTimes(1); expect(history.back).toHaveBeenCalledTimes(1);
    expect(saved.mock.invocationCallOrder[0]).toBeLessThan(history.back.mock.invocationCallOrder[0]);
    store.useGame.setState({ leavePrompt: true }); vi.advanceTimersByTime(400);
    expect(store.useGame.getState()).toMatchObject({ leavePrompt: false, paused: true });
  });
});

describe('wake lock', () => {
  it('tolerates a missing API', () => {
    expect(() => { session.requestWakeLock(); session.releaseWakeLock(); }).not.toThrow();
  });
  it('tolerates a rejected request and can ask again', async () => {
    const request = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    session.requestWakeLock(); await flush();
    session.requestWakeLock(); await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps one sentinel, releases it on pause and gives back a lock that arrives after release', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ released: false, release }));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    session.requestWakeLock(); await flush(); session.requestWakeLock();
    expect(request).toHaveBeenCalledTimes(1);
    session.releaseWakeLock(); expect(release).toHaveBeenCalledTimes(1);
    session.requestWakeLock(); session.releaseWakeLock(); await flush();
    expect(release).toHaveBeenCalledTimes(2);
  });
});

describe('isStandalone', () => {
  it('is true for display-mode standalone', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }));
    expect(session.isStandalone()).toBe(true);
  });
  it('is true for iOS navigator.standalone', () => {
    vi.stubGlobal('navigator', { standalone: true });
    expect(session.isStandalone()).toBe(true);
  });
  it('is false in a Safari tab', () => { expect(session.isStandalone()).toBe(false); });
});

describe('play gesture and zoom', () => {
  it('refuses to start while pinch-zoomed: tries a zoom reset, no history push, no wake lock', () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    vi.stubGlobal('navigator', { wakeLock: { request } }); vi.stubGlobal('visualViewport', { scale: 1.5 });
    expect(session.onPlayGesture()).toBe(false);
    expect(meta.content).toContain('maximum-scale=1');
    expect(history.pushState).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
    expect(store.useGame.getState().zoomNote).toBe(true);
  });
  it('starts at normal size: scrolls home, asks for the wake lock and arms the guard', () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    const win = { scrollX: 0, scrollY: 40, scrollTo: vi.fn() };
    vi.stubGlobal('navigator', { wakeLock: { request } }); vi.stubGlobal('window', win);
    expect(session.onPlayGesture()).toBe(true);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0); expect(request).toHaveBeenCalledWith('screen');
    expect(history.pushState).toHaveBeenCalledTimes(1);
  });
  it('resetZoom restores the exact original viewport content after two frames', () => {
    const original = meta.content;
    session.resetZoom();
    expect(meta.content).toBe(`${original}, maximum-scale=1`);
    session.resetZoom(); // a second call mid-reset must not save the capped content as the original
    frames.shift()!(); expect(meta.content).toContain('maximum-scale=1');
    frames.shift()!(); expect(meta.content).toBe(original);
    expect(frames).toHaveLength(0);
  });
});
