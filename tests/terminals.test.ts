import { describe, expect, it } from 'vitest';
import { locationName, nearestTerminal, TERMINALS } from '../src/game/navigation';
import arrival from '../src/content/arrival.json';
describe('terminal table', () => {
  it('keeps the primary Watcher tablet discoverable at its authored spot', () => {
    const terminal = nearestTerminal({ x: -7, y: 21, z: 58 });
    expect(terminal?.id).toBe('hermon-oath-01');
    expect(terminal?.location).toBe('Tablet of Semjaza');
    expect(terminal?.record).toBe(arrival);
    expect(terminal?.record.locationId).toBe('hermon-threshold');
  });
  it('keeps Dudael in the western tablet’s separate source passage', () => {
    const tablet = nearestTerminal({ x: -230, y: 18, z: -40 })!;
    expect(tablet.record.date).toBe('1 Enoch 10:4–5');
    expect(tablet.record.title).toBe('The Binding in Dudael');
    expect(tablet.record.body).toContain('Dûdâêl');
    expect(tablet.record.note).toContain('pilot reads it on Hermon');
  });
  it('preserves the previous five-metre proximity boundary', () => {
    expect(nearestTerminal({ x: -2.1, y: 21, z: 58 })?.id).toBe('hermon-oath-01'); // 4.9 metres, inside
    expect(nearestTerminal({ x: -1.9, y: 21, z: 58 })).toBeNull(); // 5.1 metres, outside
    expect(nearestTerminal({ x: 0, y: 40, z: 0 })).toBeNull();
  });
  it('holds one well-formed entry per terminal on the summit and outer ridges', () => {
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
  it('names the summit route and its outer ridges', () => {
    expect(locationName({ x: 0, y: 21, z: 65 })).toBe('Threshold of Hermon');
    expect(locationName({ x: 0, y: 4, z: 22 })).toBe('Lower Gorge');
    expect(locationName({ x: 0, y: 21, z: 0 })).toBe('Cloven Arch');
    expect(locationName({ x: 30, y: 69, z: -38 })).toBe('Sanctuary of the Throne');
    expect(locationName({ x: 0, y: 30, z: -280 })).toBe('Northern Ridge');
    expect(locationName({ x: -300, y: 30, z: -40 })).toBe('Western Cleft');
    expect(locationName({ x: 300, y: 30, z: -40 })).toBe('Eastern Ridge');
    expect(locationName({ x: 0, y: 20, z: 180 })).toBe('Southern Saddle');
  });
  it('labels every tablet as a cited quotation and marks the rest as game fiction', () => {
    for (const { record } of TERMINALS) {
      expect(record.kind).toMatch(/^Quoted source · (1 Enoch|Revelation) \d+:\d/);
      expect(record.date).toBe(record.kind.replace('Quoted source · ', ''));
      expect(record.note).toMatch(/R. H. Charles|World English Bible/);
      expect(record.note).toContain('game fiction');
      // 1 Enoch's Ophanim are holy (61:10, 71:7): never the enemy.
      expect(`${record.title} ${record.body}`).not.toMatch(/ophan/i);
    }
  });
});
