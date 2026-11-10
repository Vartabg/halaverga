import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openSettings } from './lab-browser';
// Frame-time sample for before/after comparisons (PERF=1 only; not part of the regular suite). A throttled desktop browser is a
// rough proxy, never an iPhone measurement: record physical-device numbers separately.
test.skip(!process.env.PERF, 'PERF=1 runs the frame-time sample');
async function sample(page: Page, label: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyW');
  for (let k = 0; k < 16; k++) {
    const turn = k % 4 < 2 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(turn); await page.waitForTimeout(600); await page.keyboard.up(turn);
    await page.keyboard.press('KeyC'); await page.waitForTimeout(400);
  }
  await page.keyboard.up('KeyW');
  await openSettings(page);
  await page.getByText('Playtest measurements', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download measurements' }).click();
  const m = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  console.log(`PERF ${label}`, JSON.stringify({ seconds: m.seconds, samples: m.samples, p50Ms: m.p50Ms, p95Ms: m.p95Ms, stalls: m.stallsOver50Ms, resources: m.resources }));
  expect(m.samples).toBeGreaterThan(100);
}
test('desktop 1440x900', async ({ page }) => { test.setTimeout(90000); await sample(page, 'desktop'); });
test('phone-sized, CPU throttled 4x', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try { await sample(page, 'phone-throttled'); } finally { await context.close(); }
});
