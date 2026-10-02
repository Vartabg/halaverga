import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsBoot from '@/app/AnalyticsBoot';
import { API_CSP, COMMON_CSP, securityHeaders } from '@/config/securityHeaders';
import { controlKey } from '@/game/controlTypes';
import { SCRIPT_SRC, TRACK_BOOT } from '@/lib/trackBoot';

// Anonymous funnel counts: the allowlist, the opt-out, the boot script and the three vote-owned call sites. Browser globals are
// stubbed per test, and the module is re-imported each time because track() sends each stage once per page load.
const read = (f: string) => readFileSync(f, 'utf8');
const VENDOR_SIDE = ['src/lib/track.ts', 'src/lib/trackBoot.ts']; // the only two files that talk to the vendor queue
const STAGE_NAMES = ['begin', 'scene_ready', 'second_way_20s', 'vote_card_shown', 'vote_sent'];
type Env = { navigator?: Record<string, unknown>; window?: Record<string, unknown> };
/** The browser states the opt-out must read the same way in track.ts and in the boot script. */
const OPT_OUT: Array<[string, Env, boolean]> = [
  ['nothing sent', {}, false],
  ['doNotTrack 1', { navigator: { doNotTrack: '1' } }, true],
  ['doNotTrack yes (older Firefox)', { navigator: { doNotTrack: 'yes' } }, true],
  ['doNotTrack 0', { navigator: { doNotTrack: '0' } }, false],
  ['doNotTrack unspecified', { navigator: { doNotTrack: 'unspecified' } }, false],
  ['window.doNotTrack 1 (older Safari)', { window: { doNotTrack: '1' } }, true],
  ['msDoNotTrack 1', { navigator: { msDoNotTrack: '1' } }, true],
  ['Global Privacy Control', { navigator: { globalPrivacyControl: true } }, true],
  ['Global Privacy Control false', { navigator: { globalPrivacyControl: false } }, false],
];

