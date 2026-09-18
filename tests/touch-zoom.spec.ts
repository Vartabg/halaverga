import { expect, test } from '@playwright/test';
test('flight owns dual gestures while paused browser pinch zoom stays available', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).tap();
  const cdp = await context.newCDPSession(page);
  const scale = () => page.evaluate(() => window.visualViewport!.scale);
  const pinch = () => cdp.send('Input.synthesizePinchGesture', { x: 190, y: 450, scaleFactor: 1.5, relativeSpeed: 600, gestureSourceType: 'touch' });
  const initial = await scale();
  await pinch(); expect(await scale()).toBeCloseTo(initial);
  await page.getByRole('button', { name: 'Pause expedition' }).tap();
  await expect(page.getByTestId('flight-surface')).toHaveCount(0);
  await pinch(); await expect.poll(scale).toBeGreaterThan(initial + .2);
  await context.close();
});
