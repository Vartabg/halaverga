import { expect, test } from '@playwright/test';

for (const [side, x, camera] of [['left', 90, 'Third person'], ['right', 290, 'First person']] as const) {
  test(`one ${side} thumb lifts, aims, accelerates and brakes in ${camera}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
    if (camera === 'First person') {
      await page.getByRole('button', { name: 'Flight settings' }).tap();
      await page.getByRole('button', { name: camera, exact: true }).tap();
      await page.getByRole('button', { name: 'Close dialog' }).tap();
    }
    await expect(page.getByRole('button', { name: 'Surge', exact: true })).toHaveCount(0);
    const telemetry = page.getByTestId('flight-telemetry'), cdp = await context.newCDPSession(page);
    const metric = async (name: string) => Number(await telemetry.getAttribute(`data-${name}`));
    const send = async (type: 'touchStart' | 'touchMove', px: number, py: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x: px, y: py, id: 1 }] });
    };
    // A tap is not an accidental launch, even on the former look-only side.
    await page.getByTestId('flight-surface').tap({ position: { x, y: 650 } });
    await page.waitForTimeout(300); await expect(telemetry).toHaveAttribute('data-flying', 'false');
    await send('touchStart', x, 650); await page.waitForTimeout(1100);
    await expect(telemetry).toHaveAttribute('data-flying', 'true');
    expect(await metric('speed')).toBeGreaterThan(5); expect(await metric('speed')).toBeLessThan(9);
    const startHeight = JSON.parse((await telemetry.getAttribute('data-position'))!)[1];
    // The same live contact steers right/up and increases speed without a button.
    await send('touchMove', x + 40, 530); await page.waitForTimeout(1000);
    expect(await metric('heading')).toBeLessThan(-.15); expect(await metric('pitch')).toBeGreaterThan(.4);
    expect(await metric('speed')).toBeGreaterThan(25);
    expect(JSON.parse((await telemetry.getAttribute('data-position'))!)[1]).toBeGreaterThan(startHeight + 3);
    await send('touchMove', x - 30, 675); await page.waitForTimeout(500);
    expect(await metric('heading')).toBeGreaterThan(.1); expect(await metric('pitch')).toBeLessThan(-.2);
    // The edge continues a turn while this single thumb stays still.
    await send('touchMove', 389, 630); await page.waitForTimeout(400);
    const edgeHeading = await metric('heading'); await page.waitForTimeout(500);
    expect(await metric('heading')).toBeLessThan(edgeHeading - .3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1100); expect(await metric('speed')).toBeLessThan(.5);
    const releasedHeading = await metric('heading'); await page.waitForTimeout(400);
    expect(await metric('heading')).toBe(releasedHeading);
    expect(errors).toEqual([]); await context.close();
  });
}

test('long presses on controls and their surroundings do not select game text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).tap();
  const lift = page.getByRole('button', { name: 'Lift', exact: true }), bounds = (await lift.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  for (const x of [bounds.x + 3, bounds.x + bounds.width / 2, bounds.x - 6]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: bounds.y + bounds.height / 2, id: 1 }] });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }
  const hud = page.getByTestId('flight-telemetry');
  expect(await hud.evaluate(el => getComputedStyle(el).userSelect)).toBe('none');
  const blocksMenu = await hud.evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(blocksMenu).toBe(true);
  await page.getByRole('button', { name: 'Field guide', exact: true }).tap();
  const paragraph = page.getByRole('dialog').locator('p').nth(1);
  expect(await paragraph.evaluate(el => getComputedStyle(el).userSelect)).toBe('text');
  expect(await paragraph.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
  expect(await page.getByRole('button', { name: 'Close dialog' }).evaluate(el => getComputedStyle(el).userSelect)).toBe('none');
  // The page remains zoomable; the active game alone owns its multi-touch gestures.
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
  await context.close();
});

test('rotation clears both thumbs without changing location or view', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).tap();
  const cdp = await context.newCDPSession(page), telemetry = page.getByTestId('flight-telemetry');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 650, id: 1 }] });
  await page.waitForTimeout(850);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 650, id: 1 }, { x: 280, y: 640, id: 2 }] });
  await expect(page.getByTestId('flight-surface')).toHaveAttribute('data-control-mode', 'dual');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 590, id: 1 }, { x: 300, y: 620, id: 2 }] });
  await page.waitForTimeout(650);
  await page.setViewportSize({ width: 852, height: 393 }); await page.waitForTimeout(400);
  const position = await telemetry.getAttribute('data-position'), heading = await telemetry.getAttribute('data-heading');
  await page.waitForTimeout(500);
  expect(Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.1);
  expect(await telemetry.getAttribute('data-position')).toBe(position);
  expect(await telemetry.getAttribute('data-heading')).toBe(heading);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await context.close();
});
