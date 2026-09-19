import { expect, type Page } from '@playwright/test';
export const hud = (p: Page) => p.getByTestId('flow-hud');
export const telemetry = (p: Page) => p.getByTestId('flight-telemetry');
export const speed = async (p: Page) => Number(await telemetry(p).getAttribute('data-speed'));
export const heading = async (p: Page) => Number(await telemetry(p).getAttribute('data-heading'));
export const position = async (p: Page): Promise<number[]> => JSON.parse((await telemetry(p).getAttribute('data-position'))!);
export const selected = async (p: Page) => Number(await hud(p).getAttribute('data-selected-speed'));
export async function beginFlow(page: Page, camera = 'third') {
  await page.addInitScript(camera => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ flowIntroSeen: true, camera })), camera);
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  const ground = await position(page);
  await page.mouse.click(720, 500); await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(async () => (await position(page))[1]).toBeGreaterThan(ground[1] + .5);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
}
export async function wheel(page: Page, deltaY: number, momentum?: boolean, deltaX = 0) {
  return page.getByTestId('flight-surface').evaluate((el, values) => {
    const e = new WheelEvent('wheel', { deltaY: values.deltaY, deltaX: values.deltaX, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'momentum', { value: values.momentum });
    el.dispatchEvent(e); return e.defaultPrevented;
  }, { deltaY, momentum, deltaX });
}
export async function release(page: Page) {
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
}
