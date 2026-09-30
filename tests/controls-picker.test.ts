import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// zustand's hook renders the store's initial state on the server. Here the hook reads the live state instead (same store, same
// setState), so the SSR markup reflects each test's setup.
vi.mock('@/game/store', async importOriginal => {
  const m = await importOriginal<typeof import('@/game/store')>();
  const live = <T,>(sel: (s: ReturnType<typeof m.useGame.getState>) => T) => sel(m.useGame.getState());
  return { ...m, useGame: Object.assign(live, m.useGame) };
});
import { controlsFor } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { livePlay } from '@/ui/vote/voteTracker';
import { controlKeyFor, digitIndex, type ControlKeyCtx, type ControlKeyEvent } from '@/ui/controls/controlKeys';
import ControlList from '@/ui/controls/ControlList';
import ControlsEntry from '@/ui/controls/ControlsEntry';
import ControlsPicker from '@/ui/controls/ControlsPicker';
import ControlsSection from '@/ui/controls/ControlsSection';
import ControlsSheet from '@/ui/controls/ControlsSheet';
// The controls picker (spec sections 3 and 4). Node only: pure key rules, the SSR markup, the storage helpers and the CSS contract.
// The behaviour a player sees (digits mounting layers, no shot or pause from the sheet, layout matrix, axe) is tests/controls-picker.spec.ts.

const css = readFileSync(new URL('../src/ui/controls/ControlsPicker.module.css', import.meta.url), 'utf8');
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const rowsOf = (markup: string) => markup.split('<label').slice(1).map(r => r.split('</label>')[0]);
const idsOf = (markup: string) => [...markup.matchAll(/data-control="([^"]+)"/g)].map(m => m[1]);
const noop = () => {};

const fresh = () => useGame.setState({ started: false, paused: false, voteOpen: false, controlLab: 'standard', touchScheme: 'classic',
  trackpadSteering: 'free', desktopMode: 'trackpad' });
const seedPlay = (secs: Record<string, number>) => { const p = livePlay(); for (const k of Object.keys(p.secs)) p.secs[k] = secs[k] ?? 0; };
afterEach(() => { fresh(); seedPlay({}); });

const desk: ControlKeyCtx = { started: true, panel: false, journal: false, voteOpen: false };
const key = (code: string, over: Partial<ControlKeyEvent> = {}): ControlKeyEvent =>
  ({ code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, closest: () => null, ...extra }) as unknown as EventTarget;
const ORDER = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];

describe('trigger (SSR)', () => {
  it('renders nothing before Begin', () => {
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).toBe('');
  });
  it('says Controls: One finger on touch and Controls: Cursor on desktop, closed, with aria-haspopup', () => {
    useGame.setState({ started: true });
    const touch = html(createElement(ControlsPicker, { family: 'touch' })), desktop = html(createElement(ControlsPicker, { family: 'desktop' }));
    expect(touch).toContain('>Controls: One finger</button>');
    expect(desktop).toContain('>Controls: Cursor</button>');
    for (const m of [touch, desktop]) {
      expect(m).toContain('aria-haspopup="dialog"'); expect(m).toContain('aria-expanded="false"');
      expect(m).toContain('data-testid="controls-trigger"'); expect(m).not.toContain('role="dialog"');
    }
  });
  it('names the current control whatever the settings are', () => {
    useGame.setState({ started: true, touchScheme: 'twin' });
    expect(html(createElement(ControlsPicker, { family: 'touch' }))).toContain('Controls: Twin stick');
    useGame.setState({ trackpadSteering: 'simple' });
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).toContain('Controls: One finger + keys');
    useGame.setState({ desktopMode: 'mouse' });
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).toContain('Controls: Mouse + keys');
    useGame.setState({ controlLab: 'brush' });
    expect(html(createElement(ControlsPicker, { family: 'touch' }))).toContain('Controls: Brush');
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).toContain('Controls: Brush');
  });
});

