import { expect, test, type Page } from '@playwright/test';
import { counterOnce } from './counter-support';
// Codex review 2026-10-20: counter, then pause, switch Holy fire off and resume. The slow-motion clock lives with the encounter,
// so flight must return to normal speed at once instead of staying slow until combat is switched back on.
const metresPerSecond = async (page: Page) => {
  const telemetry = page.getByTestId('flight-telemetry');
  const read = () => telemetry.evaluate(e => ({ at: performance.now(), pos: JSON.parse((e as HTMLElement).dataset.position ?? '[0,0,0]') as number[], speed: Number((e as HTMLElement).dataset.speed) }));
  await page.keyboard.down('KeyR'); await page.waitForTimeout(1500); const a = await read(); await page.waitForTimeout(2000); const b = await read();
  await page.keyboard.up('KeyR');
  return { ratio: Math.hypot(...a.pos.map((x, i) => b.pos[i] - x)) / ((b.at - a.at) / 1000) / b.speed, speed: b.speed };
};
test('pausing after a counter and switching Holy fire off returns flight to normal speed', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500); await page.keyboard.press('Space');
  await counterOnce(page);
  await page.keyboard.press('Escape'); // pause while the slow motion is still on
  await page.getByRole('region', { name: 'Expedition paused' }).getByRole('button', { name: 'Flight settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Holy fire (adversaries and casting)', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Resume flight', exact: true }).click();
  await expect(page.getByTestId('battle-hud')).toHaveCount(0);
  const off = await metresPerSecond(page);
  expect(off.speed).toBeGreaterThan(2);
  expect(off.ratio).toBeGreaterThan(.65); // slow motion left on would read about .2
  expect(errors).toEqual([]);
});
