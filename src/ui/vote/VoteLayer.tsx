'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@/game/store';
import { touchMode } from '@/game/pointerMode';
import { isVoteLab, type VoteLab } from '@/lib/vote/shape';
import { pause } from '../useInput';
import { canVote, eligible, guardOn, GUARD_MAX_MS, GUARD_MS, markSkipped, readMark, readPlay, savePlay, tick, tried, type VotePlay } from './voteTracker';
import VoteCard, { type CloseKind } from './VoteCard';
import styles from './VoteCard.module.css';

// voteOpen is a runtime-only store field; the pause card's "Vote on the controls" opens the card with useGame.setState({ voteOpen: true }).
const setOpen = (voteOpen: boolean) => useGame.setState({ voteOpen });
const asLab = (v: string): VoteLab => isVoteLab(v) ? v : 'standard';
type Origin = 'auto' | 'pause';
type Session = { origin: Origin; current: VoteLab; tried: VoteLab[]; already: boolean };

/** The vote's background work and its card: a 1 s play-time tracker, the one auto-open per page load (on a landing, when
 *  eligible), the post-auto-open pointer guard, and the card itself while voteOpen. onResume resumes play (auto-open Skip/Done). */
export default function VoteLayer({ onResume }: { onResume: () => void }) {
  const open = useGame(s => s.voteOpen);
  const play = useRef<VotePlay | null>(null), autoDone = useRef(false), pendingAuto = useRef(false);
  const pointers = useRef(new Set<number>()), openedAt = useRef(0);
  const [session, setSession] = useState<Session | null>(null), [guard, setGuard] = useState(false);
  const playNow = () => (play.current ??= readPlay());

  // Played seconds per style: started, not paused, page visible. Saved every 10 s, on pagehide and on unmount.
  useEffect(() => {
    let n = 0;
    const save = () => { if (play.current) savePlay(play.current); };
    const id = window.setInterval(() => {
      const g = useGame.getState();
      if (!g.started || g.paused || document.visibilityState !== 'visible') return;
      tick(playNow(), asLab(g.controlLab), 1);
      if (++n % 10 === 0) save();
    }, 1000);
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(id); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden); save(); };
  }, []);

  // Every pointer that is down, counted from the window's capture phase (the controls capture their pointers, which still pass
  // through here). Attached for the layer's lifetime, so a thumb already down when the card opens is counted.
  const recheck = useCallback(() => {
    if (!guardOn(openedAt.current, performance.now(), pointers.current.size)) setGuard(false);
  }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => { pointers.current.add(e.pointerId); };
    const up = (e: PointerEvent) => { pointers.current.delete(e.pointerId); recheck(); };
    const lost = () => { pointers.current.clear(); recheck(); };
    const opt = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', down, opt); window.addEventListener('pointerup', up, opt);
    window.addEventListener('pointercancel', up, opt); window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('pointerdown', down, opt); window.removeEventListener('pointerup', up, opt);
      window.removeEventListener('pointercancel', up, opt); window.removeEventListener('blur', lost);
    };
  }, [recheck]);
  useEffect(() => {
    if (!guard) return;
    const a = window.setTimeout(recheck, GUARD_MS + 10), b = window.setTimeout(recheck, GUARD_MAX_MS + 10);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [guard, recheck]);

  // A pause the player opened never opens the card, but when they are eligible the pause card leads with the vote (voteNudge):
  // a player who never lands (over water, or always in the air) still gets asked. Re-checked on each pause, off after a vote.
  useEffect(() => useGame.subscribe((s, prev) => {
    if (s.paused && !prev.paused) {
      const nudge = !s.voteOpen && eligible(playNow(), readMark(), Date.now());
      if (nudge !== s.voteNudge) useGame.setState({ voteNudge: nudge });
    }
  }), []);

  // Auto-open: at most once per page load, only on a landing (flying true -> false while started and not paused), when eligible.
  // A pause the player opened never opens it (that path is the pause card's "Vote on the controls").
  useEffect(() => useGame.subscribe((s, prev) => {
    if (autoDone.current || s.voteOpen || !prev.flying || s.flying || !s.started || s.paused || s.panel || s.journal) return;
    const now = Date.now();
    if (!eligible(playNow(), readMark(), now)) return;
    autoDone.current = true; pendingAuto.current = true;
    savePlay(playNow());
    pause();
    setOpen(true);
  }), []);

  // Each open takes its answers' context once: origin, current style, tried styles, and whether this device already voted.
  useEffect(() => {
    if (!open) { setSession(null); setGuard(false); pendingAuto.current = false; return; }
    const origin: Origin = pendingAuto.current ? 'auto' : 'pause';
    pendingAuto.current = false;
    const current = asLab(useGame.getState().controlLab);
    setSession({ origin, current, tried: tried(playNow(), current), already: !canVote(readMark(), Date.now()) });
    if (origin === 'auto') { openedAt.current = performance.now(); setGuard(true); }
  }, [open]);

  // Modal (review 2026-09-25): while the card shows, the rest of the page (the header's lab bar and buttons, the controls, the skip
  // link) is inert, so the keyboard cannot reach or switch anything behind it. Only what this effect made inert is restored.
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrim.current, main = el?.parentElement;
    if (!open || !session || !el || !main) return;
    const others = [...main.children, ...document.querySelectorAll('a.skip')].filter(n => n !== el && !n.hasAttribute('inert'));
    for (const n of others) n.setAttribute('inert', '');
    return () => { for (const n of others) n.removeAttribute('inert'); };
  }, [open, session]);

  const close = (kind: CloseKind) => {
    const origin = session?.origin;
    if (kind === 'skip') markSkipped();
    useGame.setState({ voteOpen: false, voteNudge: false });
    if (origin === 'auto') onResume();
  };
  if (!open || !session) return null;
  return <div ref={scrim} className={styles.scrim} data-testid="vote-layer">
    <VoteCard current={session.current} tried={session.tried} device={touchMode() ? 'touch' : 'desktop'} already={session.already}
      guard={guard} onClose={close} />
  </div>;
}
