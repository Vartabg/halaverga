import { describe, expect, it } from 'vitest';
import { watchPlayInput } from '@/ui/vote/playInput';

type Fn = (e: unknown) => void;
function setup() {
  const on = new Map<string, Fn>();
  let t = 0;
  const win = { addEventListener: (type: string, fn: Fn) => { on.set(type, fn); }, removeEventListener: (type: string) => { on.delete(type); } };
  const input = watchPlayInput(win as unknown as Window, () => t);
  const fire = (type: string, e: object) => on.get(type)?.(e);
  return { on, input, fire, at: (ms: number) => { t = ms; } };
}
const game = { closest: () => null };
const inDialog = { closest: (sel: string) => (sel.includes('dialog') ? {} : null) };

describe('play input (what counts as playing for the vote)', () => {
  it('nothing has happened: not active', () => {
    const { input } = setup();
    expect(input.active(1e6)).toBe(false);
  });

  it('pointer moves and presses in the game count for 2 s, then stop counting', () => {
    const s = setup();
    s.at(1000); s.fire('pointermove', { target: game });
    expect(s.input.active(2999)).toBe(true);
    expect(s.input.active(3001)).toBe(false);
    s.at(5000); s.fire('wheel', { target: game });
    expect(s.input.active(6000)).toBe(true);
  });

  it('a held key or pointer keeps counting until it is released', () => {
    const s = setup();
    s.at(0); s.fire('keydown', { code: 'KeyW', target: game });
    expect(s.input.active(60_000)).toBe(true);
    s.fire('keyup', { code: 'KeyW', target: inDialog }); // released anywhere
    expect(s.input.active(60_000)).toBe(false);
    s.at(70_000); s.fire('pointerdown', { pointerId: 3, target: game });
    expect(s.input.active(200_000)).toBe(true);
    s.fire('pointercancel', { pointerId: 3 });
    expect(s.input.active(200_000)).toBe(false);
  });

  it('events aimed at dialogs or the header (the sheet, the vote card) and the digit keys do not count', () => {
    const s = setup();
    s.at(1000);
    s.fire('pointermove', { target: inDialog }); s.fire('pointerdown', { pointerId: 1, target: inDialog });
    s.fire('wheel', { target: inDialog }); s.fire('keydown', { code: 'Tab', target: inDialog });
    s.fire('keydown', { code: 'Digit3', target: game }); s.fire('keydown', { code: 'Numpad8', target: game });
    s.fire('pointermove', { target: null });
    expect(s.input.active(1001)).toBe(false);
  });

  it('a blur forgets held keys and pointers, and stop removes every listener', () => {
    const s = setup();
    s.at(0); s.fire('keydown', { code: 'KeyA', target: game }); s.fire('pointerdown', { pointerId: 9, target: game });
    s.fire('blur', {});
    expect(s.input.active(10_000)).toBe(false);
    expect(s.on.size).toBeGreaterThan(0);
    s.input.stop();
    expect(s.on.size).toBe(0);
  });
});
