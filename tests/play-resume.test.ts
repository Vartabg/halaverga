import { afterEach, describe, expect, it, vi } from 'vitest';
// resume() is Begin, Resume, Keep playing and closing a dialog: it must answer a "Leave the game?" prompt that a back swipe
// raised while that dialog hid the card, or the next plain pause would show the Leave card instead of the pause card.
afterEach(() => { vi.unstubAllGlobals(); });
describe('resume', () => {
  it('clears a stale Leave prompt along with the pause', async () => {
    vi.stubGlobal('document', { pointerLockElement: null });
    const { resume, pause } = await import('../src/ui/useInput');
    const { useGame } = await import('../src/game/store');
    useGame.setState({ started: true, paused: true, panel: true, leavePrompt: true });
    resume();
    expect(useGame.getState()).toMatchObject({ paused: false, panel: false, leavePrompt: false });
    pause();
    expect(useGame.getState()).toMatchObject({ paused: true, leavePrompt: false });
  });
});
