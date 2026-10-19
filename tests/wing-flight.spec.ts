import { expect, test } from '@playwright/test';
import { seed } from './shooter-browser';

test('the winged character survives takeoff, hover, fast flight and a braking transition', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 },
    recordVideo: { dir: info.outputPath('motion'), size: { width: 1440, height: 960 } } });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await seed(page, { controlsVersion: 6, desktopMode: 'trackpad', trackpadSteering: 'simple' });
    await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
    await page.mouse.move(720, 450); const telemetry = page.getByTestId('flight-telemetry');
    await page.keyboard.press('Space'); await page.keyboard.down('KeyR'); await page.waitForTimeout(650); await page.keyboard.up('KeyR');
    await page.waitForTimeout(900);
    await expect(telemetry).toHaveAttribute('data-flying', 'true');
    await info.attach('wing-hover', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await page.waitForTimeout(3100);
    expect(Number(await telemetry.getAttribute('data-speed'))).toBeGreaterThan(20);
    await info.attach('wing-glide', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.up('KeyW'); await page.waitForTimeout(160);
    await info.attach('wing-brake', { body: await page.screenshot(), contentType: 'image/png' });
    await page.waitForTimeout(1000); expect(Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.6);
    expect(errors).toEqual([]);
  } finally {
    const video = page.video(); await context.close(); if (video) await info.attach('wing-flight-motion', { path: (await video.path())!, contentType: 'video/webm' });
  }
});
