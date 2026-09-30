'use client';
import { useEffect, useState } from 'react';
import { controlById, type ControlFamily } from '@/game/controlTypes';
import { touchCapable } from '@/game/pointerMode';
import { useGame } from '@/game/store';
import ControlList, { useCurrentControl } from './ControlList';
import { KeysToggle, TriedLine, VoteButton } from './ControlsSheet';
import { useControlFamily } from './useControlFamily';
import pause from '../Experience.module.css';
import styles from './ControlsPicker.module.css';

const FAMILIES: [ControlFamily, string][] = [['touch', 'Touch'], ['desktop', 'Trackpad or mouse']];
/** A touch laptop or tablet with a keyboard: both lists make sense there. */
const bothInputs = () => touchCapable() && typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches;

/**
 * The pause card's vote door: the ask above the button for a player who is eligible (they may never land to get the auto-open), the
 * button alone otherwise. It lives in this chunk, not in PauseCard, so its words are not in the landing's zero-headroom first load.
 */
function VoteDoor({ nudge }: { nudge: boolean }) {
  return <>
    {nudge && <p className={pause.voteAsk}>Which way of flying felt best?</p>}
    <button className={`${pause.secondary} ${pause.voteOpen}`} data-testid="vote-open" data-nudge={nudge ? '' : undefined} onClick={() => useGame.setState({ voteOpen: true })}>Vote: which felt best?</button>
  </>;
}

/**
 * The same control list for the pause card, the Field guide and Flight settings (through the landing's one LazyControls wrapper).
 * `name` keeps the radio groups apart; 'control-guide' also carries the 'Try every control' heading (so the landing files hold no copy).
 * Collapsed in a details on short screens. `vote` adds the vote button. The pause card's copy ('control-pause') also carries the vote door
 * (V4): right under Resume, above the list, for a player who is asked; after the list for everyone else. Where a vote button or door sits next to
 * the list the tried line may say how many ways a vote needs (CODE-9: the Field guide and Flight settings have neither and say plain 'Tried n of N').
 */
export default function ControlsSection({ name, vote = false }: { name: string; vote?: boolean }) {
  const nudge = useGame(s => s.voteNudge), atPause = name === 'control-pause';
  const followed = useControlFamily(), [chosen, setChosen] = useState<ControlFamily | null>(null), [both, setBoth] = useState(false);
  const [open, setOpen] = useState(() => typeof innerHeight === 'undefined' || innerHeight >= 560);
  useEffect(() => { setBoth(bothInputs()); }, []);
  const family = both && chosen ? chosen : followed, current = useCurrentControl(family);
  return <>
    {atPause && nudge && <VoteDoor nudge />}
    <section className={styles.section} data-testid="controls-section" data-name={name} aria-label={name === 'control-guide' ? undefined : 'Controls'}>
      {name === 'control-guide' && <h3 className={styles.sectionTitle}>Try every control</h3>}
      <details className={styles.details} open={open} onToggle={e => setOpen(e.currentTarget.open)}>
        <summary>{`Controls: ${controlById(current).label}`}</summary>
        {both && <div className={styles.switch} role="group" aria-label="Control family">
          {FAMILIES.map(([f, text]) => <button key={f} type="button" aria-pressed={f === family} onClick={() => setChosen(f)}>{text}</button>)}
        </div>}
        <ControlList family={family} name={name} />
        <TriedLine family={family} voting={vote || atPause} />
        {family === 'desktop' && <KeysToggle />}
        {vote && <VoteButton family={family} />}
      </details>
    </section>
    {atPause && !nudge && <VoteDoor nudge={false} />}
  </>;
}
