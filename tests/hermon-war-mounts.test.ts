import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// The suite reads module text, not the scene graph, so a swapped component can drop approved content with every other test green.
// These guards name what the Hermon scene and the fight must keep mounting.
const read = (path: string) => readFileSync(path, 'utf8');
it('keeps the Hermon world and the whole fight mounted in the scene', () => {
  const scene = read('src/world/Scene.tsx');
  for (const part of ["import City from './HermonCity'", '<City />', '<RuinField />', '<Sky />', '<Water />', '<Skyline />', '<Drift />', '<SealedGround />',
    '<Shooter />', '<Drones />', '<Battle />', '<Banishment />', '<FlamingSword />', 'useLoader(GLTFLoader, ADVERSARY_URL)']) expect(scene, part).toContain(part);
  for (const gone of ['Sanctuary', 'Abyss', 'CelestialVault', 'ThroneWitness', 'BreachRoutes', 'ArmCannon']) expect(scene, gone).not.toContain(gone);
});
it('keeps the massif, the cedars and the village on the mountain', () => {
  const city = read('src/world/HermonCity.tsx');
  for (const part of ['<MassifTerrain chunks={city.terrains} />', '<Reclamation />', '<Village />']) expect(city, part).toContain(part);
});
it('keeps the demons, their wardens and the battle panels mounted', () => {
  const drones = read('src/world/Drones.tsx'), hud = read('src/ui/BattleHud.tsx'), experience = read('src/ui/Experience.tsx'), hint = read('src/ui/ControlsHint.tsx');
  for (const part of ['createDemonActors(', '<EliteGuard', '<WardenAttacks']) expect(drones, part).toContain(part);
  for (const part of ['<CombatTarget />', '<EliteHud />', 'data-testid="battle-hud"']) expect(hud, part).toContain(part);
  expect(experience).toContain('<BattleHud />'); expect(experience).toContain('ControlsHint'); expect(hint).toContain('<FlightFeel />');
});
it('leaves none of the retired sanctuary setting in the player-facing copy', () => {
  for (const path of ['src/ui/BattleHud.tsx', 'src/ui/EliteHud.tsx', 'src/ui/Landing.tsx', 'src/ui/ShooterSettings.tsx', 'src/app/layout.tsx', 'src/app/manifest.ts', 'src/content/arrival.json'])
    expect(read(path), path).not.toMatch(/War in Heaven|abyssal|the breach|celestial sanctuary|Begin expedition/i);
});
it('keeps every source module under 200 lines (AGENTS.md)', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  for (const path of walk('src')) expect(read(path).split('\n').length, path).toBeLessThanOrEqual(200);
});
it('feeds the fight its frame state: the Hermon branch once dropped this line and every timer in the fight stood still', () => {
  expect(read('src/game/Shooter.tsx')).toContain('ctx.dt = delta; ctx.paused = game.paused; ctx.reduced = game.reduced; ctx.flying = game.flying;');
});
