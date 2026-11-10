import { FX } from '@/game/banishState';
import { audioBus } from './audioBus';
/** Layer the existing capped/mutable voice bus: armor rings, contact has weight, the closing seal has a lower tail. */
export function combatAudio(kind: number, elite: boolean, chain: number, guarded = false) {
  if (kind === FX.sword && guarded) return;
  if (kind === FX.armor) { audioBus.play('steel', { gain: .8 }); audioBus.play('hit', { gain: .45 }); }
  else if (kind === FX.sword) { audioBus.play('kill', { gain: elite ? .95 : .75, chain }); audioBus.play('world', { gain: elite ? .45 : .2 }); }
  else if (kind === FX.bind) audioBus.play('blocked', { gain: elite ? .45 : .2 });
  else if (kind === FX.seal) { audioBus.play('blocked', { gain: elite ? .65 : .35 }); if (elite) audioBus.play('burst', { gain: .4 }); }
}
export function wardenAudio(kind: string) {
  if (kind === 'tell') audioBus.play('world', { gain: .25 });
  else if (kind === 'launch') audioBus.play('steel', { gain: .4 });
  else if (kind === 'parry') { audioBus.play('blocked', { gain: .8 }); audioBus.play('steel', { gain: .7 }); }
  else if (kind === 'counter') { audioBus.play('steel', { gain: .9 }); audioBus.play('kill', { gain: .65 }); }
  else if (kind === 'dodge') audioBus.play('blocked', { gain: .35 });
}
