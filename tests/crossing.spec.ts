import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('a flight without steering lets the Watcher through and offers a fresh attempt', async ({ page }) => {
  await page.goto('/crossing');
  await page.getByRole('button', { name: 'Take wing' }).click();
  const game = page.getByRole('main');
  await expect(game).toHaveAttribute('data-phase', 'flight');
  await expect.poll(async () => {
    await page.keyboard.press('KeyC');
    return game.getAttribute('data-phase');
  }, { intervals: [160], timeout: 35000 }).toBe('late');
  await expect(page.getByRole('heading', { name: 'The travelers turn back.' })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Fly again' });
  await expect(retry).toBeFocused();
  await retry.press('Enter');
  await expect(game).toHaveAttribute('data-phase', 'flight');
  await expect(game).toHaveAttribute('data-in-reach', 'false');
});

test('opening, pause and context-loss recovery are accessible by keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/crossing');
  const takeWing = page.getByRole('button', { name: 'Take wing' });
  await expect(takeWing).toBeFocused();
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await takeWing.press('Enter');
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: 'Resume flight' });
  await expect(resume).toBeFocused();
  expect((await scan()).violations).toEqual([]);
  await resume.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.locator('canvas').dispatchEvent('webglcontextlost', { cancelable: true });
  const reload = page.getByRole('button', { name: 'Reload flight' });
  await expect(reload).toBeFocused();
  await reload.press('Enter');
  await expect(takeWing).toBeFocused();
});

test('rotating the phone pauses even with a thumb held on the flight surface', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('/crossing');
    await page.getByRole('button', { name: 'Take wing' }).tap();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 350, id: 1 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 390, id: 1 }] });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'Flight paused' })).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.getByRole('button', { name: 'Resume flight' }).tap();
    await expect(page.getByRole('main')).toHaveAttribute('data-phase', 'flight');
  } finally {
    await context.close();
  }
});
