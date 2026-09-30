'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { controlKey, idFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { currentFamily, watchFamily } from '../controls/family';
import { selectControl } from '../controls/selectControl';
import { pause } from '../useInput';
import { watchPlayInput } from './playInput';
import { livePlan, pickFocus } from './restoreFocus';
import { autoNeed, canVote, eligible, guardOn, GUARD_MAX_MS, GUARD_MS, livePlay, markSkipped, NUDGE_TRIED, readMark, savePlay, skipCounts, tick, triedIds } from './voteTracker';
import VoteCard, { type CloseKind } from './VoteCard';
import styles from './VoteCard.module.css';

// voteOpen is a runtime-only store field; the pause card, the Controls sheet and the header button open the card with useGame.setState({ voteOpen: true }).
const setOpen = (voteOpen: boolean) => useGame.setState({ voteOpen });
type Origin = 'auto' | 'pause';
type Session = { origin: Origin; family: ControlFamily; current: ControlId; tried: ControlId[]; already: boolean };

/** The vote's background work and its card: a 1 s play-time tracker (seconds with input only, per control and family), the one
 *  auto-open per page load (on a landing, once two controls of the family are tried), the post-auto-open pointer guard, and the
 *  card itself while voteOpen. onResume resumes play (auto-open Skip/Done, and any card opened over a running game). */
export default function VoteLayer({ onResume }: { onResume: () => void }) {
  const open = useGame(s => s.voteOpen);
  const autoDone = useRef(false), pendingAuto = useRef(false), resumeAfter = useRef(false);
  const pointers = useRef(new Set<number>()), openedAt = useRef(0), opener = useRef<Element | null>(null), refocus = useRef<ControlFamily | null>(null);
  const [session, setSession] = useState<Session | null>(null), [guard, setGuard] = useState(false);
  const playNow = livePlay;

  // Played seconds per control and family: started, not paused, page visible, and only a second in which the player gave input
  // (a key or pointer held, or game input within 2 s; dialogs, the header and the digit keys do not count). Saved every 10 s,
  // on pagehide and on unmount. watchFamily() follows whichever pointer touched last, so a touch laptop counts the right family.
  useEffect(() => {
    let n = 0;
    watchFamily();
    const input = watchPlayInput();
    const save = () => savePlay(playNow());
    const id = window.setInterval(() => {
      const g = useGame.getState();
      if (!g.started || g.paused || document.visibilityState !== 'visible' || !input.active(performance.now())) return;
      const family = currentFamily();
      tick(playNow(), controlKey(family, idFor(g, family)), 1);
      if (++n % 10 === 0) save();
    }, 1000);
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(id); input.stop(); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden); save(); };
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
      const family = currentFamily();
      const nudge = !s.voteOpen && eligible(playNow(), readMark(), Date.now(), family, NUDGE_TRIED());
      if (nudge !== s.voteNudge) useGame.setState({ voteNudge: nudge });
    }
  }), []);

  // Auto-open: at most once per page load, only on a landing (flying true -> false while started and not paused), when eligible.
  // A pause the player opened never opens it (that path is the pause card's "Vote: which felt best?").
  useEffect(() => useGame.subscribe((s, prev) => {
    if (autoDone.current || s.voteOpen || !prev.flying || s.flying || !s.started || s.paused || s.panel || s.journal) return;
    const family = currentFamily();
    if (!eligible(playNow(), readMark(), Date.now(), family, autoNeed())) return;
    autoDone.current = true; pendingAuto.current = true;
    savePlay(playNow());
    pause();
    setOpen(true);
  }), []);

  // Each open takes its answers' context once: origin, family, current control, tried controls, and whether this device already voted.
  useEffect(() => {
    if (!open) { setSession(null); setGuard(false); pendingAuto.current = false; return; }
    const origin: Origin = pendingAuto.current ? 'auto' : 'pause';
    pendingAuto.current = false;
    opener.current = document.activeElement; // the card is not mounted yet, so this is what to give focus back to (V5)
    // Opened from the Controls sheet while flying: stop the game behind the card (keys and fingers must not fly it), and give it
    // back on Done or Skip. Opened from a pause the player already has, nothing changes.
    const g = useGame.getState();
    if (origin === 'pause' && g.started && !g.paused) { pause(); resumeAfter.current = true; }
    const family = currentFamily(), current = idFor(useGame.getState(), family);
    setSession({ origin, family, current, tried: triedIds(playNow(), family), already: !canVote(readMark(), Date.now(), family) });
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

  // Only Skip on an auto-open records the 24 h quiet: a manual Not yet or Escape (a visitor who opened the card themselves) records nothing.
  const close = (kind: CloseKind) => {
    const origin = session?.origin;
    if (session && skipCounts(kind, session.origin)) markSkipped(session.family);
    refocus.current = session?.family ?? null;
    useGame.setState({ voteOpen: false, voteNudge: false });
    const back = origin === 'auto' || resumeAfter.current;
    resumeAfter.current = false;
    if (back) onResume();
  };
  // V5: once the card is gone (and the pause card is back, if the game is paused) focus goes to a sensible element, never to <main>.
  useEffect(() => {
    const family = refocus.current;
    if (open || family === null) return;
    refocus.current = null;
    requestAnimationFrame(() => { // a frame later: the layer's resume and the pause card's return have both landed by then
      const g = useGame.getState();
      pickFocus(livePlan(opener.current, family === 'desktop' && g.started && !g.paused))?.focus({ preventScroll: true });
      opener.current = null;
    });
  }, [open]);
  // The card's Try button: close without a Skip mark (and resume), then switch. selectControl refuses while the card is open, so the close comes first.
  const tryControl = (id: ControlId) => {
    const family = session?.family;
    close('done');
    if (family) selectControl(id, { family });
  };
  if (!open || !session) return null;
  return <div ref={scrim} className={styles.scrim} data-testid="vote-layer" data-scroll-ok="">
    <VoteCard current={session.current} tried={session.tried} device={session.family} already={session.already}
      guard={guard} onClose={close} onTry={tryControl} />
  </div>;
}
