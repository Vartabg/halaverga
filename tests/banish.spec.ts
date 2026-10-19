import { expect, test, type Page } from '@playwright/test';
// War in Heaven, played with the keyboard (docs/research/combat-texts.md): hold V for the shield, find a demon under the reticle,
// rebuke it and keep pressing C (the next step: rebuke or sword, bind once it is down, then cast) until the abyss takes it.
const hud = (page: Page) => page.getByTestId('battle-hud');
const fx = async (page: Page) => Number(await hud(page).getAttribute('data-banish-fx'));

test('rebuke, sword, bind and cast banish a demon while the shield holds', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(600); await page.keyboard.press('Space');
  await page.keyboard.down('KeyV');
  // Sweep the view until a rebuke lands on a demon under the reticle.
  let found = false;
  for (let k = 0; k < 90 && !found; k++) {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(45); await page.keyboard.up('ArrowRight');
    const before = await fx(page); await page.keyboard.press('Digit1'); await page.waitForTimeout(90);
    found = await fx(page) > before;
  }
  expect(found).toBe(true);
  await expect(page.getByText('“May the Lord rebuke you!”')).toBeVisible();
  await test.info().attach('rebuke', { body: await page.screenshot(), contentType: 'image/png' });
  // Close in and keep taking the next step.
  // C keeps rebuking at range (Mark 1:25) and takes the sword up close, until the demon is thrown down.
  await expect.poll(async () => {
    await page.keyboard.press('KeyC'); return (await hud(page).getAttribute('data-modes')) ?? '';
  }, { timeout: 30000, intervals: [300] }).toMatch(/[23]/);
  await test.info().attach('thrown-down', { body: await page.screenshot(), contentType: 'image/png' });
  await expect.poll(async () => { await page.keyboard.press('KeyC'); return Number(await hud(page).getAttribute('data-banished')); },
    { timeout: 15000, intervals: [250] }).toBeGreaterThan(0);
  await test.info().attach('sealed', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.up('KeyV');
  await expect(page.getByTestId('shooter-hud')).toHaveAttribute('data-kills', /[1-9]/);
  expect(errors).toEqual([]);
});