function fakeBrowser(env: Env = {}) {
  const calls: unknown[][] = [], appended: Array<Record<string, unknown>> = [];
  const win: Record<string, unknown> = { ...env.window };
  const doc = { createElement: () => ({} as Record<string, unknown>), head: { appendChild: (el: Record<string, unknown>) => { appended.push(el); } } };
  return { calls, appended, win, nav: { ...env.navigator }, doc, spy: (...a: unknown[]) => { calls.push(a); } };
}
const runBoot = (b: ReturnType<typeof fakeBrowser>) => new Function('window', 'navigator', 'document', TRACK_BOOT)(b.win, b.nav, b.doc);
async function freshTrack(env: Env = {}, withVa = true) {
  const b = fakeBrowser(env);
  if (withVa) b.win.va = b.spy;
  vi.stubGlobal('window', b.win); vi.stubGlobal('navigator', b.nav);
  vi.resetModules();
  return { ...b, ...(await import('@/lib/track')) };
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('track(): five fixed stages, no payload', () => {
  it('allows exactly the five stage names and sends each as a bare event named for the stage, once per page load', async () => {
    const t = await freshTrack();
    expect([...t.STAGES]).toEqual(STAGE_NAMES);
    for (const s of t.STAGES) { t.track(s); t.track(s); }
    expect(t.calls).toEqual(STAGE_NAMES.map(name => ['event', { name }])); // no data, no options, no identifier, no second send
  });
  it('ignores any name outside the list, and never calls identify or group', async () => {
    const t = await freshTrack();
    for (const bad of ['Begin', 'vote', 'identify', '', 'vote_sent ', 'x'.repeat(300), 42, null, undefined, { name: 'begin' }]) t.track(bad as never);
    expect(t.calls).toEqual([]);
    t.track('begin');
    expect(t.calls.map(c => c[0])).toEqual(['event']);
  });
  it.each(OPT_OUT)('opt-out matrix: %s', async (_name, env, off) => {
    const t = await freshTrack(env);
    t.track('begin');
    expect(t.calls.length).toBe(off ? 0 : 1);
  });
  it('does nothing and never throws on the server, with no script, with a throwing script, or with a throwing navigator', async () => {
    vi.stubGlobal('window', undefined); vi.resetModules();
    const server = await import('@/lib/track');
    expect(() => server.track('begin')).not.toThrow();
    const none = await freshTrack({}, false);
    expect(() => none.track('begin')).not.toThrow();
    const odd = await freshTrack({ window: { va: 'not a function' } }, false);
    expect(() => odd.track('begin')).not.toThrow();
    const boom = await freshTrack({}, false);
    boom.win.va = () => { throw new Error('vendor bug'); };
    expect(() => boom.track('begin')).not.toThrow();
    const hostile = await freshTrack({}, false);
    vi.stubGlobal('navigator', new Proxy({}, { get: () => { throw new Error('denied'); } }));
    expect(() => hostile.track('begin')).not.toThrow();
  });
});

describe('the boot script', () => {
  it('queues events and adds the vendor script from the Vercel path, with no data attribute and no endpoint of ours', () => {
    const b = fakeBrowser();
    runBoot(b);
    expect(b.appended).toHaveLength(1);
    expect(b.appended[0].src).toBe('/_vercel/insights/script.js');
    expect(SCRIPT_SRC).toBe('/_vercel/insights/script.js');
    expect(Object.keys(b.appended[0]).sort()).toEqual(['defer', 'onerror', 'src']);
    (b.win.va as (...a: unknown[]) => void)('event', { name: 'begin' }); // the queue Vercel's script drains when it loads
    expect([...(b.win.vaq as unknown[][])[0]]).toEqual(['event', { name: 'begin' }]);
  });
  it('keeps a queue function the page already has, and drops the queue when the script fails to load (not enabled, blocked)', () => {
    const own = () => undefined, b = fakeBrowser({ window: { va: own } });
    runBoot(b);
    expect(b.win.va).toBe(own);
    const failed = fakeBrowser();
    runBoot(failed);
    (failed.win.va as (...a: unknown[]) => void)('event', { name: 'begin' });
    (failed.appended[0].onerror as () => void)();
    expect(failed.win.va).toBeUndefined(); expect(failed.win.vaq).toBeUndefined();
  });
  it('never throws, even without a document head', () => {
    const b = fakeBrowser(); b.doc.head = undefined as never;
    expect(() => runBoot(b)).not.toThrow();
  });
  it.each(OPT_OUT)('opt-out matrix, same answer as track(): %s', async (_name, env, off) => {
    const b = fakeBrowser(env);
    runBoot(b);
    expect([b.appended.length, typeof b.win.va]).toEqual(off ? [0, 'undefined'] : [1, 'function']);
    const t = await freshTrack(env, false);
    t.win.va = b.win.va; // whatever the boot left on the page
    t.track('begin');
    expect((b.win.vaq as unknown[] | undefined)?.length ?? 0).toBe(off ? 0 : 1);
  });
  it('is plain ES5 text with no template, arrow or let/const, and small', () => {
    expect(TRACK_BOOT).not.toMatch(/=>|\blet\b|\bconst\b|`|\.\.\./);
    expect(TRACK_BOOT.length).toBeLessThan(600);
    expect(() => new Function(TRACK_BOOT)).not.toThrow();
  });
});

describe('AnalyticsBoot and where it sits', () => {
  it('renders the one inline script on a Vercel build and nothing elsewhere', () => {
    vi.stubEnv('VERCEL', '1');
    const on = renderToStaticMarkup(createElement(AnalyticsBoot));
    expect(on.startsWith('<script>')).toBe(true);
    expect(on).not.toMatch(/<script [^>]*src/); // inline, so it adds no first-load script file
    expect(on).toContain('/_vercel/insights/script.js');
    vi.stubEnv('VERCEL', '');
    expect(renderToStaticMarkup(createElement(AnalyticsBoot))).toBe('');
    vi.unstubAllEnvs();
  });
  it('is on the game page only: not in the layout, so /privacy and /results carry no script', () => {
    expect(read('src/app/page.tsx')).toContain('<AnalyticsBoot />');
    for (const f of ['src/app/layout.tsx', 'src/app/privacy/page.tsx', 'src/app/results/markup.ts']) expect(read(f), f).not.toMatch(/AnalyticsBoot|_vercel|<script|va\(/);
  });
  it('adds no dependency and no vendor import: the vendor script is the only vendor code, and it is not bundled', () => {
    expect(read('package.json')).not.toMatch(/@vercel\/analytics/);
    for (const f of listSources()) expect(read(f), f).not.toMatch(/@vercel\/analytics/);
  });
});

describe('the page CSP lets the vendor script and its beacon through, and the strict routes stay strict', () => {
  it('the page group names no script-src, connect-src or default-src, so the same-origin script and its /_vercel/insights beacon are allowed (a future script CSP must allow them)', () => {
    expect(COMMON_CSP).not.toMatch(/script-src|connect-src|default-src/);
    expect(securityHeaders[0].headers.find(h => h.key === 'Content-Security-Policy')?.value).toBe(COMMON_CSP);
  });
  it('the API stays default-src none and sandboxed, and /results has no script and no vendor path', () => {
    expect(API_CSP).toBe("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox");
    expect(read('src/app/results/markup.ts')).not.toMatch(/_vercel|<script/);
  });
});

describe('the call sites: only vote-owned files, one literal stage each, no payload', () => {
  it('every track() call in src passes one literal stage from the list; the vote-owned files carry exactly their three', () => {
    const calls: Record<string, string[]> = {};
    for (const f of listSources()) {
      if (VENDOR_SIDE.includes(f)) continue;
      for (const m of read(f).matchAll(/\btrack\(([^)]*)\)/g)) (calls[f] ??= []).push(m[1]);
    }
    for (const [f, args] of Object.entries(calls)) for (const a of args) expect(a, f).toMatch(/^'(begin|scene_ready|second_way_20s|vote_card_shown|vote_sent)'$/);
    expect(calls['src/ui/vote/VoteCard.tsx']).toEqual(["'vote_card_shown'", "'vote_sent'"]);
    expect(calls['src/ui/vote/voteTracker.ts']).toEqual(["'second_way_20s'"]);
    expect(Object.keys(calls).filter(f => /src\/ui\/vote\//.test(f)).sort()).toEqual(['src/ui/vote/VoteCard.tsx', 'src/ui/vote/voteTracker.ts']);
  });
  it('the vendor queue is touched by track.ts and the boot script alone, and track.ts calls it only with the event command', () => {
    for (const f of listSources()) if (!VENDOR_SIDE.includes(f)) expect(read(f), f).not.toMatch(/\.va\(|\bva\(|\bvaq\b|['"]identify['"]|\bgroupId\b/);
    expect(read('src/lib/track.ts').match(/page\.va\(([^)]*)\)/g)).toEqual(["page.va('event', { name: stage })"]);
  });
});

describe('second_way_20s in the vote tracker', () => {
  async function tracker() {
    const t = await freshTrack();
    const tr = await import('@/ui/vote/voteTracker');
    return { ...t, ...tr };
  }
  const names = (calls: unknown[][]) => calls.map(c => (c[1] as { name: string }).name);
  it('fires once, on the tick that makes a family\'s second control reach 20 seconds', async () => {
    const t = await tracker(), play = t.emptyPlay();
    for (let i = 0; i < 40; i++) t.tick(play, controlKey('touch', 'draw'), 1); // the first way: 40 s, no count
    expect(t.calls).toEqual([]);
    for (let i = 0; i < 19; i++) t.tick(play, controlKey('touch', 'brush'), 1);
    expect(t.calls).toEqual([]);
    t.tick(play, controlKey('touch', 'brush'), 1); // the 20th second of the second way
    expect(names(t.calls)).toEqual(['second_way_20s']);
    for (let i = 0; i < 25; i++) t.tick(play, controlKey('touch', 'conduct'), 1); // a third way: not a second way
    t.tick(play, controlKey('touch', 'brush'), 1);
    expect(names(t.calls)).toEqual(['second_way_20s']);
  });
  it('does not count one way per family as a second way, and a big jump still crosses once', async () => {
    const t = await tracker(), play = t.emptyPlay();
    t.tick(play, controlKey('touch', 'draw'), 30); t.tick(play, controlKey('desktop', 'cursor'), 30);
    expect(t.calls).toEqual([]);
    t.tick(play, controlKey('desktop', 'draw'), 21);
    expect(names(t.calls)).toEqual(['second_way_20s']);
  });
  it('is a no-op for a play record that already holds two tried ways, for unknown keys and for bad seconds', async () => {
    const t = await tracker(), play = t.emptyPlay();
    play.secs[controlKey('touch', 'draw')] = 50; play.secs[controlKey('touch', 'brush')] = 50;
    t.tick(play, controlKey('touch', 'draw'), 1); t.tick(play, 'standard', 30); t.tick(play, controlKey('touch', 'conduct'), Number.NaN);
    expect(t.calls).toEqual([]);
  });
  it('sends nothing under Do Not Track, and the tick still counts the seconds', async () => {
    const t = await freshTrack({ navigator: { doNotTrack: '1' } });
    const tr = await import('@/ui/vote/voteTracker'), play = tr.emptyPlay();
    tr.tick(play, controlKey('touch', 'draw'), 25); tr.tick(play, controlKey('touch', 'brush'), 25);
    expect(t.calls).toEqual([]);
    expect(tr.triedIds(play, 'touch')).toHaveLength(2);
  });
});

function listSources(dir = 'src'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? listSources(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
}
