import { describe, expect, it, beforeEach } from 'vitest';
import { bossRuntime, resetBossEncounter } from '@/game/bossRuntime';
import { handleBossKeyDown, handleBossMouseDown, BossInputState } from '@/ui/bossKeys';

describe('boss combat keyboard and mouse input routing', () => {
  const liveState: BossInputState = {
    started: true,
    paused: false,
    flying: false,
    nearTerminal: false,
  };

  beforeEach(() => {
    resetBossEncounter();
  });

  it('triggers light attack combo on KeyJ', () => {
    expect(bossRuntime.combat.comboStep).toBe(0);

    const handled1 = handleBossKeyDown({ code: 'KeyJ', repeat: false, targetTag: 'BODY' }, liveState);
    expect(handled1).toBe(true);
    expect(bossRuntime.combat.comboStep).toBe(1);
    expect(bossRuntime.combat.attacking).toBe(true);

    const handled2 = handleBossKeyDown({ code: 'KeyJ', repeat: false, targetTag: 'BODY' }, liveState);
    expect(handled2).toBe(true);
    expect(bossRuntime.combat.comboStep).toBe(2);
  });

  it('triggers seraphic dash on KeyK and Shift', () => {
    expect(bossRuntime.combat.isDashing).toBe(false);

    const handled = handleBossKeyDown({ code: 'KeyK', repeat: false, targetTag: 'BODY' }, liveState);
    expect(handled).toBe(true);
    expect(bossRuntime.combat.isDashing).toBe(true);
    expect(bossRuntime.combat.invulnerableTimer).toBeGreaterThan(0);
  });

  it('triggers spear attack on primary mouse click', () => {
    expect(bossRuntime.combat.comboStep).toBe(0);

    const handled = handleBossMouseDown(0, 'BODY', liveState);
    expect(handled).toBe(true);
    expect(bossRuntime.combat.comboStep).toBe(1);
  });

  it('ignores clicks on buttons or form inputs', () => {
    const handledButton = handleBossMouseDown(0, 'BUTTON', liveState);
    expect(handledButton).toBe(false);
    expect(bossRuntime.combat.comboStep).toBe(0);

    const handledInput = handleBossKeyDown({ code: 'KeyJ', repeat: false, targetTag: 'INPUT' }, liveState);
    expect(handledInput).toBe(false);
  });

  it('triggers spear launch and recall on KeyL', () => {
    expect(bossRuntime.spear.active).toBe(false);

    const launchHandled = handleBossKeyDown({ code: 'KeyL', repeat: false, targetTag: 'BODY' }, liveState);
    expect(launchHandled).toBe(true);
    expect(bossRuntime.spear.active).toBe(true);
    expect(bossRuntime.spear.recalling).toBe(false);

    const recallHandled = handleBossKeyDown({ code: 'KeyL', repeat: false, targetTag: 'BODY' }, liveState);
    expect(recallHandled).toBe(true);
    expect(bossRuntime.spear.recalling).toBe(true);
  });

  it('ignores input when game is paused or not started', () => {
    const pausedState = { ...liveState, paused: true };
    const handled = handleBossKeyDown({ code: 'KeyJ', repeat: false, targetTag: 'BODY' }, pausedState);
    expect(handled).toBe(false);
    expect(bossRuntime.combat.comboStep).toBe(0);
  });
});