describe('ControlList (SSR)', () => {
  it('lists exactly the family rows in registry order, five on touch and eight on desktop', () => {
    const touch = html(createElement(ControlList, { family: 'touch', name: 'g' })), desktop = html(createElement(ControlList, { family: 'desktop', name: 'g' }));
    expect(idsOf(touch)).toEqual(['one-finger', 'twin-stick', 'draw', 'conduct', 'brush']);
    expect(idsOf(desktop)).toEqual(ORDER);
    expect(idsOf(desktop)).toEqual(controlsFor('desktop').map(c => c.id));
  });
  it('one fieldset with the legend Controls, and native radios that share one name', () => {
    const m = html(createElement(ControlList, { family: 'desktop', name: 'pick' }));
    expect(m.match(/<fieldset/g)).toHaveLength(1);
    expect(m).toMatch(/<legend[^>]*>Controls<\/legend>/);
    const radios = [...m.matchAll(/<input[^>]*>/g)].map(r => r[0]);
    expect(radios).toHaveLength(8);
    radios.forEach(r => { expect(r).toContain('type="radio"'); expect(r).toContain('name="pick"'); });
  });
  it('checks the radio of the derived current id, and only that one', () => {
    const at = (family: 'touch' | 'desktop') => rowsOf(html(createElement(ControlList, { family, name: 'g' })))
      .filter(r => /<input[^>]*checked/.test(r)).map(r => /data-control="([^"]+)"/.exec(r)![1]);
    expect(at('touch')).toEqual(['one-finger']); expect(at('desktop')).toEqual(['cursor']);
    useGame.setState({ touchScheme: 'twin', trackpadSteering: 'flow' });
    expect(at('touch')).toEqual(['twin-stick']); expect(at('desktop')).toEqual(['flow']);
    useGame.setState({ desktopMode: 'mouse' });
    expect(at('desktop')).toEqual(['mouse-keys']);
    useGame.setState({ controlLab: 'conduct' });
    expect(at('touch')).toEqual(['conduct']); expect(at('desktop')).toEqual(['conduct']);
  });
  it('shows the Default badge on One finger (touch) and Cursor (desktop) only', () => {
    const badged = (family: 'touch' | 'desktop') => rowsOf(html(createElement(ControlList, { family, name: 'g' })))
      .filter(r => r.includes('data-badge="default"')).map(r => /data-control="([^"]+)"/.exec(r)![1]);
    expect(badged('touch')).toEqual(['one-finger']); expect(badged('desktop')).toEqual(['cursor']);
    expect(html(createElement(ControlList, { family: 'touch', name: 'g' }))).toContain('>Default</span>');
  });
  it('shows the Tried badge exactly for controls with 20 s of played input in that family', () => {
    seedPlay({ 'desktop:draw': 25, 'desktop:brush': 20, 'desktop:flow': 19, 'touch:twin-stick': 40 });
    const tried = (family: 'touch' | 'desktop') => rowsOf(html(createElement(ControlList, { family, name: 'g' })))
      .filter(r => r.includes('data-badge="tried"')).map(r => /data-control="([^"]+)"/.exec(r)![1]);
    expect(tried('desktop')).toEqual(['draw', 'brush']);
    expect(tried('touch')).toEqual(['twin-stick']);
    seedPlay({});
    expect(tried('desktop')).toEqual([]);
  });
  it('gives each row a label, its line, aria-keyshortcuts 1-8 and a kbd hint on desktop only', () => {
    const touch = html(createElement(ControlList, { family: 'touch', name: 'g' })), desktop = html(createElement(ControlList, { family: 'desktop', name: 'g' }));
    expect(touch).not.toContain('<kbd'); expect(touch).not.toContain('aria-keyshortcuts');
    expect([...desktop.matchAll(/<kbd[^>]*>(\d)<\/kbd>/g)].map(m => m[1])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect([...desktop.matchAll(/aria-keyshortcuts="(\d)"/g)].map(m => m[1])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    desktop.match(/<kbd[^>]*>/g)!.forEach(k => expect(k).toContain('aria-hidden="true"'));
    for (const c of controlsFor('desktop')) { expect(desktop).toContain(`>${c.label}</b>`); expect(desktop).toContain(c.line); if (c.hint) expect(desktop).toContain(c.hint); }
    for (const r of rowsOf(desktop)) expect(r).toContain('aria-hidden="true"'); // the glyph is decoration
  });
});

