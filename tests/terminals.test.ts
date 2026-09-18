import { describe, expect, it } from 'vitest';
import { nearestTerminal, TERMINALS } from '../src/game/navigation';
import arrival from '../src/content/arrival.json';
describe('terminal table', () => {
  it('keeps the municipal terminal discoverable at its authored spot', () => {
    const terminal = nearestTerminal({ x: -7, y: 21, z: 58 });
    expect(terminal?.id).toBe('municipal-memory-07');
    expect(terminal?.location).toBe('Municipal terminal');
    expect(terminal?.record).toBe(arrival);
  });
  it('preserves the previous five-metre proximity boundary', () => {
    expect(nearestTerminal({ x: -2.1, y: 21, z: 58 })?.id).toBe('municipal-memory-07'); // 4.9 metres, inside
    expect(nearestTerminal({ x: -1.9, y: 21, z: 58 })).toBeNull(); // 5.1 metres, outside
    expect(nearestTerminal({ x: 0, y: 40, z: 0 })).toBeNull();
  });
  it('holds one well-formed entry per terminal', () => {
    expect(new Set(TERMINALS.map(terminal => terminal.id)).size).toBe(TERMINALS.length);
    for (const terminal of TERMINALS) {
      expect(terminal.radius).toBeGreaterThan(0);
      expect(terminal.location.length).toBeGreaterThan(0);
      expect(terminal.record.body.length).toBeGreaterThan(0);
    }
  });
});