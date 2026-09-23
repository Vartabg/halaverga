import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../src/game/store';
// The landing-side blaster audio gate: nothing is created or changed while the blaster is off or muted, and a running
// context is suspended on mute / pause / hidden tab and closed when the blaster turns off.
const contexts: FakeContext[] = [];
class FakeContext {
  state = 'running'; resumes = 0; suspends = 0; closes = 0;
  constructor() { contexts.push(this); }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
}
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
const { blasterContext, quietBlasterAudio, releaseBlasterAudio, unlockBlasterAudio } = await import('../src/ui/audioUnlock');
let audioSession: { type: string };
const last = () => contexts[contexts.length - 1];

describe('blaster audio unlock gate', () => {
  beforeEach(() => {
    contexts.length = 0; audioSession = { type: 'auto' }; vi.stubGlobal('navigator', { audioSession });
    useGame.setState({ shooter: true, muted: false, started: true, paused: false });
  });
  afterEach(() => { releaseBlasterAudio(); vi.unstubAllGlobals(); useGame.setState({ shooter: true, muted: true, started: false, paused: true }); });

  it('creates nothing and leaves the session alone while the blaster is off, muted or not', () => {
    useGame.setState({ shooter: false, muted: false }); unlockBlasterAudio();
    useGame.setState({ muted: true }); unlockBlasterAudio();
    expect(contexts).toHaveLength(0); expect(audioSession.type).toBe('auto'); expect(blasterContext()).toBeNull();
  });

  it('creates nothing while muted with the blaster on', () => {
    useGame.setState({ muted: true }); unlockBlasterAudio();
    expect(contexts).toHaveLength(0); expect(audioSession.type).toBe('auto');
  });

  it('unlocks once, then suspends and hands the session back on mute', () => {
    unlockBlasterAudio(); expect(contexts).toHaveLength(1); expect(audioSession.type).toBe('playback');
    useGame.setState({ muted: true });
    expect(last().suspends).toBe(1); expect(last().state).toBe('suspended'); expect(audioSession.type).toBe('auto');
    useGame.setState({ muted: false }); unlockBlasterAudio();
    expect(contexts).toHaveLength(1); expect(last().state).toBe('running'); expect(audioSession.type).toBe('playback');
  });

  it('suspends on pause and on leaving the expedition; the next gesture resumes the same context', () => {
    unlockBlasterAudio(); useGame.setState({ paused: true });
    expect(last().state).toBe('suspended'); expect(audioSession.type).toBe('auto');
    unlockBlasterAudio(); useGame.setState({ paused: false });
    expect(last().state).toBe('running'); expect(contexts).toHaveLength(1);
    useGame.setState({ started: false }); expect(last().state).toBe('suspended');
  });

  it('closes the context and restores the session when the blaster turns off', () => {
    unlockBlasterAudio(); const c = last();
    useGame.setState({ shooter: false });
    expect(c.closes).toBe(1); expect(blasterContext()).toBeNull(); expect(audioSession.type).toBe('auto');
    unlockBlasterAudio(); expect(contexts).toHaveLength(1);
    useGame.setState({ shooter: true }); unlockBlasterAudio(); expect(contexts).toHaveLength(2);
  });

  it('quiet only restores a session it set, and survives a missing suspend or audioSession', () => {
    audioSession.type = 'play-and-record'; quietBlasterAudio(); expect(audioSession.type).toBe('play-and-record');
    vi.stubGlobal('navigator', {}); unlockBlasterAudio();
    (last() as { suspend?: unknown }).suspend = undefined;
    expect(() => quietBlasterAudio()).not.toThrow();
    vi.stubGlobal('navigator', { get audioSession() { throw new Error('blocked'); } });
    expect(() => { unlockBlasterAudio(); quietBlasterAudio(); releaseBlasterAudio(); }).not.toThrow();
  });
});
