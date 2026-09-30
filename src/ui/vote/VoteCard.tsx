'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { controlsFor, type ControlId } from '@/game/controlTypes';
import type { VoteDevice } from '@/lib/vote/ballot';
import { PRIVACY_SHORT } from '@/lib/vote/privacy';
import { currentControlId } from '../controls/selectControl';
import { ballotOptions, readSeed, suggestNext } from './ballotPlan';
import { readPending, type Pending } from './pending';
import VoteChoices from './VoteChoices';
import VoteNeed from './VoteNeed';
import { ALREADY_TEXT, canSend, cardPhase, castVote, fetchResults, PAUSED_TEXT, PICK_FIRST, SAVED_TEXT, savedPick, sendLabel, SENDING_TEXT, STATUS_TEXT,
  tallyLine, type Probe, type VoteOutcome } from './voteClient';
import styles from './VoteCard.module.css';

export const HEADING = 'Which way of flying felt best?';
export const SUB_LINE = 'Pick the one that felt best. Only the ways you have flown are listed.';
export type CloseKind = 'skip' | 'done';
export type VoteCardProps = {
  current: ControlId;
  /** Controls counted as tried (20 s each). The ballot also lists `current`, so it always offers what the visitor is flying. */
  tried: readonly ControlId[];
  /** The control family the player is using (touch or desktop): the vote is per family. */
  device: VoteDevice;
  /** This device already voted in this round (a manual open): thanks and the tally, no ballot. */
  already?: boolean;
  /** Auto-open guard: pointer-events off (CSS [data-guard]) until 400 ms have passed and every pointer has lifted. */
  guard?: boolean;
  onClose: (kind: CloseKind) => void;
  /** The Try button: the layer closes the card without a Skip mark, then switches to this control. */
  onTry?: (id: ControlId) => void;
  /** Tests only: a fixed ballot seed, a saved vote, a finished probe, and a starting state. */
  seed?: number; saved?: Pending | null; probe?: Probe | null; start?: { pick?: ControlId | 'tie' | null; outcome?: VoteOutcome | null };
};

/**
 * "Which way of flying felt best?": pick one (or Can't tell), Send. Fewer than two ways flown shows what is missing instead. Nothing is
 * pre-selected, nothing is sent until Send, and the tally shows only after it. One send code is kept until the server answers.
 */
