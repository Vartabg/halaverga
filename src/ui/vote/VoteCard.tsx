'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NOTE_MAX, type VoteDevice, type VoteLab } from '@/lib/vote/shape';
import { buildPayload, canSend, favoriteOptions, favoritesLine, fetchResults, noteLength, ratingLabs, STATUS_TEXT, submitVote,
  type VoteOutcome, type VoteRating } from './voteClient';
import VoteRatings, { VoteFavorite } from './VoteRatings';
import styles from './VoteCard.module.css';

export const PRIVACY_LINE = 'Anonymous. No sign-in, no cookies. We save only your answers, your note if you write one, touch or desktop, '
  + 'and the game version. Notes are deleted after about 90 days. To stop repeat votes, a scrambled form of your network address and '
  + 'a random send code are kept for one hour, then deleted. Your lab measurements stay on this device.';
export const NOTE_LABEL = 'Anything else? (optional, please leave out your name or contact details)';
export const ALREADY_TEXT = 'Your vote for this version is in. Thanks!';
export type CloseKind = 'skip' | 'done';
export type VoteCardProps = {
  current: VoteLab; tried: readonly VoteLab[]; device: VoteDevice;
  /** This device already voted in this round (a manual open from the pause card): thanks and the tally, no form. */
  already?: boolean;
  /** Auto-open guard: pointer-events off (CSS [data-guard]) until 400 ms have passed and every pointer has lifted. */
  guard?: boolean;
  onClose: (kind: CloseKind) => void;
};
const submitLabel = (busy: boolean, outcome: VoteOutcome | null) =>
  busy ? 'Sending…' : outcome === 'later' ? 'Try again' : outcome === 'network' ? 'Retry' : 'Send vote';

/** "Which controls did you like?": favorite, optional 1-5 ratings per tried style, an optional note, Send or Skip. */
export default function VoteCard({ current, tried, device, already = false, guard = false, onClose }: VoteCardProps) {
  const id = useId(), heading = useRef<HTMLHeadingElement>(null), done = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const [favorite, setFavorite] = useState<VoteLab | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<VoteLab, VoteRating>>>({});
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VoteOutcome | null>(null), [tally, setTally] = useState('');
  const finished = already || outcome === 'ok';
  useEffect(() => {
    alive.current = true; heading.current?.focus({ preventScroll: true });
    return () => { alive.current = false; };
  }, []);
  // After a vote (or when this device already voted) fetch the running tally; any failure just leaves the line out.
  useEffect(() => {
    if (!finished) return;
    done.current?.focus({ preventScroll: true });
    void fetchResults().then(r => { if (alive.current) setTally(favoritesLine(r)); });
  }, [finished]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend(favorite, busy, outcome) || favorite === null) return;
    setBusy(true);
    const result = await submitVote(buildPayload({ favorite, ratings, tried, note }, device));
    if (!alive.current) return;
    setBusy(false); setOutcome(result);
  };
  const close = () => onClose(finished ? 'done' : 'skip');
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (!busy) close();
  };
  const offered = favoriteOptions(tried, current), rated = ratingLabs(tried, current), length = noteLength(note);
  const status = already ? ALREADY_TEXT : outcome ? STATUS_TEXT[outcome] : '';
  // A modal dialog: VoteLayer makes everything else inert while it shows, so Tab and screen readers stay inside it.
  return <section role="dialog" aria-modal="true" className={styles.card} aria-labelledby={`${id}-h`} data-testid="vote-card" data-guard={guard ? '' : undefined}
    data-outcome={outcome ?? undefined} onKeyDown={keys}>
    <h2 id={`${id}-h`} ref={heading} tabIndex={-1}>Which controls did you like?</h2>
    {!finished && <form id={`${id}-form`} className={styles.form} onSubmit={send} aria-busy={busy}>
      <VoteFavorite labs={offered} value={favorite} onChange={setFavorite} disabled={busy} />
      <VoteRatings labs={rated} value={ratings} onChange={(lab, r) => setRatings(v => ({ ...v, [lab]: r }))} disabled={busy} />
      <label className={styles.note} htmlFor={`${id}-note`}>{NOTE_LABEL}</label>
      <textarea id={`${id}-note`} className={styles.noteBox} value={note} maxLength={NOTE_MAX} rows={3} disabled={busy}
        aria-describedby={`${id}-count`} onChange={e => setNote(Array.from(e.target.value).slice(0, NOTE_MAX).join(''))} />
      <small id={`${id}-count`} className={styles.count}>{length} / {NOTE_MAX}</small>
      <p className={styles.privacy}>{PRIVACY_LINE}</p>
    </form>}
    {/* One persistent live region, so each outcome (and the thanks) is announced. */}
    <p className={styles.status} role="status">{status}</p>
    {finished && tally && <p className={styles.tally} data-testid="vote-tally">{tally}</p>}
    <div className={styles.buttons}>
      {finished ? <button type="button" ref={done} className={styles.send} onClick={close}>Done</button> : <>
        <button type="submit" form={`${id}-form`} className={styles.send} disabled={!canSend(favorite, busy, outcome)} aria-busy={busy}>{submitLabel(busy, outcome)}</button>
        <button type="button" className={styles.skip} onClick={close} disabled={busy}>Skip</button>
      </>}
    </div>
  </section>;
}
