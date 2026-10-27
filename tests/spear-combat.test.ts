import { describe, expect, it } from 'vitest';
import {
  createSpearCombat,
  triggerAttack,
  triggerDash,
  triggerDiveSmite,
  updateSpearCombat,
  takePlayerDamage,
  MAX_WARDS,
  DASH_DURATION,
} from '@/game/spearCombat';
import {
  createSpearProjectile,
  launchSpear,
  recallSpear,
  updateSpearProjectile,
} from '@/game/spearThrow';

describe('Spear Combat & Covenant Wards', () => {
  it('chains 3-hit combo sequence with escalating damage', () => {
    const s = createSpearCombat();
    const hit1 = triggerAttack(s);
    expect(hit1).toBe(45);
    expect(s.comboStep).toBe(1);

    const hit2 = triggerAttack(s);
    expect(hit2).toBe(65);
    expect(s.comboStep).toBe(2);

    const hit3 = triggerAttack(s);
    expect(hit3).toBe(110);
    expect(s.comboStep).toBe(3);

    // Loop back to 1
    const hit4 = triggerAttack(s);
    expect(hit4).toBe(45);
    expect(s.comboStep).toBe(1);
  });

  it('provides invulnerability frames during Seraphic Dash', () => {
    const s = createSpearCombat();
    triggerDash(s);
    expect(s.isDashing).toBe(true);
    expect(s.invulnerableTimer).toBe(DASH_DURATION);

    // Incoming damage is negated
    const damaged = takePlayerDamage(s, 1);
    expect(damaged).toBe(false);
    expect(s.covenantWards).toBe(MAX_WARDS);
  });

  it('consumes covenant wards when taking unmitigated damage', () => {
    const s = createSpearCombat();
    const damaged = takePlayerDamage(s, 1);
    expect(damaged).toBe(true);
    expect(s.covenantWards).toBe(MAX_WARDS - 1);
    expect(s.invulnerableTimer).toBeGreaterThan(0); // grace period active
  });

  it('launches, embeds, and magnetically recalls the spear', () => {
    const spear = createSpearProjectile();
    launchSpear(spear, 0, 10, 0, 0, 0, 1);
    expect(spear.active).toBe(true);

    // Advance trajectory toward boss at (0, 10, 20)
    const res1 = updateSpearProjectile(spear, 0.45, 0, 10, 0, 0, 10, 20);
    expect(res1.hitBoss).toBe(true);
    expect(spear.embedded).toBe(true);

    // Recall spear back to player
    recallSpear(spear);
    expect(spear.recalling).toBe(true);

    // Fly back toward player
    const res2 = updateSpearProjectile(spear, 1.0, 0, 10, 0, 0, 10, 20);
    expect(res2.returnedToHand).toBe(true);
    expect(spear.active).toBe(false);
  });
});
