import { expect, test, type Page } from '@playwright/test';
import { finishString, flyTo } from './flight-support';

async function takeWing(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  await expect(page.getByTestId('combat-target')).toBeVisible();
}

async function sealFocusedWatcher(page: Page, total: number) {
  const hud = page.getByTestId('battle-hud');
  const effects = async () => Number(await hud.getAttribute('data-banish-fx'));
  const before = await effects();
  await page.keyboard.press('KeyC');
  await expect.poll(effects).toBeGreaterThan(before);
  await finishString(page);
  await expect(hud).toHaveAttribute('data-banished', String(total));
}

test('seal a Watcher at the Threshold, then fly and fight above the eastern terrace', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|webgl/i.test(message.text())) errors.push(message.text()); });
  await takeWing(page);
  const hud = page.getByTestId('battle-hud'), aim = page.getByTestId('combat-target');
  const telemetry = page.getByTestId('flight-telemetry');
  const position = async () => JSON.parse((await telemetry.getAttribute('data-position'))!) as [number, number, number];

  await expect(hud.getByText('Threshold', { exact: true })).toBeVisible();
  await expect(page.getByTestId('patrol-route')).toHaveText('4 Watchers nearby');
  await sealFocusedWatcher(page, 1);
  await expect(page.getByTestId('patrol-route')).toHaveText('3 Watchers nearby');

  await page.keyboard.down('KeyR');
  try { await expect.poll(async () => (await position())[1], { timeout: 12000 }).toBeGreaterThan(79); }
  finally { await page.keyboard.up('KeyR'); await page.keyboard.press('KeyB'); }
  await expect.poll(async () => Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.5);
  await flyTo(page, [33, 82, -28], 9);
  await expect(hud.getByText('High Sanctuary', { exact: true })).toBeVisible();
  await expect(page.getByTestId('patrol-route')).toHaveText('2 Watchers nearby');
  await expect(aim).toHaveAttribute('data-target', /^[46]$/);
  await page.screenshot({ path: test.info().outputPath('high-sanctuary.png') });

  await sealFocusedWatcher(page, 2);
  expect(errors).toEqual([]);
});

test('regrouping reopens a sealed patrol and resets the ward', async ({ page }) => {
  await takeWing(page);
  await sealFocusedWatcher(page, 1);
  await expect(page.getByTestId('patrol-route')).toHaveText('3 Watchers nearby');
  await expect(page.getByRole('heading', { name: 'Your ward is broken' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: 'Return to the threshold' }).click();
  const hud = page.getByTestId('battle-hud');
  await expect(hud).toHaveAttribute('data-banished', '0');
  await expect(hud).toHaveAttribute('data-ward', '3');
  await expect(page.getByTestId('patrol-route')).toHaveText('4 Watchers nearby');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'false');
});
