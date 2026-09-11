import { expect, test } from '@playwright/test';
for (const first of ['left', 'right'] as const) for (const released of ['left', 'right'] as const) {
  test(`adaptive thumbs: ${first} arrives first, ${released} releases first`, async ({ browser }) => {
    const viewport = first === 'left' ? { width: 393, height: 852 } : { width: 852, height: 393 };
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
    const cdp = await context.newCDPSession(page), surface = page.getByTestId('flight-surface');
    const telemetry = page.getByTestId('flight-telemetry');
    const value = async (key: string) => Number(await telemetry.getAttribute(`data-${key}`));
    const position = async () => JSON.parse((await telemetry.getAttribute('data-position'))!) as number[];
    const left = { id: 1, x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) };
    const right = { id: 2, x: Math.round(viewport.width * .75), y: left.y };
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: typeof left[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await send('touchStart', [first === 'left' ? left : right]); await page.waitForTimeout(450);
    const heading = await value('heading'), pitch = await value('pitch');
    await send('touchStart', [left, right]);
    await expect(surface).toHaveAttribute('data-control-mode', 'dual');
    await page.waitForTimeout(900);
    expect(await value('heading')).toBe(heading); expect(await value('pitch')).toBe(pitch);
    expect(await value('speed')).toBeLessThan(.5);
    const start = await position(), origin = { ...left };
    left.x += 35; left.y -= 70; await send('touchMove', [left, right]); await page.waitForTimeout(750);
    expect(await value('speed')).toBeGreaterThan(10);
    expect((await position())[0]).toBeGreaterThan(start[0] + 2);
    expect(await value('heading')).toBe(heading); // Left movement cannot rotate the view.
    right.x += 35; right.y -= 25; await send('touchMove', [left, right]); await page.waitForTimeout(450);
    expect(await value('heading')).toBeLessThan(heading - .12); expect(await value('pitch')).toBeGreaterThan(pitch + .08);
    Object.assign(left, origin); await send('touchMove', [left, right]); await page.waitForTimeout(1100);
    expect(await value('speed')).toBeLessThan(.5); // Center left = look while hovering.
    const beforeRelease = await value('heading'), remaining = released === 'left' ? right : left;
    // CDP touchEnd lists contacts to release, unlike touchMove's active contact list.
    await send('touchEnd', [released === 'left' ? left : right]); await expect(surface).toHaveAttribute('data-control-mode', 'single');
    await page.waitForTimeout(500); expect(await value('speed')).toBeLessThan(.5);
    expect(await value('heading')).toBe(beforeRelease);
    remaining.x += 25; await send('touchMove', [remaining]); await page.waitForTimeout(750);
    await expect(surface).toHaveAttribute('data-control-mode', 'single');
    expect(await value('speed')).toBeGreaterThan(3); expect(await value('heading')).toBeLessThan(beforeRelease - .08);
    await send('touchEnd', []); await page.waitForTimeout(1000); expect(await value('speed')).toBeLessThan(.5);
    expect(errors).toEqual([]); await context.close();
  });
}
test('neutral dual thumbs look without launching; cancellation and extra contacts cannot latch flight', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  const cdp = await context.newCDPSession(page), surface = page.getByTestId('flight-surface'), telemetry = page.getByTestId('flight-telemetry');
  const left = { id: 1, x: 90, y: 650 }, right = { id: 2, x: 290, y: 650 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  right.x += 35;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [left, right] });
  await page.waitForTimeout(700);
  await expect(telemetry).toHaveAttribute('data-flying', 'false');
  expect(Number(await telemetry.getAttribute('data-heading'))).toBeLessThan(-.1);
  left.y -= 70; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [left, right] });
  await page.waitForTimeout(600); await expect(telemetry).toHaveAttribute('data-flying', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right, { id: 3, x: 190, y: 550 }] });
  await expect(surface).toHaveAttribute('data-control-mode', 'blocked'); await page.waitForTimeout(1100);
  expect(Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 3, x: 190, y: 550 }] });
  await expect(surface).toHaveAttribute('data-control-mode', 'blocked');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(surface).toHaveAttribute('data-control-mode', 'idle');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 4, x: 90, y: 650 }, { id: 5, x: 290, y: 650 }] });
  await expect(surface).toHaveAttribute('data-control-mode', 'dual');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(surface).toHaveAttribute('data-control-mode', 'idle');
  await page.waitForTimeout(500); expect(Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await context.close();
});
