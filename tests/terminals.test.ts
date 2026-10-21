import { describe, expect, it } from 'vitest';
import { locationName, nearestTerminal, TERMINALS } from '../src/game/navigation';
import arrival from '../src/content/arrival.json';
describe('terminal table', () => {
  it('keeps the primary Watcher tablet discoverable at its authored spot', () => {
    const terminal = nearestTerminal({ x: -7, y: 21, z: 58 });
    expect(terminal?.id).toBe('hermon-oath-01');
    expect(terminal?.location).toBe('Tablet of Semjaza');
    expect(terminal?.record).toBe(arrival);
  });
  it('preserves the previous five-metre proximity boundary', () => {
    expect(nearestTerminal({ x: -2.1, y: 21, z: 58 })?.id).toBe('hermon-oath-01'); // 4.9 metres, inside
    expect(nearestTerminal({ x: -1.9, y: 21, z: 58 })).toBeNull(); // 5.1 metres, outside
    expect(nearestTerminal({ x: 0, y: 40, z: 0 })).toBeNull();
  });
  it('holds one well-formed entry per terminal across the district and open world', () => {
    expect(TERMINALS.map(t => t.id)).toEqual([
      'hermon-oath-01', 'north-core-12', 'west-flats-09', 'east-flats-14', 'south-breach-03',
    ]);
    expect(new Set(TERMINALS.map(terminal => terminal.id)).size).toBe(TERMINALS.length);
    for (const terminal of TERMINALS) {
      expect(terminal.radius).toBeGreaterThan(0);
      expect(terminal.location.length).toBeGreaterThan(0);
      expect(terminal.record.title.length).toBeGreaterThan(0);
      expect(terminal.record.body.length).toBeGreaterThan(0);
    }
  });
  it('names both central district zones and outer open-world regions after the Book of Enoch', () => {
    expect(locationName({ x: 0, y: 21, z: 65 })).toBe('Threshold of Hermon');
    expect(locationName({ x: 0, y: 4, z: 22 })).toBe('Dawn Waters');
    expect(locationName({ x: 0, y: 21, z: 0 })).toBe('Bridge of the Abyss');
    expect(locationName({ x: 30, y: 69, z: -38 })).toBe('Sanctuary of the Throne');
    expect(locationName({ x: 0, y: 30, z: -280 })).toBe('Prison of the Seven Stars');
    expect(locationName({ x: -300, y: 30, z: -40 })).toBe('Western Cleft');
    expect(locationName({ x: 300, y: 30, z: -40 })).toBe('Mount of Simeon');
    expect(locationName({ x: 0, y: 20, z: 180 })).toBe('Gate of Gehenna');
  });
  it('labels every tablet as a cited 1 Enoch quotation and marks the rest as game fiction', () => {
    for (const { record } of TERMINALS) {
      expect(record.kind).toMatch(/^Quoted source · 1 Enoch \d+:\d/);
      expect(record.date).toBe(record.kind.replace('Quoted source · ', ''));
      expect(record.note).toContain('R. H. Charles');
      expect(record.note).toContain('game fiction');
      // 1 Enoch's Ophanim are holy (61:10, 71:7): never the enemy.
      expect(`${record.title} ${record.body}`).not.toMatch(/ophan/i);
    }
  });
});
