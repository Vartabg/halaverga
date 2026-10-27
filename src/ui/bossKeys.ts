import { bossRuntime } from '@/game/bossRuntime';
import { triggerAttack, triggerDash, triggerDiveSmite } from '@/game/spearCombat';
import { launchSpear, recallSpear } from '@/game/spearThrow';
import { runtime } from '@/game/runtime';

export interface BossInputState {
  started: boolean;
  paused: boolean;
  flying: boolean;
  nearTerminal: boolean;
}

export function handleBossKeyDown(
  e: { code: string; repeat: boolean; targetTag: string },
  state: BossInputState
): boolean {
  if (!state.started || state.paused || e.repeat) return false;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.targetTag)) return false;

  if (e.code === 'KeyJ' || (e.code === 'KeyE' && !state.nearTerminal)) {
    triggerAttack(bossRuntime.combat);
    return true;
  }
  if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    triggerDash(bossRuntime.combat);
    return true;
  }
  if (e.code === 'KeyC') {
    if (state.flying || runtime.position.y > 35) {
      triggerDiveSmite(bossRuntime.combat);
    } else {
      triggerAttack(bossRuntime.combat);
    }
    return true;
  }
  if (e.code === 'KeyL') {
    if (!bossRuntime.spear.active) {
      launchSpear(
        bossRuntime.spear,
        runtime.position.x,
        runtime.position.y + 1.2,
        runtime.position.z,
        Math.sin(runtime.yaw),
        0.05,
        -Math.cos(runtime.yaw)
      );
    } else {
      recallSpear(bossRuntime.spear);
    }
    return true;
  }

  return false;
}

export function handleBossMouseDown(
  button: number,
  targetTag: string,
  state: BossInputState
): boolean {
  if (!state.started || state.paused) return false;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(targetTag)) return false;
  if (button === 0) {
    triggerAttack(bossRuntime.combat);
    return true;
  }
  return false;
}
