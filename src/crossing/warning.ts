import type { Crossing } from './flight';

/** The lead witness reaches the fire on the arch just over two seconds after the interception. */
export const FIRST_FIRE = 2.15;
export const VALLEY_REPLY = 5.2;
export const WATCHER_TURN = 5.45;
export const sourcePassage = 'https://sacredatlas.org/read/enoch/6/';

export const account = {
  title: 'The Cloven Arch',
  opening: 'Two shepherds heard the Watchers’ oath. Hold off their pursuer so they can light a warning fire for the camp below.',
  low: 'The Watcher folds its wings into the snow hollow on your left. A dive brings you alongside while it is still low.',
  high: 'Snow lifts from the bare shoulder on your right. Hold that line and the rising air carries you toward the Watcher as it climbs.',
  miss: 'The Watcher lands between the shepherds and the fire. They cover the last coal and turn back. The camp below sleeps on.',
  reply: 'A second fire answers from the tents. The camp has seen the warning.',
};

export function warningBeat({ phase, elapsed, after }: Pick<Crossing, 'phase' | 'elapsed' | 'after'>) {
  if (phase === 'safe') {
    if (after >= VALLEY_REPLY) return 'answered';
    return after >= FIRST_FIRE ? 'lit' : 'carrying';
  }
  if (phase === 'late') return 'hidden';
  if (phase === 'flight' && elapsed >= WATCHER_TURN && elapsed < WATCHER_TURN + 1.55) return 'turn';
  if (phase === 'flight' && elapsed < 2) return 'pursuit';
  return 'waiting';
}
export type WarningBeat = ReturnType<typeof warningBeat>;

export const warningWords: Record<WarningBeat, string> = {
  waiting: '',
  pursuit: '“Keep the coal alive.”',
  turn: '“It’s coming back for us!”',
  carrying: 'The elder carries the coal out onto the span.',
  lit: 'Their fire catches. Across the ravine, someone is watching.',
  answered: account.reply,
  hidden: 'The shepherds cover the coal. No signal reaches the camp.',
};
