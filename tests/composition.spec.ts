import { expect, test } from '@playwright/test';
test('streamlined flight shares a stable camera anchor and settles back to hover', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.keyboard.down('KeyR'); await page.waitForTimeout(1800); await page.keyboard.up('KeyR');
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await page.waitForTimeout(2100);
  const telemetry = page.getByTestId('flight-telemetry');
  expect(Number(await telemetry.getAttribute('data-lean'))).toBeLessThan(-1);
  const distances: number[] = [];
  for (let i = 0; i < 5; i++) {
    const physical = JSON.parse((await telemetry.getAttribute('data-position'))!);
    const rendered = JSON.parse((await telemetry.getAttribute('data-rendered-position'))!);
    expect(Math.hypot(...physical.map((v: number, n: number) => v - rendered[n]))).toBeLessThan(.7);
    distances.push(Number(await telemetry.getAttribute('data-camera-distance')));
    await page.waitForTimeout(160);
  }
  expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(.03);
  await page.keyboard.up('KeyW'); await page.waitForTimeout(1400);
  expect(Math.abs(Number(await telemetry.getAttribute('data-lean')))).toBeLessThan(.15);
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByRole('button', { name: 'First person', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click(); await page.waitForTimeout(800);
  expect(Number(await telemetry.getAttribute('data-camera-distance'))).toBeLessThan(.7);
});
