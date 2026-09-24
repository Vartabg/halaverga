import { expect, test } from '@playwright/test';
import { fov, hud, resume, touchPage } from './shooter-browser';
// The phone-landscape camera (cameraFx.shortWeight): a 95 deg horizontal cap narrows the hip FOV to 53.4 on an 852x393 screen, ADS
// keeps the same zoom (about 40.5), and rotating to portrait or a desktop window gives back exactly 65, with no glide.
// Emulation only: not iPhone validation.
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 }, DESKTOP = { width: 1440, height: 1000 };
type Page = import('@playwright/test').Page;
const near = (want: number, tol: number) => async (p: Page) => Math.abs(await fov(p) - want) <= tol;
const distance = async (p: Page) => Number(await p.getByTestId('flight-telemetry').getAttribute('data-camera-distance'));
const SE = { width: 375, height: 667 }, SE_SAFARI = { width: 375, height: 548 }; // iPhone SE portrait: full height, and 100svh with toolbars

test('landscape narrows the hip and ADS field; rotation snaps between 53.4 and 65.0 without a glide', async ({ browser }) => {
  const t = await touchPage(browser, LANDSCAPE), { page } = t;
  await page.waitForTimeout(1200);
  await expect(hud(page)).toHaveAttribute('data-fov', '53.4');
  const aim = page.locator('[data-shooter-controls]').getByRole('button', { name: 'Aim' });
  await aim.tap(); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
  await expect.poll(() => near(40.45, .2)(page)).toBe(true);
  await aim.tap(); await expect(hud(page)).toHaveAttribute('data-aiming', 'false');
  await expect(hud(page)).toHaveAttribute('data-fov', '53.4');
  // A glide at the base FOV's rate 3 would need about 1.8 s to settle within .05 deg; the shift lands at once.
  await page.setViewportSize(PORTRAIT); await expect(hud(page)).toHaveAttribute('data-fov', '65.0', { timeout: 700 });
  await page.setViewportSize(LANDSCAPE); await expect(hud(page)).toHaveAttribute('data-fov', '53.4', { timeout: 700 });
  await page.setViewportSize(DESKTOP); await expect(hud(page)).toHaveAttribute('data-fov', '65.0', { timeout: 700 });
  expect(t.errors).toEqual([]); await t.context.close();
});

test('reduced camera motion holds the landscape field at 53.4, aiming or not', async ({ browser }) => {
  const t = await touchPage(browser, LANDSCAPE, { reduced: true }), { page } = t;
  await page.waitForTimeout(800);
  await expect(hud(page)).toHaveAttribute('data-fov', '53.4');
  const aim = page.locator('[data-shooter-controls]').getByRole('button', { name: 'Aim' });
  await aim.tap(); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
  await page.waitForTimeout(600); await expect(hud(page)).toHaveAttribute('data-fov', '53.4');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a short portrait phone keeps the portrait camera; only landscape brings the boom closer', async ({ browser }) => {
  const t = await touchPage(browser, SE), { page } = t;
  await page.waitForTimeout(1200);
  const tall = await distance(page);
  await expect(hud(page)).toHaveAttribute('data-fov', '65.0');
  await page.setViewportSize(SE_SAFARI); await page.waitForTimeout(800);
  await expect(hud(page)).toHaveAttribute('data-fov', '65.0');
  expect(Math.abs(await distance(page) - tall)).toBeLessThan(.005); // w would be about 0.25 here without the landscape gate
  await page.setViewportSize({ width: 667, height: 331 }); await page.waitForTimeout(800);
  expect(await distance(page)).toBeLessThan(tall * .92);
  expect(t.errors).toEqual([]); await t.context.close();
});

// The HUD and telemetry unmount while paused, so the paused frames are read at the renderer: three's devtools hook hands the spec
// the WebGLRenderer, whose render() is wrapped to note the camera's FOV and aspect in each drawn frame. Test-only; no app change.
const renderTap = () => {
  const frames: { fov: number; aspect: number }[] = [], hook = new EventTarget();
  (window as unknown as { __frames: typeof frames }).__frames = frames;
  hook.addEventListener('observe', e => {
    const gl = (e as CustomEvent).detail as { isWebGLRenderer?: boolean; render: (s: unknown, c: { fov: number; aspect: number }) => void };
    if (!gl.isWebGLRenderer) return;
    const render = gl.render.bind(gl);
    gl.render = (scene, camera) => { frames.push({ fov: camera.fov, aspect: camera.aspect }); if (frames.length > 50) frames.shift(); render(scene, camera); };
  });
  (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;
};
/** The last drawn frame at this screen's aspect, polled until one is drawn. */
const drawn = (p: Page, { width, height }: { width: number; height: number }) => p.evaluate(aspect => {
  const frames = (window as unknown as { __frames: { fov: number; aspect: number }[] }).__frames;
  return frames.filter(f => Math.abs(f.aspect - aspect) < 1e-6).at(-1)?.fov.toFixed(2) ?? 'none';
}, width / height);

test('rotating while paused re-frames the frozen view at once, at the hip and in ADS', async ({ browser }) => {
  const t = await touchPage(browser, LANDSCAPE, undefined, renderTap), { page } = t;
  await page.waitForTimeout(1200);
  const pause = page.getByRole('button', { name: 'Pause expedition' }), paused = page.getByRole('button', { name: 'Resume flight' });
  const aim = page.locator('[data-shooter-controls]').getByRole('button', { name: 'Aim' });
  for (const [aiming, hip, portrait] of [[false, '53.44', '65.00'], [true, '40.45', '50.00']] as const) {
    if (aiming) { await aim.tap(); await expect(hud(page)).toHaveAttribute('data-aiming', 'true'); await page.waitForTimeout(500); }
    await pause.tap(); await expect(paused).toBeVisible();
    await page.setViewportSize(PORTRAIT); await expect.poll(() => drawn(page, PORTRAIT), { timeout: 1500 }).toBe(portrait);
    await page.setViewportSize(LANDSCAPE); await expect.poll(() => drawn(page, LANDSCAPE), { timeout: 1500 }).toBe(hip);
    await expect(paused).toBeVisible(); await resume(page);
    await expect.poll(() => near(Number(hip), .06)(page)).toBe(true);
  }
  expect(t.errors).toEqual([]); await t.context.close();
});
