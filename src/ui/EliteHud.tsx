import { useEffect, useState } from 'react';
import { banish, MODE } from '@/game/banishState';
import { battle } from '@/game/celestialBattle';
import { isElite, ELITES } from '@/game/encounter';
import { runtime } from '@/game/runtime';
import { strike } from '@/game/strike';
import WardenDefense from './WardenDefense';
import { WA, WARDEN, wardenName } from '@/game/banishState';
import styles from './BattleHud.module.css';
const sample = () => {
  const width = typeof window === 'undefined' ? 1 : window.innerWidth, height = typeof window === 'undefined' ? 1 : window.innerHeight;
  const w = banish.wardens;
  const sealing = isElite(banish.last) && banish.mode[banish.last] >= MODE.bound && runtime.shooter.targets[banish.last]?.alive ? banish.last : -1;
  let i = sealing >= 0 ? sealing : w.active >= 0 ? w.active : strike.phase > 0 && isElite(strike.target) ? strike.target : isElite(battle.charging) ? battle.charging : -1;
  if (i < 0) {
    let best = Infinity;
    for (const k of ELITES) {
      const t = runtime.shooter.targets[k], a = runtime.shooter.aim;
      const x = t.c.x - runtime.position.x, y = t.c.y - runtime.position.y, z = t.c.z - runtime.position.z, d = Math.hypot(x, y, z);
      const dot = (x * a.dir.x + y * a.dir.y + z * a.dir.z) / (d || 1), rank = (1 - dot) * 80 + d * .12;
      if (t.alive && t.los && d < 70 && dot > .6 && rank < best) { i = k; best = rank; }
    }
  }
  const a = runtime.shooter.aim, p = runtime.shooter.targets[i]?.c;
  let incoming = false;
  for (const o of w.bolts) {
    if (!o.live || o.src !== i) continue;
    const r = runtime.position, x = r.x - o.p.x, y = r.y - o.p.y, z = r.z - o.p.z;
    const t = (x * o.v.x + y * o.v.y + z * o.v.z) / (o.v.x ** 2 + o.v.y ** 2 + o.v.z ** 2 || 1);
    if (t > 0 && t <= WARDEN.parry && Math.hypot(x - o.v.x * t, y - o.v.y * t, z - o.v.z * t) < 2.5) incoming = true;
  }
  if (w.move[i] === WA.sweep && w.phase[i] === WA.tell && w.tell[i] - w.time[i] <= WARDEN.parry) incoming = true;
  const x = p ? p.x - a.origin.x : 0, y = p ? p.y - a.origin.y : 0, z = p ? p.z - a.origin.z : 0;
  const depth = x * a.dir.x + y * a.dir.y + z * a.dir.z, half = Math.tan(a.fov * Math.PI / 360);
  const sx = depth > 0 ? width / 2 + (x * a.right.x + y * a.right.y + z * a.right.z) * height / (2 * depth * half) : -1;
  const sy = depth > 0 ? height / 2 - (x * a.up.x + y * a.up.y + z * a.up.z) * height / (2 * depth * half) : -1;
  return { i, x: Math.round(sx), y: Math.round(sy), armor: i >= 0 ? banish.armor[i] : 0, recovery: i >= 0 && banish.guardTime[i] > 0, mode: i >= 0 ? banish.mode[i] : 0,
    attack: w.phase[i] ?? 0, opening: (w.open[i] ?? 0) > 0 || w.pending === i && i >= 0,
    move: w.move[i] ?? 0, turn: w.turns[i] ?? 0, fierce: !!w.fierce[i],
    progress: Math.round(Math.min(1, (w.time[i] ?? 0) / (w.tell[i] || 1)) * 100),
    gate: w.gate[i] ?? 0, battleClock: Math.floor(battle.clock), battleStatus: battle.status, incoming, counters: w.counters, parries: w.parries, serial: w.serial, visible: i >= 0 && runtime.shooter.targets[i]?.alive, charging: battle.charging === i && i >= 0 };
};
export default function EliteHud() {
  const [s, set] = useState(sample);
  const defend = s.visible && s.mode < MODE.down && s.attack !== WA.idle && s.attack !== WA.recover;
  useEffect(() => { const id = setInterval(() => { const n = sample(); set(old => JSON.stringify(old) === JSON.stringify(n) ? old : n); }, 80); return () => clearInterval(id); }, []);
  if (!s.visible) return null;
  const text = s.mode === MODE.cast ? 'Cast into the abyss' : s.mode === MODE.bound ? 'Bound · the abyss opens' : s.opening ? s.armor > 1 ? 'COUNTER · strike to break an armor layer' : 'COUNTER · strike to banish'
    : s.incoming ? s.move === WA.sweep ? 'SHIELD NOW · turn the cleave' : 'SHIELD NOW · turn the volley'
    : defend ? s.move === WA.rush ? 'RUSH · hold Evade to clear the lane' : s.move === WA.sweep ? 'CLEAVE · shield or retreat out of reach'
      : s.move === WA.fan ? 'SPLITFIRE · hover in the center gap' : 'VOLLEY · dodge or time your shield'
    : s.attack === WA.recover ? 'Recovering · keep moving' : s.charging || s.recovery ? 'Ready to answer · keep moving' : s.armor > 0 ? 'Bait its attack · punish the opening' : 'Exposed · strike to banish';
  return <aside className={styles.elite} data-testid="elite-hud" data-target={s.i} data-armor={s.armor} data-x={s.x} data-y={s.y} data-mode={s.mode} data-recovering={String(s.recovery)} data-attack={s.attack} data-move={s.move} data-turn={s.turn} data-fierce={String(s.fierce)} data-opening={String(s.opening)} data-counters={s.counters} data-parries={s.parries} data-parry-window={String(s.incoming)} data-progress={s.progress} data-gate={s.gate} data-battle-clock={s.battleClock} data-battle-status={s.battleStatus} aria-label="Abyssal warden">
    <span>{wardenName(s.i).toUpperCase()} <i aria-label={`${s.armor} armor layers remaining`}>{s.armor > 0 ? '◆'.repeat(s.armor) : 'EXPOSED'}</i></span>
    <strong role="status">{text}</strong>
    {s.attack === WA.tell && <progress aria-label="Attack commitment" value={s.progress} max={100} />}
    {defend && <WardenDefense move={s.move} turn={s.turn} />}
  </aside>;
}
