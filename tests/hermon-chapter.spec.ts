import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('both flights are reachable from home and the chapter has a keyboard-readable source', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ascend Mount Hermon' })).toBeVisible();
  await page.getByRole('link', { name: 'Play The Cloven Arch' }).click();
  await page.getByRole('link', { name: 'Story & source' }).click();
  await expect(page.getByRole('heading', { name: 'The oath and the warning' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read 1 Enoch 6:4–6.' })).toHaveAttribute('href', /enoch\/6\//);
  await page.getByText('Follow the wind up the shoulder', { exact: true }).press('Enter');
  await expect(page.locator('details[open] p')).toContainText('A second fire answers');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Return to the flight' }).click();
  await expect(page.getByRole('button', { name: 'Take wing' })).toBeEnabled();
});

test('the mountain account and its consequences work with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto('/crossing');
    await page.getByRole('link', { name: 'Story & source' }).click();
    for (const [choice, ending] of [['Dive into the snow hollow', 'camp has seen the warning'], ['Fly straight to the arch', 'camp below sleeps on']]) {
      await page.getByText(choice, { exact: true }).click();
      await expect(page.locator('details[open] p')).toContainText(ending);
    }
  } finally { await context.close(); }
});

test('the chapter title and takeoff fit above the toolbar in short phone landscape', async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 292 });
  await page.goto('/crossing');
  const takeoff = page.getByRole('button', { name: 'Take wing' });
  await expect(takeoff).toBeEnabled();
  const panel = page.getByRole('region', { name: 'The Cloven Arch' });
  await expect(panel.getByText(/Fiction after 1 Enoch 6/)).toBeVisible();
  const fits = await panel.evaluate(el => el.getBoundingClientRect().top >= 0 &&
    el.getBoundingClientRect().bottom <= window.innerHeight && el.scrollHeight <= el.clientHeight + 1);
  expect(fits).toBe(true);
});
