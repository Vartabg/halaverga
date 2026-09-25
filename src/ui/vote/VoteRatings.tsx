'use client';
import type { VoteLab } from '@/lib/vote/shape';
import { VOTE_NAMES, type VoteRating } from './voteClient';
import styles from './VoteCard.module.css';

const SCALE: readonly VoteRating[] = [1, 2, 3, 4, 5];
type RatingsProps = { labs: readonly VoteLab[]; value: Partial<Record<VoteLab, VoteRating>>; onChange: (id: VoteLab, r: VoteRating) => void; disabled?: boolean };

/** One optional 1-5 group per tried style: native radios (arrow keys move and select), each option a 44 px target. */
export default function VoteRatings({ labs, value, onChange, disabled = false }: RatingsProps) {
  if (!labs.length) return null;
  return <div className={styles.ratings}>
    {labs.map(id => <fieldset key={id} className={styles.rating} disabled={disabled} data-testid={`vote-rating-${id}`}>
      <legend>Rate {VOTE_NAMES[id]} <small className={styles.hint}>(optional) 1 low · 5 high</small></legend>
      <div className={styles.scale}>
        {SCALE.map(n => <label key={n} className={styles.step}>
          <input type="radio" name={`vote-rate-${id}`} value={n} checked={value[id] === n} onChange={() => onChange(id, n)} />
          <span>{n}</span>
        </label>)}
      </div>
    </fieldset>)}
  </div>;
}

type FavoriteProps = { labs: readonly VoteLab[]; value: VoteLab | null; onChange: (id: VoteLab) => void; disabled?: boolean };
/** "Favorite": one radio per offered style, current style first. */
export function VoteFavorite({ labs, value, onChange, disabled = false }: FavoriteProps) {
  return <fieldset className={styles.favorite} disabled={disabled} data-testid="vote-favorite">
    <legend>Favorite</legend>
    {labs.map(id => <label key={id} className={styles.choice}>
      <input type="radio" name="vote-favorite" value={id} checked={value === id} onChange={() => onChange(id)} />
      <span>{VOTE_NAMES[id]}</span>
    </label>)}
  </fieldset>;
}
