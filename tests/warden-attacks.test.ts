import { expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA } from '../src/game/banishState';
import { wardenWorld } from '../src/game/wardenMath';
import { battle } from '../src/game/celestialBattle';
import { flowVisible } from '../src/game/combatFlow';
import { PHASE } from '../src/game/combat';
import { stepBanish } from '../src/game/banish';
it('does not begin behind the view, outside range, through geometry or when its silhouette is offscreen', () => {
  for (const block of ['behind', 'range', 'stone', 'offscreen', 'dead'] as const) {
    const { s, i, w, player, step, tick } = wardenSetup();
    if (block === 'behind') s.aim.dir.z = 1;
    if (block === 'range') player.z = 90;
    if (block === 'stone') wardenWorld.clear = () => false;
    if (block === 'offscreen') flowVisible[i] = 0;
    if (block === 'dead') s.drones.hp[i] = 0;
    step(); tick(2); expect(w.phase[i], block).toBe(WA.idle); expect(battle.ward).toBe(3);
  }
});
it('permits just one elite turn at once, including its punish window', () => {
  const { b, s, w, step, tick } = wardenSetup(); s.drones.hp[7] = 6; s.drones.phase[7] = PHASE.alert; w.cool[7] = 0;
  Object.assign(s.drones.pos[7], { x: 3, y: 35, z: 0 }); step(); expect(w.phase[5]).toBe(WA.tell); expect(w.phase[7]).toBe(WA.idle);
  tick(2.2); expect(w.phase[7]).toBe(WA.idle); expect(b.guardTime[7]).toBe(0);
});
it('does not rush a fly-through; a deliberate visible hover invites the first attack', () => {
  const { w, i, player, step, tick } = wardenSetup(); w.engage[i] = 0;
  for (let n = 0; n < 20; n++) { player.x += .2; step(); }
  expect(w.phase[i]).toBe(WA.idle); tick(.7); expect(w.phase[i]).toBe(WA.tell);
});
it('keeps lesser darts from ambushing an active elite exchange or its finisher; leaving ends that protection', () => {
  const { w, i, b, player, step, tick } = wardenSetup(); step(); expect(w.duel).toBe(i);
  tick(4.3); expect(battle.nextAttack).toBeGreaterThan(battle.clock + .7);
  b.mode[i] = 3; player.z = 100; step(); expect(w.duel).toBe(i);
  b.mode[i] = 0; step(); expect(w.duel).toBe(-1);
});
it('drains already airborne lesser darts before the elite tell, without deleting them or allowing another cast', () => {
  const { w, i, step, tick } = wardenSetup(); battle.bolts[0].live = true;
  step(); tick(.8); expect(w.phase[i]).toBe(WA.idle); expect(w.gate[i]).toBe(15); expect(battle.bolts[0].live).toBe(true);
  expect(battle.nextAttack).toBeGreaterThan(battle.clock + .7);
  battle.bolts[0].live = false; step(); expect(w.phase[i]).toBe(WA.tell);
});
it('zero-delta pause freezes all attack work; a fallen battle cancels threats and releases held enemies', () => {
  const { b, s, w, i, step } = wardenSetup(); step(); const before = JSON.stringify(w); step(0); expect(JSON.stringify(w)).toBe(before);
  battle.status = 'fallen'; step(); expect(w.phase[i]).toBe(WA.idle); expect(w.active).toBe(-1); expect(s.drones.held[i]).toBe(0); expect(b.guardTime[i]).toBe(0);
});
it('freezes elite movement and projectiles when the authoritative encounter clock stops after landing', () => {
  const { b, s, w, i, player, step } = wardenSetup(); step(); const time = w.time[i];
  stepBanish(b, s, player, .05); expect(w.time[i]).toBe(time); expect(w.phase[i]).toBe(WA.tell);
  battle.clock += .05; stepBanish(b, s, player, .05); expect(w.time[i]).toBeGreaterThan(time);
});
it('another warden cannot begin or continue an attack while an elite is being bound and cast', () => {
  const { b, s, w, step, tick } = wardenSetup(); s.drones.hp[7] = 6; s.drones.phase[7] = PHASE.alert;
  w.phase[7] = WA.volley; w.active = 7; w.bolts[0].live = true; w.bolts[0].src = 7; b.mode[5] = 3;
  step(); expect(w.phase[7]).toBe(WA.idle); expect(w.bolts[0].live).toBe(false); expect(w.duel).toBe(5);
  tick(1); expect(w.phase[7]).toBe(WA.idle);
});
