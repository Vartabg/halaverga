import type { Metadata } from 'next';
import { account, sourcePassage } from '@/crossing/warning';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'The oath and the warning · Halaverga' };

export default function CrossingAccount() {
  return <main className={styles.page}><article>
    <a href="/crossing">Return to the flight</a>
    <h1>The oath and the warning</h1>
    <h2>In the Book of the Watchers</h2>
    <p>In the days of Jared, two hundred Watchers descend on Mount Hermon. They swear together to carry out their plan. <a href={sourcePassage}>Read 1 Enoch 6:4–6.</a></p>
    <h2>In this game</h2>
    <p>The shepherds, their signal fires and the Cloven Arch belong to this story. At first light, one shepherd cups the last live coal in a fold of wool. The other watches the red wings above the pass.</p>
    <p>You are already on wing. Pick a line through the pass to read how the flight ends.</p>
    <details name="flight-line"><summary>Dive into the snow hollow</summary><p>{account.low} You strike and it breaks away. The shepherds reach the fire. {account.reply}</p></details>
    <details name="flight-line"><summary>Follow the wind up the shoulder</summary><p>{account.high} You turn it aside just short of the arch. The shepherds touch their coal to the brushwood. {account.reply}</p></details>
    <details name="flight-line"><summary>Fly straight to the arch</summary><p>{account.miss}</p></details>
  </article></main>;
}