describe('ControlsSheet and ControlsSection (SSR)', () => {
  it('the sheet is a non-modal dialog named Controls with the tried line, Vote and Done', () => {
    const touch = html(createElement(ControlsSheet, { family: 'touch', onClose: noop }));
    expect(touch).toContain('role="dialog"'); expect(touch).toContain('aria-modal="false"');
    expect(touch).toMatch(/aria-labelledby="([^"]+)"/); expect(touch).toContain('>Controls</h2>');
    expect(touch).toContain('Tried 0 of 2 needed to vote'); expect(touch).toContain('aria-live="polite"');
    expect(touch).toContain('>Vote: which felt best?</button>'); expect(touch).toContain('>Done</button>');
    expect(touch).not.toContain('Number keys 1-8');
    const desktop = html(createElement(ControlsSheet, { family: 'desktop', onClose: noop }));
    expect(desktop).toContain('Tried 0 of 2 needed to vote'); expect(desktop).toContain('Number keys 1-8 switch controls');
    expect(desktop).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });
  it('Tried X of N counts the seeded play', () => {
    seedPlay({ 'desktop:cursor': 30, 'desktop:draw': 21, 'desktop:flow': 5 });
    expect(html(createElement(ControlsSheet, { family: 'desktop', onClose: noop }))).toContain('Tried 2 of 8');
  });
  it('the section carries the Try every control heading only for the field guide, in a details that starts open on the server', () => {
    const guide = html(createElement(ControlsSection, { name: 'control-guide' })), pause = html(createElement(ControlsSection, { name: 'control-pause' }));
    expect(guide).toContain('>Try every control</h3>'); expect(pause).not.toContain('Try every control');
    expect(guide).toMatch(/<details[^>]*open/); expect(guide).toContain('<summary>Controls: Cursor</summary>');
    expect(idsOf(guide)).toEqual(ORDER); expect(guide).toContain('name="control-guide"'); expect(pause).toContain('name="control-pause"');
    expect(guide).toContain('Tried 0 of 8'); expect(guide).not.toContain('needed to vote'); // CODE-9: no vote door in the Field guide, so no "needed to vote"
    expect(pause).toContain('Tried 0 of 2 needed to vote'); // the pause card has a vote door in its section, so its line may say what a vote needs
    expect(guide).toContain('Number keys 1-8 switch controls');
    expect(guide).not.toContain('controls-vote'); // no vote button unless asked
    expect(html(createElement(ControlsSection, { name: 'control-settings', vote: true }))).toContain('data-testid="controls-vote"');
  });
  it('the entry mounts the note or the trigger, and the trigger part waits for Begin', () => {
    expect(html(createElement(ControlsEntry, { part: 'note' }))).toContain('role="note"');
    expect(html(createElement(ControlsEntry, { part: 'trigger' }))).toBe('');
    useGame.setState({ started: true });
    expect(html(createElement(ControlsEntry, { part: 'trigger' }))).toContain('Controls: Cursor');
    expect(html(createElement(ControlsEntry, { part: 'trigger', failed: true }))).toBe('');
  });
});

