import { FX } from '@/game/banishState';
import { audioBus } from './audioBus';
/** Layer the existing capped/mutable voice bus: armor rings, contact has weight, the closing seal has a lower tail. */
export function combatAudio(kind: number, elite: boolean, chain: number, guarded = false, cut = 2) {
  // A thrown demon striking the mountain: a thud by how hard, with a crack on the hardest (cut carries the contact speed).
  if (kind === FX.shove) { audioBus.play('hit', { gain: .45 }); return; }
  if (kind === FX.impact) { audioBus.play('world', { gain: Math.min(.9, .2 + cut / 80) }); if (cut > 40) audioBus.play('blocked', { gain: .5 }); return; }
  if (kind === FX.sword && guarded) return;
  if (kind === FX.armor) { audioBus.play('steel', { gain: .8 }); audioBus.play('hit', { gain: .45 }); }
  // The string's first two cuts ring lighter and climb in pitch; the casting blow keeps the full weight.
  else if (kind === FX.sword && cut < 2 && !elite) { audioBus.play('hit', { gain: .6 + .18 * cut, chain: cut + 1 }); audioBus.play('steel', { gain: .3 + .18 * cut }); }
  else if (kind === FX.sword) { audioBus.play('kill', { gain: elite ? .95 : .85, chain }); audioBus.play('world', { gain: elite ? .45 : .3 }); }
  else if (kind === FX.bind) audioBus.play('blocked', { gain: elite ? .45 : .2 });
  else if (kind === FX.seal) { audioBus.play('blocked', { gain: elite ? .65 : .4 }); audioBus.play('burst', { gain: elite ? .4 : .28 }); }
}
export function wardenAudio(kind: string) {
  if (kind === 'tell') audioBus.play('world', { gain: .25 });
  else if (kind === 'launch') audioBus.play('steel', { gain: .4 });
  else if (kind === 'parry') { audioBus.play('blocked', { gain: .8 }); audioBus.play('steel', { gain: .7 }); }
  else if (kind === 'counter') { audioBus.play('steel', { gain: .9 }); audioBus.play('kill', { gain: .65 }); }
  else if (kind === 'dodge') audioBus.play('blocked', { gain: .35 });
}
