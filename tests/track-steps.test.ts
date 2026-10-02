import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGES } from '@/lib/track';
import { PRIVACY_FULL } from '@/lib/vote/privacy';

// The five steps /privacy says are counted must each be sent by something: the first two (scene ready, Begin) come from gameSteps.ts, read
// from the game store by the lazy vote layer, so the landing first load does not grow; the other three are in the vote files.
const read = (f: string) => readFileSync(f, 'utf8');
const sources = () => (readdirSync('src', { recursive: true }) as string[]).filter(f => /\.(ts|tsx)$/.test(f)).map(f => join('src', f));
const STEP_WORDS = ['Begin', 'scene ready', 'a second way flown for 20 seconds', 'vote card shown', 'vote sent']; // as PRIVACY_FULL names them, in its order

describe('every counted step has a call site', () => {
  it('the five steps the privacy text names are exactly the stages track() allows, in the same order', () => {
    expect(STEP_WORDS).toHaveLength(STAGES.length);
    const at = STEP_WORDS.map(w => PRIVACY_FULL.indexOf(w));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect([...STAGES]).toEqual(['begin', 'scene_ready', 'second_way_20s', 'vote_card_shown', 'vote_sent']);
  });
  it('each stage is sent by a track() call somewhere in src outside track.ts, and no call names anything else', () => {
    const calls = new Map<string, string[]>();
    for (const f of sources().filter(f => f !== join('src', 'lib', 'track.ts'))) {
      for (const m of read(f).matchAll(/\btrack\('([^']*)'\)/g)) calls.set(m[1], [...(calls.get(m[1]) ?? []), f]);
    }
    for (const stage of STAGES) expect(calls.get(stage), `no track('${stage}') call site`).toBeTruthy();
    expect([...calls.keys()].filter(k => !(STAGES as readonly string[]).includes(k))).toEqual([]);
  });
  it('the game steps live in the lazy vote layer only: no track import in Experience or Player, and gameSteps is imported by VoteLayer alone', () => {
    for (const f of ['src/ui/Experience.tsx', 'src/game/Player.tsx']) expect(read(f), f).not.toMatch(/lib\/track|gameSteps/);
    const importers = sources().filter(f => /from '\.\/gameSteps'|gameSteps'/.test(read(f)));
    expect(importers).toEqual([join('src', 'ui', 'vote', 'VoteLayer.tsx')]);
  });
});

describe('watchGameSteps', () => {
  const spy = vi.fn();
  async function fresh(env: { navigator?: Record<string, unknown> } = {}) {
    spy.mockClear();
    vi.stubGlobal('window', { va: spy }); vi.stubGlobal('navigator', { ...env.navigator });
    vi.resetModules();
    const { useGame } = await import('@/game/store');
    const { watchGameSteps } = await import('@/ui/vote/gameSteps');
    useGame.setState({ ready: false, started: false });
    const real = useGame.subscribe.bind(useGame);
    let unsubscribed = 0;
    vi.spyOn(useGame, 'subscribe').mockImplementation(l => { const u = real(l); return () => { unsubscribed++; u(); }; });
    return { useGame, watchGameSteps, names: () => spy.mock.calls.map(c => c[1].name), unsubscribed: () => unsubscribed };
  }
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sends scene_ready when the scene is ready and begin when Begin is tapped, one bare event each, once, and then stops listening', async () => {
    const t = await fresh();
    t.watchGameSteps();
    expect(t.names()).toEqual([]);
    t.useGame.setState({ ready: true });
    expect(spy.mock.calls).toEqual([['event', { name: 'scene_ready' }]]);
    t.useGame.setState({ started: true });
    expect(spy.mock.calls).toEqual([['event', { name: 'scene_ready' }], ['event', { name: 'begin' }]]); // no data, no options, no identifier
    expect(t.unsubscribed()).toBe(1);
    t.useGame.setState({ ready: false, started: false }); t.useGame.setState({ ready: true, started: true }); // a reload of the scene, a pause and a resume
    expect(t.names()).toEqual(['scene_ready', 'begin']);
  });
  it('counts a ready and started game at once when the layer loads late, and begin even if the scene never became ready', async () => {
    const late = await fresh();
    late.useGame.setState({ ready: true, started: true });
    late.watchGameSteps();
    expect(late.names()).toEqual(['scene_ready', 'begin']);
    const skipped = await fresh();
    skipped.watchGameSteps();
    skipped.useGame.setState({ started: true });
    expect(skipped.names()).toEqual(['begin']);
    skipped.useGame.setState({ ready: true });
    expect(skipped.names()).toEqual(['begin', 'scene_ready']);
  });
  it('the cleanup stops it, and Do Not Track sends nothing', async () => {
    const t = await fresh(), stop = t.watchGameSteps();
    stop();
    t.useGame.setState({ ready: true, started: true });
    expect(t.names()).toEqual([]);
    const dnt = await fresh({ navigator: { doNotTrack: '1' } });
    dnt.watchGameSteps(); dnt.useGame.setState({ ready: true, started: true });
    expect(dnt.names()).toEqual([]);
  });
});