describe('controlKeyFor', () => {
  it('maps Digit1-8 and Numpad1-8 to the desktop order: Cursor is 1 and Brush is 8', () => {
    ORDER.forEach((id, i) => {
      expect(controlKeyFor(key(`Digit${i + 1}`), desk, 'desktop', true)).toBe(id);
      expect(controlKeyFor(key(`Numpad${i + 1}`), desk, 'desktop', true)).toBe(id);
      expect(controlKeyFor(key(`Digit${i + 1}`, { target: el('BUTTON') }), desk, 'desktop', true)).toBe(id);
    });
  });
  it('ignores 9, 0 and every other key', () => {
    for (const code of ['Digit0', 'Digit9', 'Numpad9', 'KeyW', 'ArrowLeft', 'Space']) expect(controlKeyFor(key(code), desk, 'desktop', true)).toBeNull();
  });
  it('rejects touch, a game not started, the panel, the guide and the vote card', () => {
    expect(controlKeyFor(key('Digit3'), desk, 'touch', true)).toBeNull();
    for (const over of [{ started: false }, { panel: true }, { journal: true }, { voteOpen: true }])
      expect(controlKeyFor(key('Digit3'), { ...desk, ...over }, 'desktop', true)).toBeNull();
  });
  it('rejects repeats and every modifier', () => {
    expect(controlKeyFor(key('Digit1', { repeat: true }), desk, 'desktop', true)).toBeNull();
    for (const m of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) expect(controlKeyFor(key('Digit2', { [m]: true }), desk, 'desktop', true)).toBeNull();
  });
  it('rejects typing fields, editable targets and anything inside a dialog', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) expect(controlKeyFor(key('Digit3', { target: el(tag) }), desk, 'desktop', true)).toBeNull();
    expect(controlKeyFor(key('Digit3', { target: el('DIV', { isContentEditable: true }) }), desk, 'desktop', true)).toBeNull();
    const inDialog = el('BUTTON', { closest: (sel: string) => (sel.includes('dialog') ? {} : null) });
    expect(controlKeyFor(key('Digit3', { target: inDialog }), desk, 'desktop', true)).toBeNull();
  });
  it('does nothing while the shortcut preference is off', () => {
    expect(controlKeyFor(key('Digit3'), desk, 'desktop', false)).toBeNull();
  });
  it('digitIndex stays below the list size', () => {
    expect(digitIndex('Digit1', 5)).toBe(0); expect(digitIndex('Numpad5', 5)).toBe(4);
    expect(digitIndex('Digit6', 5)).toBeNull(); expect(digitIndex('Digit0', 8)).toBeNull(); expect(digitIndex('KeyA', 8)).toBeNull();
  });
});

type Fake = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem?: (k: string) => void };
const memoryStorage = (): Fake & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};
const throwing: Fake = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('keysPref', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  it('is on by default; off is stored under its own key and read back', async () => {
    const store = memoryStorage(); vi.stubGlobal('localStorage', store);
    const m = await import('@/ui/controls/keysPref');
    expect(m.keysEnabled()).toBe(true);
    m.setKeysEnabled(false);
    expect(store.data['halaverga.controls.keys.v1']).toBe('off'); expect(m.keysEnabled()).toBe(false);
    m.setKeysEnabled(true);
    expect(m.keysEnabled()).toBe(true);
    vi.resetModules(); // a new page load reads the stored value
    store.data['halaverga.controls.keys.v1'] = 'off';
    expect((await import('@/ui/controls/keysPref')).keysEnabled()).toBe(false);
  });
  it('with storage that throws it never throws, defaults to on, and still honours the choice for this page', async () => {
    vi.stubGlobal('localStorage', throwing);
    const m = await import('@/ui/controls/keysPref');
    expect(m.keysEnabled()).toBe(true);
    expect(() => m.setKeysEnabled(false)).not.toThrow();
    expect(m.keysEnabled()).toBe(false);
  });
  it('with no storage at all it is on', async () => {
    vi.stubGlobal('localStorage', undefined);
    expect((await import('@/ui/controls/keysPref')).keysEnabled()).toBe(true);
  });
});

describe('DemoNote', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  const render = async () => html(createElement((await import('@/ui/controls/DemoNote')).default));
  it('shows the exact copy and a Got it button on the first visit', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const m = await render();
    expect(m).toContain('A demo of new ways to fly. After you begin, try each in the Controls menu, then vote.');
    expect(m).toContain('role="note"'); expect(m).toContain('>Got it</button>');
  });
  it('stays away once dismissed, and dismissal is stored under its own key', async () => {
    const store = memoryStorage(); vi.stubGlobal('localStorage', store);
    (await import('@/ui/controls/demoSeen')).markDemoSeen();
    expect(store.data['halaverga.controls.demo.v1']).toBe('1');
    vi.resetModules();
    expect(await render()).toBe('');
  });
  it('with storage that throws it still shows, and dismissing holds for the page without throwing', async () => {
    vi.stubGlobal('localStorage', throwing);
    const seen = await import('@/ui/controls/demoSeen');
    expect(seen.demoSeen()).toBe(false);
    expect(() => seen.markDemoSeen()).not.toThrow();
    expect(seen.demoSeen()).toBe(true);
    vi.resetModules(); vi.stubGlobal('localStorage', throwing);
    expect(await render()).toContain('role="note"');
  });
});

