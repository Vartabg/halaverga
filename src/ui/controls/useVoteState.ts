'use client';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { QUESTION } from '@/ui/vote/question';
import { fetchResults, type Probe } from '@/ui/vote/voteClient';
import { TRIED_S, canVote, livePlay, readMark, triedIds, type VoteMark, type VotePlay } from '@/ui/vote/voteTracker';

/**
 * Where this family's vote stands, the one answer the top row, the Controls sheet and the pause card all read.
 *  locked: fewer than two ways flown (two dots, one plain line; never a button).
 *  ready:  two flown, this family has not voted, the ballot is not known to be closed. The only state with a Vote button.
 *  sent:   this family voted (only the sheet says so).
 *  off:    two flown, but there is nothing to offer: the ballot is known closed, or the one check of it has not answered yet.
 * The 24 h quiet after a Skip is deliberately ignored: only the landing's auto-open respects it, a visitor may still vote by button.
 */
export type VoteState = 'locked' | 'ready' | 'sent' | 'off';
export interface VoteView { state: VoteState; tried: number }
/** unknown: not asked yet. open: asked and not closed (an offline or odd answer counts: the card says so when it is tapped). */
export type Ballot = 'unknown' | 'open' | 'closed';

export function voteView(play: VotePlay, mark: VoteMark, now: number, family: ControlFamily, ballot: Ballot): VoteView {
  const tried = triedIds(play, family).length;
  if (!canVote(mark, now, family)) return { state: 'sent', tried };
  if (tried < VOTE_MIN_TRIED) return { state: 'locked', tried };
  return { state: ballot === 'open' ? 'ready' : 'off', tried };
}

// The ballot is asked once per page load, when two ways are flown: the same cached GET the card makes when it opens. Only a closed
// answer (a 503 or open:false) hides the button; offline or an unreadable answer keeps it, and the card says so when it is tapped.
let ballot: Ballot = 'unknown', asked = false;
const listeners = new Set<() => void>();
export const ballotOf = (p: Probe): Ballot => (p.closed ? 'closed' : 'open');
export const ballotNow = (): Ballot => ballot;
/** Also the way a test resets it: 'unknown' asks again. */
export function setBallot(b: Ballot) { ballot = b; asked = b !== 'unknown'; for (const f of [...listeners]) f(); }
function askBallot(read: () => Promise<Probe> = fetchResults) {
  if (asked) return;
  asked = true;
  void read().then(p => setBallot(ballotOf(p)));
}

/** The vote's state for a family. Reads once a second only while locked, again when the card closes (a sent vote), and when the ballot answers. */
export function useVoteState(family: ControlFamily): VoteView {
  useGame(s => s.voteOpen);
  const snap = () => { const v = voteView(livePlay(), readMark(), Date.now(), family, ballot); return `${v.state}|${v.tried}`; };
  const watch = useCallback((fn: () => void) => {
    listeners.add(fn);
    const t = setInterval(() => { if (voteView(livePlay(), readMark(), Date.now(), family, ballot).state === 'locked') fn(); }, 1000);
    return () => { listeners.delete(fn); clearInterval(t); };
  }, [family]);
  const [state, tried] = useSyncExternalStore(watch, snap, snap).split('|') as [VoteState, string];
  const asking = state === 'ready' || state === 'off';
  useEffect(() => { if (asking) askBallot(); }, [asking]);
  return { state, tried: Number(tried) };
}

/** The text twin of the two dots (aria-label tail on the Controls button while locked): the visible word stays the start of the name. */
export const lockedTail = (tried: number) => `: vote unlocks after two ways, ${Math.min(tried, VOTE_MIN_TRIED)} of ${VOTE_MIN_TRIED} tried`;
/** What a Vote button is called to a screen reader: the visible word is `Vote`, the question follows it (WCAG 2.5.3: the name starts with the label). */
export const VOTE_NAME = `Vote: ${QUESTION}`;
/** The one line the hint slot shows when a vote becomes ready. */
export const READY_TEXT = `Vote is ready · ${QUESTION}`;
let toasted = false;
/** Tells the player once per page load, and only when this mount watched the count go from under two to ready (not for someone who arrived with two already flown). */
export function useReadyToast(state: VoteState) {
  const sawLocked = useRef(false);
  useEffect(() => {
    if (state === 'locked') sawLocked.current = true;
    else if (state === 'ready' && sawLocked.current && !toasted) { toasted = true; useGame.setState({ message: READY_TEXT }); }
  }, [state]);
}
/** The one line the hint slot shows the first time a way reaches TRIED_S seconds of flight (addendum C3): the vote needs a second one. */
export const ONE_WAY_TEXT = `One way flown. Try another for ${TRIED_S} s, then vote.`;
let oneWayToasted = false;
/** Once per page load, and only when this mount watched the count go from none to one (not for someone who arrived with a way already flown). */
export function useOneWayToast({ state, tried }: VoteView) {
  const sawNone = useRef(false);
  useEffect(() => {
    if (state !== 'locked') return;
    if (tried === 0) sawNone.current = true;
    else if (tried === 1 && sawNone.current && !oneWayToasted) { oneWayToasted = true; useGame.setState({ message: ONE_WAY_TEXT }); }
  }, [state, tried]);
}
