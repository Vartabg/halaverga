import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
// zustand's hook renders the store's initial state on the server. Here the hook reads the live state instead (same store, same
// setState), so the SSR markup reflects each test's setup.
vi.mock('@/game/store', async importOriginal => {
  const m = await importOriginal<typeof import('@/game/store')>();
  const live = <T,>(sel: (s: ReturnType<typeof m.useGame.getState>) => T) => sel(m.useGame.getState());
  return { ...m, useGame: Object.assign(live, m.useGame) };
});
import { useGame } from '@/game/store';
import { labKeyFor, pickLab, rovingNext, type LabKeyCtx, type LabKeyEvent } from '@/ui/gesture/labBarKeys';
import LabBar from '@/ui/gesture/LabBar';
// Spec 2: the header lab switcher. Node only: the pure key rules, the SSR markup, and the CSS contract. The browser behaviour
// (no pause, no stuck movement, arrows never turning the view, the layout matrix, axe) is tests/lab-bar.spec.ts.

const desk: LabKeyCtx = { touch: false, started: true, panel: false, journal: false, voteOpen: false };
const key = (code: string, over: Partial<LabKeyEvent> = {}): LabKeyEvent =>
  ({ code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, closest: () => null, ...extra }) as unknown as EventTarget;

describe('labKeyFor', () => {
  it('maps Digit1-4 and Numpad1-4 to Standard, Draw, Conduct, Brush when started on desktop', () => {
    const order = ['standard', 'draw', 'conduct', 'brush'];
    [1, 2, 3, 4].forEach((n, i) => {
      expect(labKeyFor(key(`Digit${n}`), desk)).toBe(order[i]);
      expect(labKeyFor(key(`Numpad${n}`), desk)).toBe(order[i]);
      expect(labKeyFor(key(`Digit${n}`, { target: el('BUTTON') }), desk)).toBe(order[i]);
    });
  });
  it('ignores other keys', () => {
    for (const code of ['Digit0', 'Digit5', 'Numpad5', 'KeyW', 'ArrowLeft', 'Space']) expect(labKeyFor(key(code), desk)).toBeNull();
  });
  it('rejects repeats and every modifier', () => {
    expect(labKeyFor(key('Digit1', { repeat: true }), desk)).toBeNull();
    for (const m of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) expect(labKeyFor(key('Digit2', { [m]: true }), desk)).toBeNull();
  });
  it('rejects touch, not started, the panel, the field guide and the vote card', () => {
    for (const over of [{ touch: true }, { started: false }, { panel: true }, { journal: true }, { voteOpen: true }])
      expect(labKeyFor(key('Digit3'), { ...desk, ...over })).toBeNull();
  });
  it('rejects typing fields, editable targets and anything inside a dialog', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) expect(labKeyFor(key('Digit3', { target: el(tag) }), desk)).toBeNull();
    expect(labKeyFor(key('Digit3', { target: el('DIV', { isContentEditable: true }) }), desk)).toBeNull();
    const inDialog = el('BUTTON', { closest: (sel: string) => (sel.includes('dialog') ? {} : null) });
    expect(labKeyFor(key('Digit3', { target: inDialog }), desk)).toBeNull();
  });
});

describe('rovingNext', () => {
  it('wraps at both ends; Home is 0 and End is 3', () => {
    expect(rovingNext(3, 'ArrowRight')).toBe(0);
    expect(rovingNext(3, 'ArrowDown')).toBe(0);
    expect(rovingNext(0, 'ArrowLeft')).toBe(3);
    expect(rovingNext(0, 'ArrowUp')).toBe(3);
    expect(rovingNext(1, 'ArrowRight')).toBe(2);
    expect(rovingNext(2, 'ArrowLeft')).toBe(1);
    expect(rovingNext(2, 'Home')).toBe(0);
    expect(rovingNext(1, 'End')).toBe(3);
    expect(rovingNext(1, 'Enter')).toBeNull();
    expect(rovingNext(1, ' ')).toBeNull();
  });
});

describe('pickLab', () => {
  afterEach(() => useGame.setState({ controlLab: 'standard', message: '', started: false }));
  it('switches, announces, bumps the epoch and never pauses; the current scheme does nothing', () => {
    useGame.setState({ started: true, paused: false, controlLab: 'standard', message: '' });
    const epoch = useGame.getState().inputEpoch;
    expect(pickLab('brush')).toBe(true);
    let g = useGame.getState();
    expect([g.controlLab, g.message, g.paused, g.inputEpoch]).toEqual(['brush', 'Brush controls', false, epoch + 1]);
    useGame.setState({ message: '' });
    expect(pickLab('brush')).toBe(false);
    g = useGame.getState();
    expect([g.message, g.inputEpoch]).toEqual(['', epoch + 1]);
  });
  it('keeps a paused game paused', () => {
    useGame.setState({ started: true, paused: true, controlLab: 'standard' });
    pickLab('conduct');
    expect(useGame.getState().paused).toBe(true);
    expect(useGame.getState().controlLab).toBe('conduct');
  });
});

describe('LabBar markup (SSR)', () => {
  afterEach(() => useGame.setState({ controlLab: 'standard', started: false }));
  it('renders nothing before Begin', () => {
    useGame.setState({ started: false });
    expect(renderToStaticMarkup(createElement(LabBar))).toBe('');
  });
  it('one radiogroup, four radios; aria-checked and tabindex 0 only on the selected scheme', () => {
    useGame.setState({ started: true, controlLab: 'conduct' });
    const html = renderToStaticMarkup(createElement(LabBar));
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Controls"');
    expect(html).toContain('data-testid="lab-bar"');
    const radios = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map(m => m[0]);
    expect(radios).toHaveLength(4);
    const checked = radios.filter(r => r.includes('aria-checked="true"'));
    const focusable = radios.filter(r => r.includes('tabindex="0"'));
    expect(checked).toHaveLength(1); expect(focusable).toHaveLength(1);
    expect(checked[0]).toContain('data-lab="conduct"'); expect(focusable[0]).toContain('data-lab="conduct"');
    expect(radios.filter(r => r.includes('tabindex="-1"'))).toHaveLength(3);
    radios.forEach((r, i) => { expect(r).toContain('type="button"'); expect(r).toContain(`aria-keyshortcuts="${i + 1}"`); });
    for (const name of ['Standard', 'Draw', 'Conduct', 'Brush']) expect(html).toContain(`>${name}<kbd aria-hidden="true"`);
  });
});

describe('LabBar.module.css contract', () => {
  const css = readFileSync(new URL('../src/ui/gesture/LabBar.module.css', import.meta.url), 'utf8');
  it('44 px segments, lime checked state and a visible focus ring', () => {
    expect(css).toMatch(/\.seg\{[^}]*min-width:44px;min-height:44px/);
    expect(css).toMatch(/\.seg\[aria-checked=true\]\{background:var\(--lime\);color:#1a3029/);
    expect(css).toMatch(/\.seg:focus-visible\{outline:2px solid var\(--lime\)/);
  });
  it('key hints only for a fine pointer driving the page on widths over 600 px', () => {
    expect(css).toMatch(/\.kbd\{display:none/);
    expect(css).toContain('@media (pointer:fine) and (min-width:601px){:global(html[data-input=mouse]) .kbd{display:inline-block}}');
  });
  it('transitions only without reduced motion; forced colors use Highlight', () => {
    expect(css.replace(/@media \(prefers-reduced-motion:no-preference\)\{[^\n]*\n/, '')).not.toMatch(/transition/);
    expect(css).toMatch(/@media \(forced-colors:active\)\{[\s\S]*Highlight;color:HighlightText/);
  });
});
