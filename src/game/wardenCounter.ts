import { WA, WARDEN } from './banishState';
import { type Wardens } from './wardenState';
/** Defense makes an opening, never an automatic hit. The same strike/tap/Chain input cashes it in on physical contact. */
export function exposeWarden(w: Wardens, i: number, parry = false) {
  w.phase[i] = WA.recover; w.time[i] = 0;
  w.open[i] = w.hit[i] ? 0 : WARDEN.recover;
  if (w.open[i] > 0) {
    if (parry) w.parries++; else w.dodges++;
    w.last = i; w.result = parry ? 'parry' : 'dodge'; w.serial++;
  }
  w.bolts.forEach(o => { if (o.src === i) o.live = false; });
}
export function reserveWardenCounter(w: Wardens, i: number) {
  if (w.phase[i] === WA.recover && (w.open[i] > 0 || w.opened[i] > 0)) w.pending = i;
}
export function takeWardenCounter(w: Wardens, i: number) {
  if (w.pending !== i && !(w.phase[i] === WA.recover && w.open[i] > 0)) return false;
  w.pending = -1; w.open[i] = 0; w.phase[i] = WA.idle; w.active = -1;
  w.last = i; w.result = 'counter'; w.serial++; w.counters++;
  return true;
}
