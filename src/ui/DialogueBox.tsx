'use client';
import { useState } from 'react';
import { bossRuntime } from '@/game/bossRuntime';
import styles from './DialogueBox.module.css';

interface DialogueLine {
  speaker: string;
  tag: string;
  text: string;
}

const DIALOGUE_SEQUENCE: DialogueLine[] = [
  {
    speaker: 'Semjaza',
    tag: '1 ENOCH 6:4',
    text: '“I fear you will not indeed agree to do this deed, and I alone shall have to pay the penalty of a great sin.”',
  },
  {
    speaker: 'The Watchers',
    tag: '1 ENOCH 6:5',
    text: '“Let us all swear an oath, and all bind ourselves by mutual imprecations not to abandon this plan but to do this thing.”',
  },
  {
    speaker: 'Archangel of the Covenant',
    tag: 'HERMON SUMMIT',
    text: '“Your oath is broken in the dawn firmament. Cast down your staff, Semjaza.”',
  },
];

export default function DialogueBox({ onDismiss }: { onDismiss?: () => void }) {
  const [index, setIndex] = useState(0);

  const current = DIALOGUE_SEQUENCE[index];
  if (!current) return null;

  const handleNext = () => {
    if (index + 1 < DIALOGUE_SEQUENCE.length) {
      setIndex(index + 1);
    } else if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div className={styles.dialogueBox} role="dialog" aria-label="Mythic Dialogue">
      <div className={styles.speakerRow}>
        <span>{current.speaker}</span>
        <span className={styles.scriptureTag}>{current.tag}</span>
      </div>
      <p className={styles.dialogueText}>{current.text}</p>
      <button className={styles.dismissBtn} onClick={handleNext}>
        {index + 1 < DIALOGUE_SEQUENCE.length ? 'Continue ›' : 'Engage in Battle ↗'}
      </button>
    </div>
  );
}
