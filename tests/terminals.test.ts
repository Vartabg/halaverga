import { describe, expect, it } from 'vitest';
import { locationName, nearestTerminal, TERMINALS } from '../src/game/navigation';
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
  it('holds one well-formed entry per terminal across the district and open world', () => {
    expect(TERMINALS.map(t => t.id)).toEqual([
      'municipal-memory-07', 'north-core-12', 'west-flats-09', 'east-flats-14', 'south-breach-03',
    ]);
    expect(new Set(TERMINALS.map(terminal => terminal.id)).size).toBe(TERMINALS.length);
    for (const terminal of TERMINALS) {
      expect(terminal.radius).toBeGreaterThan(0);
      expect(terminal.location.length).toBeGreaterThan(0);
      expect(terminal.record.title.length).toBeGreaterThan(0);
      expect(terminal.record.body.length).toBeGreaterThan(0);
    }
  });
  it('names both central district zones and outer open-world districts accurately', () => {
    expect(locationName({ x: 0, y: 21, z: 65 })).toBe('Arrival terrace');
    expect(locationName({ x: 0, y: 4, z: 22 })).toBe('Flooded boulevard');
    expect(locationName({ x: 0, y: 21, z: 0 })).toBe('Broken viaduct');
    expect(locationName({ x: 30, y: 69, z: -38 })).toBe('Upper skyline');
    expect(locationName({ x: 0, y: 30, z: -280 })).toBe('North core');
    expect(locationName({ x: -300, y: 30, z: -40 })).toBe('West flats');
    expect(locationName({ x: 300, y: 30, z: -40 })).toBe('East flats');
    expect(locationName({ x: 0, y: 20, z: 180 })).toBe('South breach');
  });
});