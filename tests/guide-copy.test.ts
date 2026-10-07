import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// One Controls place: the list of every way to fly lives only in the Controls sheet. Flight settings is for size, left-handed, look speed
// and the rest. Copy that still sends the player to Flight settings to CHOOSE a way to fly would point at a list that is not there, so
// this greps the words (the Field guide is the text alternative to the whole game, and it is the one place with long prose).
const root = new URL('../src/', import.meta.url).pathname;
const read = (file: string) => readFileSync(root + file, 'utf8');
const sources = (dir = ''): string[] => readdirSync(join(root, dir)).flatMap(name => {
  const rel = join(dir, name);
  return statSync(join(root, rel)).isDirectory() ? sources(rel) : /\.(ts|tsx)$/.test(name) ? [rel] : [];
});
/** Sentences of the source text, cut after . ? ! and at tags, so one sentence is one claim. */
const sentences = (text: string) => text.split(/(?<=[.?!])\s+|<\/?(?:p|li|h3)[^>]*>/).map(t => t.trim()).filter(Boolean);
const WAYS = /One finger|Twin stick|Two thumbs|Cursor|Captured|Mouse \+ key|Flow\b|Draw\b|Conduct|Brush/;

describe('the Field guide sends the player to Controls, not to Flight settings, to choose a way to fly', () => {
  const guide = read('ui/FieldGuide.tsx');
  it('never says Touch controls in Flight settings (the old claim that Two thumbs lives there)', () => {
    expect(guide).not.toContain('Touch controls in Flight settings');
    expect(guide).not.toContain('under Touch controls in Flight settings');
  });
  it('no sentence names a way to fly together with Flight settings, and none tells the player to choose, pick or compare there', () => {
    for (const s of sentences(guide)) {
      if (!s.includes('Flight settings')) continue;
      expect(s, s).not.toMatch(WAYS);
      expect(s, s).not.toMatch(/\b(choose|pick|select|compare|switch)\b/i);
    }
  });
  it('says Controls (top row) where it names the place to choose a way to fly', () => {
    expect(guide.match(/Controls \(top row\)/g)!.length).toBeGreaterThanOrEqual(4);
    expect(guide).toContain('Every way of flying is under Controls (top row), and the Controls row on the pause card opens the same list.');
    for (const label of ['One finger + keys', 'Twin stick', 'Mouse + keys']) expect(guide, label).toContain(label);
  });
  it('holds no copy of the list: no LazyControls, no Try every control heading', () => {
    expect(guide).not.toContain('LazyControls'); expect(guide).not.toContain('Try every control');
  });
});

describe('no copy anywhere in src sends the player to Flight settings to choose a way to fly', () => {
  it('no string pairs choose, pick, select or switch with Flight settings in one sentence', () => {
    const hits: string[] = [];
    for (const file of sources()) {
      if (/\.css$/.test(file)) continue;
      // Only quoted strings and JSX text: a // or /* comment may name the place the old way.
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const s of sentences(code)) if (s.includes('Flight settings') && /\b(choose|pick|select|switch)\b/i.test(s)) hits.push(`${file}: ${s.slice(0, 120)}`);
    }
    expect(hits).toEqual([]);
  });
  it('the capture failure names the path: Pause, then Controls', () => {
    expect(read('ui/useTrackpad.ts')).toContain('Mouse capture is unavailable. Pause, then choose Cursor in Controls to continue.');
  });
});