describe('ControlsPicker.module.css contract', () => {
  it('rows and every button are at least 44 px', () => {
    expect(css).toMatch(/\.row\{[^}]*min-height:(4[4-9]|[5-9]\d)px/);
    expect(css).toMatch(/\.trigger\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.action\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.demo button\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.switch button\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.check\{[^}]*min-height:44px/);
  });
  it('the sheet sits under the header inside the safe areas and scrolls; the footer is sticky', () => {
    expect(css).toContain('--top:calc(max(28px,env(safe-area-inset-top)) + 56px + var(--lab-row,0px))');
    expect(css).toContain('--top:calc(max(20px,env(safe-area-inset-top)) + 56px + var(--lab-row,0px))');
    expect(css).toContain('--top:calc(max(12px,env(safe-area-inset-top)) + 56px + var(--lab-row,0px))');
    expect(css).toMatch(/\.sheet\{[^}]*max-height:calc\(100dvh - var\(--top\) - max\(8px,env\(safe-area-inset-bottom\)\)/);
    expect(css).toMatch(/\.sheet\{[^}]*overflow-y:auto;overscroll-behavior:contain/);
    expect(css).toMatch(/\.sheet\{[^}]*touch-action:pan-y/);
    expect(css).toMatch(/\.sheet\{[^}]*env\(safe-area-inset-left\),env\(safe-area-inset-right\)/);
    expect(css).toMatch(/\.foot\{position:sticky;bottom:0;[^}]*background:#132a30/);
  });
  it('checked rows and buttons are dark on lime; the trigger is ink on the dark pill; focus is visible', () => {
    expect(css).toMatch(/\.trigger\[aria-expanded=true\]\{background:var\(--lime\);color:#1a3029/);
    expect(css).toMatch(/\.trigger\{[^}]*background:#142d34c9/);
    expect(css).toMatch(/\.badge\[data-badge=tried\]\{background:var\(--lime\)[^}]*color:#1a3029/);
    expect(css).toMatch(/\.trigger:focus-visible\{outline:2px solid var\(--lime\)/);
    expect(css).toMatch(/\.row:has\(\.radio:focus-visible\)\{outline:3px solid var\(--lime\)/);
  });
  it('key hints only for a fine pointer driving the page on widths over 600 px', () => {
    expect(css).toMatch(/\.kbd\{display:none/);
    expect(css).toContain('@media (pointer:fine) and (min-width:601px){:global(html[data-input=mouse]) .kbd{display:inline-block}}');
  });
  it('transitions and the glyph loop exist only without reduced motion', () => {
    const rest = css.replace(/@media \(prefers-reduced-motion:no-preference\)\{[^\n]*\n/g, '');
    expect(rest).not.toMatch(/transition/); expect(rest).not.toMatch(/animation/);
    expect(css).toMatch(/\.glyph:not\(\[data-reduced=true\]\) \.glyphInk/);
  });
  it('forced colors use system colours and Highlight', () => {
    expect(css).toMatch(/@media \(forced-colors:active\)\{[\s\S]*Highlight;color:HighlightText/);
    expect(css).toMatch(/forced-colors:active[\s\S]*\.sheet,\.demo\{border-color:CanvasText;background:Canvas/);
  });
  it('the demo note is hidden on short landscape screens', () => {
    expect(css).toContain('@media(max-height:430px) and (orientation:landscape){.demo{display:none}}');
  });
  it('the backdrop takes the presses under the sheet and the trigger sits above it', () => {
    expect(css).toMatch(/\.backdrop\{position:fixed;inset:0;z-index:0/);
    expect(css).toMatch(/\.trigger\{position:relative;z-index:2/);
    expect(css).toMatch(/\.sheet\{[^}]*z-index:1/);
  });
});
