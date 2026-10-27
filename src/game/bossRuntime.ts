import { createSemjaza, SemjazaBoss } from './semjazaBoss';
import { createSpearCombat, SpearCombatState } from './spearCombat';
import { createSpearProjectile, SpearProjectile } from './spearThrow';

/** Authoritative runtime instances for boss and celestial spear combat outside React state. */
export const bossRuntime: {
  boss: SemjazaBoss;
  combat: SpearCombatState;
  spear: SpearProjectile;
  dialogueOpen: boolean;
} = {
  boss: createSemjaza(),
  combat: createSpearCombat(),
  spear: createSpearProjectile(),
  dialogueOpen: true,
};

export function resetBossEncounter(): void {
  bossRuntime.boss = createSemjaza();
  bossRuntime.combat = createSpearCombat();
  bossRuntime.spear = createSpearProjectile();
  bossRuntime.dialogueOpen = true;
}
