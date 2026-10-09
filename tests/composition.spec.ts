import { expect, test } from '@playwright/test';
test('streamlined flight shares a stable camera anchor and settles back to hover', async ({ page }) => {
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).click();
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

test('rapid trackpad turns keep the human facing away from the chase camera', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ trackpadSteering: 'captured', cruiseSpeed: 8 })));
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  const telemetry = page.getByTestId('flight-telemetry');
  for (const x of [1400, 40, 1400, 40]) {
    await page.mouse.move(x, 500, { steps: 3 }); await page.waitForTimeout(370);
    const body = Number(await telemetry.getAttribute('data-suit-heading'));
    const camera = Number(await telemetry.getAttribute('data-view-heading'));
    // Turn-360 (2026-09-25): a view turn over 2 rad/s widens the body facing to FACING_PATH (0.6 rad), still back-to-camera.
    expect(Math.abs(Math.atan2(Math.sin(body - camera), Math.cos(body - camera)))).toBeLessThan(.62);
  }
  await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
});

test('a steep climb keeps the suit pitched with the view so the chase camera still sees its back', async ({ page }) => {
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.keyboard.down('KeyR'); await page.waitForTimeout(1200); await page.keyboard.up('KeyR');
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await page.waitForTimeout(1500);
  await page.keyboard.down('ArrowUp');
  const telemetry = page.getByTestId('flight-telemetry');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    const suit = Number(await telemetry.getAttribute('data-suit-pitch')), view = Number(await telemetry.getAttribute('data-view-pitch'));
    expect(suit).toBeGreaterThan(view - .25); expect(suit).toBeLessThan(view + .5);
  }
  expect(Number(await telemetry.getAttribute('data-view-pitch'))).toBeGreaterThan(1);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('KeyW');
});
