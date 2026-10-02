import { afterEach, describe, expect, it } from 'vitest';
import { useGame } from '../src/game/store';
import { BLOCKED_TEXT, LAND_TEXT, RECORD_TEXT, hintInput, pickHint, slotBusy, slotHidden, type HintInput } from '../src/ui/hintQueue';
// The one hint slot's picker: what is on screen is the highest thing that is true. Pure, so every claim here is a table, not a browser.

const base: HintInput = { message: '', flying: false, canLand: false, limitCue: '', limitHint: '', descendBlocked: false, nearTerminal: false, coach: null, hidden: false };
const at = (o: Partial<HintInput>): HintInput => ({ ...base, ...o });
const coach = { text: 'Drag to fly', track: 'drag', step: 0 };

/** The expression Experience computed inline before the slot (`flightHint`), kept here verbatim as the reference the picker must equal. */
const OLD = (s: HintInput) => s.message || (s.flying && s.canLand ? 'SURFACE IN REACH · LAND' : s.limitCue && s.limitCue !== 'solid' ? s.limitHint : s.flying && s.descendBlocked ? 'NO LANDING BELOW · MOVE TO OPEN GROUND' : s.limitHint);

describe('pickHint: the one line', () => {
  it('says nothing when nothing is true', () => { expect(pickHint(base)).toBeNull(); });
  it('names each kind and its text', () => {
    expect(pickHint(at({ message: 'One finger controls' }))).toEqual({ kind: 'message', text: 'One finger controls' });
    expect(pickHint(at({ nearTerminal: true }))).toEqual({ kind: 'record', text: RECORD_TEXT });
    expect(pickHint(at({ flying: true, canLand: true }))).toEqual({ kind: 'land', text: LAND_TEXT });
    expect(pickHint(at({ limitCue: 'wall', limitHint: 'EDGE AHEAD · TURN AWAY' }))).toEqual({ kind: 'limit', text: 'EDGE AHEAD · TURN AWAY' });
    expect(pickHint(at({ flying: true, descendBlocked: true }))).toEqual({ kind: 'blocked', text: BLOCKED_TEXT });
    expect(pickHint(at({ limitHint: 'plain' }))).toEqual({ kind: 'blocked', text: 'plain' });
    expect(pickHint(at({ coach }))).toEqual({ kind: 'coach', text: 'Drag to fly' });
  });
  it('keeps the exact land and no-landing strings the browser specs read, and the record button text', () => {
    expect(LAND_TEXT).toBe('SURFACE IN REACH · LAND');
    expect(BLOCKED_TEXT).toBe('NO LANDING BELOW · MOVE TO OPEN GROUND');
    expect(RECORD_TEXT).toBe('◇ Municipal record · Read ↗');
  });
  it('orders them: message, record, land, limit, no landing below, then the coach line', () => {
    const all = at({ message: 'm', nearTerminal: true, flying: true, canLand: true, limitCue: 'wall', limitHint: 'edge', descendBlocked: true, coach });
    const order: string[] = [];
    let s = all;
    for (let n = 0; n < 6; n++) {
      const hint = pickHint(s)!; order.push(hint.kind);
      s = { ...s, ...(hint.kind === 'message' ? { message: '' } : hint.kind === 'record' ? { nearTerminal: false } : hint.kind === 'land' ? { canLand: false }
        : hint.kind === 'limit' ? { limitCue: '' as const, limitHint: '' } : hint.kind === 'blocked' ? { descendBlocked: false } : { coach: null }) };
    }
    expect(order).toEqual(['message', 'record', 'land', 'limit', 'blocked', 'coach']);
    expect(pickHint(s)).toBeNull();
  });
  it('G2: the Municipal record outranks a landing', () => {
    expect(pickHint(at({ nearTerminal: true, flying: true, canLand: true }))!.kind).toBe('record');
    expect(pickHint(at({ nearTerminal: true, message: 'x' }))!.kind).toBe('message');
  });
  it('the coach line waits behind every other line and comes back when they clear', () => {
    for (const o of [{ message: 'x' }, { nearTerminal: true }, { flying: true, canLand: true }, { limitCue: 'floor', limitHint: 'f' }, { limitHint: 'p' }, { flying: true, descendBlocked: true }] as Partial<HintInput>[])
      expect(pickHint(at({ ...o, coach }))!.kind, JSON.stringify(o)).not.toBe('coach');
    expect(pickHint(at({ coach }))!.kind).toBe('coach');
  });
  it('is null under any open dialog (the Controls sheet, the vote card, the Field guide, Flight settings), whatever else is true', () => {
    expect(pickHint(at({ hidden: true, message: 'x', nearTerminal: true, flying: true, canLand: true, limitHint: 'l', coach }))).toBeNull();
  });
});

describe('pickHint is the old flight line, moved', () => {
  it('equals the inline expression over the whole grid of message, flying, canLand, limitCue, limitHint and descendBlocked', () => {
    let n = 0;
    for (const message of ['', 'm']) for (const flying of [false, true]) for (const canLand of [false, true]) for (const limitCue of ['', 'wall', 'ceiling', 'floor', 'solid'])
      for (const limitHint of ['', 'hint']) for (const descendBlocked of [false, true]) {
        const s = at({ message, flying, canLand, limitCue, limitHint, descendBlocked });
        expect(pickHint(s)?.text ?? '', JSON.stringify(s)).toBe(OLD(s)); n++;
      }
    expect(n).toBe(2 * 2 * 2 * 5 * 2 * 2);
  });
});

describe('what the slot reads from the store', () => {
  afterEach(() => useGame.setState({ message: '', flying: false, canLand: false, nearTerminal: false, limitCue: '', limitHint: '', descendBlocked: false, coach: null,
    controlsOpen: false, voteOpen: false, journal: false, panel: false }));
  it('hintInput copies the fields and counts the four dialogs as hidden', () => {
    useGame.setState({ message: 'm', flying: true, canLand: true, coach });
    expect(hintInput(useGame.getState())).toMatchObject({ message: 'm', flying: true, canLand: true, coach, hidden: false });
    for (const k of ['controlsOpen', 'voteOpen', 'journal', 'panel'] as const) {
      useGame.setState({ [k]: true });
      expect(hintInput(useGame.getState()).hidden, k).toBe(true); expect(slotHidden(useGame.getState()), k).toBe(true);
      useGame.setState({ [k]: false });
    }
  });
  it('slotBusy is true under a dialog or while anything but the coach line shows, so the coach clocks wait (G1)', () => {
    useGame.setState({ coach });
    expect(slotBusy(useGame.getState())).toBe(false);
    useGame.setState({ message: 'x' }); expect(slotBusy(useGame.getState())).toBe(true);
    useGame.setState({ message: '', flying: true, canLand: true }); expect(slotBusy(useGame.getState())).toBe(true);
    useGame.setState({ canLand: false, nearTerminal: true }); expect(slotBusy(useGame.getState())).toBe(true);
    useGame.setState({ nearTerminal: false, controlsOpen: true }); expect(slotBusy(useGame.getState())).toBe(true);
    useGame.setState({ controlsOpen: false }); expect(slotBusy(useGame.getState())).toBe(false);
  });
});
