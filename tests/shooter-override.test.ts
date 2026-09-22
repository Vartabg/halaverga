import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overrideShooter, persistGame, useGame } from '../src/game/store';
import { clearShooterFault, shooterFault } from '../src/game/shooterFault';
// ?shooter=0/1 and a blaster fault change the setting for this session only; a later save keeps the stored choice.
const saved: Record<string, string> = {}, STORAGE = 'halaverga-flight-v1';
const stored = () => JSON.parse(saved[STORAGE]).shooter;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved[k] ?? null, setItem: (k: string, v: string) => { saved[k] = v; } });
  useGame.setState({ shooter: true });
  persistGame();
});
afterEach(() => { vi.unstubAllGlobals(); clearShooterFault(); delete saved[STORAGE]; });
describe('session shooter override', () => {
  it('is not saved by later saves until the player changes the setting', () => {
    overrideShooter(false);
    expect(useGame.getState().shooter).toBe(false);
    persistGame(); expect(stored()).toBe(true);
    useGame.setState({ shooter: true }); persistGame(); expect(stored()).toBe(true);
    useGame.setState({ shooter: false }); persistGame(); expect(stored()).toBe(false);
  });
  it('keeps a fault for this session only', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    shooterFault('test', new Error('boom'));
    expect(useGame.getState().shooter).toBe(false);
    persistGame(); expect(stored()).toBe(true);
    overrideShooter(true); persistGame(); expect(stored()).toBe(true);
    error.mockRestore();
  });
});
