import { useEffect, useState } from 'react';
import { banish, MODE } from '@/game/banishState';
import { battle } from '@/game/celestialBattle';
import { isElite, ELITES } from '@/game/encounter';
import { runtime } from '@/game/runtime';
import { strike } from '@/game/strike';
import styles from './BattleHud.module.css';
const sample = () => {
  const width = typeof window === 'undefined' ? 1 : window.innerWidth, height = typeof window === 'undefined' ? 1 : window.innerHeight;
  let i = isElite(strike.target) ? strike.target : isElite(battle.charging) ? battle.charging : isElite(banish.last) ? banish.last : -1;
  if (i < 0) {
    let best = 70;
    for (const k of ELITES) {
      const t = runtime.shooter.targets[k], a = runtime.shooter.aim;
      const x = t.c.x - runtime.position.x, y = t.c.y - runtime.position.y, z = t.c.z - runtime.position.z, d = Math.hypot(x, y, z);
      if (t.alive && t.los && d < best && (x * a.dir.x + y * a.dir.y + z * a.dir.z) / d > .6) { i = k; best = d; }
    }
  }
  const a = runtime.shooter.aim, p = runtime.shooter.targets[i]?.c;
  const x = p ? p.x - a.origin.x : 0, y = p ? p.y - a.origin.y : 0, z = p ? p.z - a.origin.z : 0;
  const depth = x * a.dir.x + y * a.dir.y + z * a.dir.z, half = Math.tan(a.fov * Math.PI / 360);
  const sx = depth > 0 ? width / 2 + (x * a.right.x + y * a.right.y + z * a.right.z) * height / (2 * depth * half) : -1;
  const sy = depth > 0 ? height / 2 - (x * a.up.x + y * a.up.y + z * a.up.z) * height / (2 * depth * half) : -1;
  return { i, x: Math.round(sx), y: Math.round(sy), armor: i >= 0 ? banish.armor[i] : 0, recovery: i >= 0 && banish.guardTime[i] > 0, mode: i >= 0 ? banish.mode[i] : 0,
    visible: i >= 0 && runtime.shooter.targets[i]?.alive, charging: battle.charging === i && i >= 0 };
};
export default function EliteHud() {
  const [s, set] = useState(sample);
  useEffect(() => { const id = setInterval(() => { const n = sample(); set(old => JSON.stringify(old) === JSON.stringify(n) ? old : n); }, 80); return () => clearInterval(id); }, []);
  if (!s.visible) return null;
  const text = s.mode === MODE.cast ? 'Cast into the abyss' : s.mode === MODE.bound ? 'Bound · the abyss opens' : s.charging || s.recovery ? 'Evade or raise your shield' : s.armor > 0 ? 'Break its armor · keep moving' : 'Exposed · strike to banish';
  return <aside className={styles.elite} data-testid="elite-hud" data-target={s.i} data-armor={s.armor} data-x={s.x} data-y={s.y} data-mode={s.mode} data-recovering={String(s.recovery)} aria-label="Abyssal warden">
    <span>ABYSSAL WARDEN <i aria-label={`${s.armor} armor layers remaining`}>{s.armor > 0 ? '◆'.repeat(s.armor) : 'EXPOSED'}</i></span>
    <strong role="status">{text}</strong>
  </aside>;
}
