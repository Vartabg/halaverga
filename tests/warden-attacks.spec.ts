import { expect, test, type Page } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
type View = { width: number; height: number };
async function steerTo(page: Page, point: number[], stop: number) {
  const t = page.getByTestId('flight-telemetry');
  for (let n = 0; n < 85; n++) {
    const p = JSON.parse((await t.getAttribute('data-position'))!), yaw = Number(await t.getAttribute('data-heading')), pitch = Number(await t.getAttribute('data-pitch'));
    const x = point[0] - p[0], y = point[1] - p[1], z = point[2] - p[2]; if (Math.hypot(x, y, z) < stop) break;
    const dy = Math.atan2(Math.sin(Math.atan2(-x, -z) - yaw), Math.cos(Math.atan2(-x, -z) - yaw)), dp = Math.atan2(y, Math.hypot(x, z)) - pitch;
    const h = Math.abs(dy) > .08 ? dy > 0 ? 'ArrowLeft' : 'ArrowRight' : null, v = Math.abs(dp) > .08 ? dp > 0 ? 'ArrowUp' : 'ArrowDown' : null;
    if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v); if (Math.abs(dy) + Math.abs(dp) < .35) await page.keyboard.down('KeyW');
    await page.waitForTimeout(110); if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v); await page.keyboard.up('KeyW');
  }
  await page.keyboard.press('KeyB');
}
async function facePoint(page: Page, point: number[]) {
  const t = page.getByTestId('flight-telemetry');
  for (let n = 0; n < 40; n++) {
    const p = JSON.parse((await t.getAttribute('data-position'))!), yaw = Number(await t.getAttribute('data-heading')), pitch = Number(await t.getAttribute('data-pitch'));
    const x = point[0] - p[0], y = point[1] - p[1], z = point[2] - p[2];
    const dy = Math.atan2(Math.sin(Math.atan2(-x, -z) - yaw), Math.cos(Math.atan2(-x, -z) - yaw)), dp = Math.atan2(y, Math.hypot(x, z)) - pitch;
    if (Math.abs(dy) + Math.abs(dp) < .12) break;
    const h = Math.abs(dy) > .06 ? dy > 0 ? 'ArrowLeft' : 'ArrowRight' : null, v = Math.abs(dp) > .06 ? dp > 0 ? 'ArrowUp' : 'ArrowDown' : null;
    if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v); await page.waitForTimeout(70);
    if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v);
  }
}
async function tapOpening(page: Page, view: View) {
  const elite = page.getByTestId('elite-hud');
  for (let n = 0; n < 20; n++) {
    const x = Number(await elite.getAttribute('data-x')), y = Number(await elite.getAttribute('data-y'));
    if (x > view.width * .25 && x < view.width * .75 && y > 90 && y < view.height - 120) break;
    const h = x < view.width * .25 ? 'ArrowLeft' : x > view.width * .75 ? 'ArrowRight' : null, v = y < 90 ? 'ArrowUp' : y > view.height - 120 ? 'ArrowDown' : null;
    if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v); await page.waitForTimeout(65); if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v);
  }
  const x = Number(await elite.getAttribute('data-x')), y = Number(await elite.getAttribute('data-y'));
  expect(x).toBeGreaterThan(20); expect(x).toBeLessThan(view.width - 20); expect(y).toBeGreaterThan(80); expect(y).toBeLessThan(view.height - 80);
  await page.touchscreen.tap(x, y);
}
async function acquireTell(page: Page, id: number, view: View) {
  const e = page.getByTestId('elite-hud');
  for (let n = 0; n < 200; n++) {
    const target = Number(await e.getAttribute('data-target')), phase = Number(await e.getAttribute('data-attack'));
    const x = Number(await e.getAttribute('data-x')), y = Number(await e.getAttribute('data-y')), gate = Number(await e.getAttribute('data-gate'));
    if (target === id && phase === 1 && Number(await e.getAttribute('data-progress')) < 70) return;
    const h = x < view.width * .35 ? 'ArrowLeft' : x > view.width * .65 ? 'ArrowRight' : null;
    const v = y < view.height * .35 ? 'ArrowUp' : y > view.height * .6 ? 'ArrowDown' : null;
    if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v);
    if (gate === 6 && !h && !v) await page.keyboard.down('KeyW');
    await page.waitForTimeout(70);
    if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v);
    if (gate === 6) { await page.keyboard.up('KeyW'); await page.keyboard.press('KeyB'); }
  }
  throw new Error(`Could not acquire visible warden${id}: ${await e.getAttribute('data-gate')}/${await e.getAttribute('data-attack')}`);
}
for (const view of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) for (const id of [5, 7]) {
  test(`defend and counter ${id === 5 ? 'lancer' : 'cantor'} with real input ${view.width}x${view.height}`, async ({ browser }) => {
    test.setTimeout(90000); const context = await browser.newContext({ viewport: view, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      await page.getByRole('button', { name: 'Lift', exact: true }).tap(); await page.waitForTimeout(300); await page.keyboard.press('KeyB');
      await page.keyboard.down('KeyV');
      await steerTo(page, id === 5 ? [-32, 42, -56] : [32, 44, -42], 14);
      await facePoint(page, id === 5 ? [0, 42, -85] : [18, 45, -65]);
      const elite = page.getByTestId('elite-hud'), hud = page.getByTestId('battle-hud');
      await expect(elite).toHaveAttribute('data-target', String(id), { timeout: 15000 });
      console.log('WARDEN APPROACH', id, view, await elite.evaluate(el => Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]))), await page.getByTestId('flight-telemetry').getAttribute('data-position'));
      await acquireTell(page, id, view); await page.keyboard.up('KeyV');
      const wards = Number(await hud.getAttribute('data-ward')), kills = Number(await hud.getAttribute('data-banished'));
      expect(wards).toBeGreaterThan(0);
      await page.screenshot({ path: test.info().outputPath('telegraph.png') });
      if (id === 7) {
        await page.getByRole('button', { name: 'Raise shield', exact: true }).focus(); await page.keyboard.down('Space'); await page.waitForTimeout(100);
        expect(Number(await page.getByTestId('flight-telemetry').getAttribute('data-speed'))).toBeLessThan(.5);
        await page.keyboard.up('Space');
      }
      const cdp = await context.newCDPSession(page);
      const hold = async (name: string) => { const box = await page.getByRole('button', { name, exact: true }).boundingBox(); expect(box).not.toBeNull();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }] }); };
      const lift = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
      if (id === 5) {
        await expect.poll(async () => Number(await elite.getAttribute('data-progress')), { intervals: [16] }).toBeGreaterThan(55);
        await hold('Evade right'); await page.waitForTimeout(500); await lift(); await page.getByRole('button', { name: 'Brake to hover', exact: true }).tap();
      } else {
        await expect.poll(async () => await elite.getAttribute('data-parry-window'), { intervals: [16], timeout: 10000 }).toBe('true');
        await hold('Raise shield');
        await expect(elite).toHaveAttribute('data-parries', '1'); await lift();
      }
      await expect(elite).toHaveAttribute('data-opening', 'true'); expect(Number(await hud.getAttribute('data-ward'))).toBe(wards);
      await page.screenshot({ path: test.info().outputPath('opening.png') });
      await tapOpening(page, view); await expect(elite).toHaveAttribute('data-counters', '1'); await expect(elite).toHaveAttribute('data-armor', '1');
      await page.keyboard.press('KeyB');
      // Keep the real world and player input: no injected combat state or teleport to manufacture the second move.
      if (id === 5) await page.keyboard.down('KeyV');
      await expect(elite).toHaveAttribute('data-turn', '2', { timeout: 12000 });
      await expect(elite).toHaveAttribute('data-move', id === 5 ? '5' : '6');
      await expect(elite).toHaveAttribute('data-fierce', 'true');
      await page.screenshot({ path: test.info().outputPath('second-telegraph.png') });
      if (id === 5) {
        await page.keyboard.up('KeyV');
        await expect.poll(async () => await elite.getAttribute('data-parry-window'), { intervals: [16], timeout: 8000 }).toBe('true');
        await hold('Raise shield'); await expect(elite).toHaveAttribute('data-opening', 'true'); await lift();
      } else {
        // Splitfire answers repeated sideways evades: hover inside its committed central gap.
        await page.getByRole('button', { name: 'Brake to hover', exact: true }).tap();
        await expect(elite).toHaveAttribute('data-opening', 'true', { timeout: 8000 });
      }
      expect(Number(await hud.getAttribute('data-ward'))).toBe(wards);
      await page.screenshot({ path: test.info().outputPath('second-opening.png') });
      await tapOpening(page, view); await expect(elite).toHaveAttribute('data-counters', '2'); await expect(elite).toHaveAttribute('data-mode', '3');
      const cue = page.getByTestId('combat-target');
      await expect.poll(async () => JSON.parse((await cue.getAttribute('data-camera'))!).finisher).toBe(id);
      await expect.poll(async () => Number(await page.getByTestId('flight-telemetry').getAttribute('data-speed'))).toBeLessThan(2);
      await expect(elite).toHaveAttribute('data-mode', '4'); await page.waitForTimeout(350);
      const focus = JSON.parse((await cue.getAttribute('data-camera'))!);
      expect(focus.finisher).toBe(id); expect(Math.abs(focus.targetX)).toBeLessThan(.95); expect(Math.abs(focus.targetY)).toBeLessThan(.95);
      await page.screenshot({ path: test.info().outputPath('counter.png') });
      await expect.poll(async () => Number(await hud.getAttribute('data-banished'))).toBeGreaterThan(kills);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