export default function VoteCard({ current, tried, device, already = false, guard = false, onClose, onTry, seed, saved, probe: probe0, start }: VoteCardProps) {
  const id = useId(), root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), sendBtn = useRef<HTMLButtonElement>(null);
  const endBtn = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const [ballotSeed] = useState(() => seed ?? readSeed()), [kept] = useState(() => (saved !== undefined ? saved : readPending(device)));
  const nonce = useRef(kept?.nonce);
  const offered = controlsFor(device).map(c => c.id).filter(x => tried.includes(x) || x === current), counted = controlsFor(device).filter(c => tried.includes(c.id)).length;
  const ids = ballotOptions(offered, device, ballotSeed, current), back = savedPick(kept, ids);
  const [pick, setPick] = useState(() => (start?.pick !== undefined ? start.pick : back));
  const [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(start?.outcome ?? null);
  const [msg, setMsg] = useState(() => (start?.outcome ? STATUS_TEXT[start.outcome] : back !== null && !already ? SAVED_TEXT : '')), [probe, setProbe] = useState(probe0 ?? null);
  const phase = cardPhase({ already, counted, outcome });
  const close = () => onClose(phase === 'ballot' ? 'skip' : 'done'); // the layer records a Skip only for an auto-open

  useEffect(() => {
    alive.current = true; heading.current?.focus({ preventScroll: true });
    // The one advisory read (also feeds the tally line after Send); a failure leaves the card as it is.
    if (probe0 === undefined) void fetchResults().then(p => { if (alive.current) setProbe(p); });
    return () => { alive.current = false; };
  }, [probe0]);
  // Escape closes as Not yet, from anywhere while the card is mounted (focus may be on the page after a failure). Capture: useInput's window Escape would pause.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  });
  useEffect(() => { if (phase === 'done' || phase === 'closed') endBtn.current?.focus({ preventScroll: true }); }, [phase]);

  const send = async () => {
    if (busy || phase !== 'ballot') return;
    if (pick === null) { setMsg(PICK_FIRST); root.current?.querySelector<HTMLInputElement>('input[name="vote-pick"]')?.focus(); return; }
    setBusy(true); setMsg('');
    const now = currentControlId(device), r = await castVote({ favorite: pick, tried: offered, last: offered.includes(now) ? now : current }, device, { nonce: nonce.current });
    nonce.current = r.nonce;
    if (!alive.current) return;
    setBusy(false); setOutcome(r.outcome); setMsg(STATUS_TEXT[r.outcome]);
    if (r.outcome !== 'ok' && r.outcome !== 'closed') sendBtn.current?.focus({ preventScroll: true });
  };
  const status = phase === 'done' ? (already && outcome !== 'ok' ? ALREADY_TEXT : STATUS_TEXT.ok) : phase === 'closed' ? '' : busy ? SENDING_TEXT : msg;
  const tally = phase === 'done' ? tallyLine(probe?.results ?? null, device) : '';
  // A modal dialog: VoteLayer makes everything else inert while it shows, so Tab and screen readers stay inside it.
  return <section ref={root} role="dialog" aria-modal="true" className={styles.card} aria-labelledby={`${id}-h`} data-testid="vote-card" data-phase={phase}
    data-guard={guard ? '' : undefined} data-outcome={outcome ?? undefined}>
    <h2 id={`${id}-h`} ref={heading} tabIndex={-1}>{HEADING}</h2>
    {phase === 'need' && <VoteNeed count={counted} suggestion={suggestNext(device, [...tried, current], ballotSeed)} onKeep={close} onTry={t => (onTry ? onTry(t) : close())} />}
    {phase === 'closed' && <p className={styles.need} data-testid="vote-closed">{STATUS_TEXT.closed}</p>}
    {phase === 'ballot' && <>
      <p className={styles.family} data-testid="vote-family">{device === 'touch' ? 'Touch controls' : 'Desktop controls'}</p>
      <p className={styles.sub}>{SUB_LINE}</p>
      <VoteChoices ids={ids} value={pick} disabled={busy} labelledBy={`${id}-h`} onChange={v => { setPick(v); if (msg === PICK_FIRST) setMsg(''); }} />
      <p className={styles.privacy}>{PRIVACY_SHORT}{' '}<a className={styles.link} href="/privacy" target="_blank" rel="noopener">How your vote is counted</a></p>
      {probe && (probe.closed || probe.results === null) && <p className={styles.paused} data-testid="vote-paused">{PAUSED_TEXT}</p>}
    </>}
    {/* The foot holds the one persistent live region (so each outcome and the thanks are announced) and the buttons. On the ballot it is
        sticky, so Send, Not yet and what Send answered are always on screen, in portrait and landscape alike. */}
    <div className={styles.foot} data-ballot={phase === 'ballot' ? '' : undefined}>
      <p className={styles.status} role="status">{status}</p>
      {tally && <p className={styles.tally} data-testid="vote-tally">{tally}</p>}
      {phase === 'done' && <a className={styles.link} href="/results" target="_blank" rel="noopener">See all results</a>}
      {phase !== 'need' && <div className={styles.buttons}>
        {phase === 'ballot' ? <>
          <button type="button" ref={sendBtn} className={styles.send} data-testid="vote-send" aria-disabled={!canSend(pick, busy, outcome)} aria-busy={busy} onClick={send}>{sendLabel(busy, outcome)}</button>
          <button type="button" className={styles.skip} data-testid="vote-not-yet" onClick={close}>Not yet</button>
        </> : <button type="button" ref={endBtn} className={styles.send} data-testid={phase === 'done' ? 'vote-done' : 'vote-keep'} onClick={close}>{phase === 'done' ? 'Done' : 'Keep playing'}</button>}
      </div>}
    </div>
  </section>;
}
