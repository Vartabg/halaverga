import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const { touch, viewport } of [{ touch: false, viewport: { width: 1440, height: 900 } }, { touch: true, viewport: { width: 852, height: 393 } }, { touch: true, viewport: { width: 393, height: 852 } }]) test(`chain real sword contacts with ${touch ? 'phone taps' : 'keyboard presses'} at ${viewport.width}x${viewport.height} and no ritual gestures`, async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch,
    recordVideo: process.env.PLAYTEST_VIDEO ? { dir: test.info().outputPath('video'), size: viewport } : undefined });
  try {
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
    if (touch) await page.getByRole('button', { name: 'Lift', exact: true }).tap(); else await page.keyboard.press('Space');
    await page.waitForTimeout(600); await page.keyboard.press('KeyB'); await page.keyboard.down('KeyV');
    if (touch) {
      const attack = await page.getByRole('button', { name: 'Strike next demon' }).boundingBox();
      for (const name of ['Land', 'Brake to hover']) {
        const other = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(attack).not.toBeNull(); expect(other).not.toBeNull();
        const overlap = attack!.x < other!.x + other!.width && attack!.x + attack!.width > other!.x && attack!.y < other!.y + other!.height && attack!.y + attack!.height > other!.y;
        expect(overlap, `Strike must be separate from ${name}`).toBe(false);
      }
    }
    const hud = page.getByTestId('battle-hud'), target = page.getByTestId('combat-target');
    await page.evaluate(() => {
      const w = window as typeof window & { cameraFrames: Record<string, number>[]; cameraTimer: number };
      w.cameraFrames = []; w.cameraTimer = window.setInterval(() => {
        const data = document.querySelector('[data-testid="combat-target"]')?.getAttribute('data-camera');
        const cue = document.querySelector<HTMLElement>('[data-testid="combat-target"]');
        if (data && cue) w.cameraFrames.push({ ...JSON.parse(data), cueVisible: Number(!cue.hidden), cueActive: Number(cue.dataset.active === 'true'),
          cueX: Number(cue.dataset.x), cueY: Number(cue.dataset.y), cueTarget: Number(cue.dataset.target), cueStrike: Number(cue.dataset.strikeTarget), cueEdge: Number(cue.dataset.edge === 'true') });
      }, 20);
    });
    let peak = 0, engaged = false, captured = false, manualChecked = false;
    for (let n = 0; n < 100 && peak < 3; n++) {
      if (engaged || (await target.locator('i').isVisible() && await target.getAttribute('data-edge') === 'false')) {
        engaged = true;
        if (touch && n > 0) await page.getByRole('button', { name: 'Strike next demon' }).tap();
        else if (touch) {
          const x = Number(await target.getAttribute('data-x')), y = Number(await target.getAttribute('data-y'));
          await page.touchscreen.tap(x, y);
        } else await page.keyboard.press('KeyC');
      } else {
        const telemetry = page.getByTestId('flight-telemetry'), pitch = Number(await telemetry.getAttribute('data-pitch'));
        const position = JSON.parse((await telemetry.getAttribute('data-position'))!);
        const desired = position[1] > 45 ? -.7 : -.18;
        const vertical = pitch > desired + .1 ? 'ArrowDown' : pitch < desired - .1 ? 'ArrowUp' : null;
        if (vertical) await page.keyboard.down(vertical);
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.up('ArrowRight');
        if (vertical) await page.keyboard.up(vertical);
      }
      await page.waitForTimeout(160);
      peak = Math.max(peak, Number(await hud.getAttribute('data-combo')));
      if (!captured && await target.getAttribute('data-active') === 'true' && await target.isVisible()) {
        await page.screenshot({ path: test.info().outputPath('strike-focus.png') }); captured = true;
        await page.keyboard.down('ArrowLeft');
        try { await expect.poll(async () => JSON.parse((await target.getAttribute('data-camera'))!).manual, { intervals: [16], timeout: 1500 }).toBeGreaterThan(.2); manualChecked = true; }
        finally { await page.keyboard.up('ArrowLeft'); }
      }
    }
    await page.screenshot({ path: test.info().outputPath('chain.png') });
    const frames = await page.evaluate(() => {
      const w = window as typeof window & { cameraFrames: Record<string, number>[]; cameraTimer: number };
      clearInterval(w.cameraTimer); return w.cameraFrames;
    });
    const tracked = frames.filter(f => f.phase === 1 && f.age > .18 && f.manual === 0 && f.weight > .5);
    expect(tracked.length).toBeGreaterThan(8);
    const focused = frames.filter(f => f.cueVisible && f.cueActive);
    expect(focused.length).toBeGreaterThan(5);
    expect(focused.every(f => f.cueTarget === f.cueStrike), 'the ring stays on the struck demon until contact').toBe(true);
    const edges = frames.filter(f => f.cueVisible && f.cueEdge);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every(f => f.cueX >= 37 && f.cueX <= viewport.width - 37 && f.cueY >= 111 && f.cueY <= viewport.height - 99)).toBe(true);
    console.log('COMBAT CUES', { focused: focused.length, edge: edges.length });
    const visible = (x: number, y: number) => Math.abs(x) < .95 && Math.abs(y) < .95;
    const targetInFrame = tracked.filter(f => visible(f.targetX, f.targetY)).length / tracked.length;
    const heroInFrame = tracked.filter(f => visible(f.heroX, f.heroY)).length / tracked.length;
    console.log('COMBAT FRAMING', { viewport, samples: tracked.length, targetInFrame, heroInFrame });
    await test.info().attach('combat-camera-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
    expect(peak).toBeGreaterThanOrEqual(3);
    expect(targetInFrame).toBeGreaterThanOrEqual(.85); expect(heroInFrame).toBeGreaterThanOrEqual(.95);
    expect(manualChecked, 'manual steering takes over during a live strike').toBe(true);
    console.log('CHAIN END', await hud.evaluate(e => ({ ...((e as HTMLElement).dataset) })));
    try { await expect.poll(async () => Number(await hud.getAttribute('data-banished')), { timeout: 8000 }).toBeGreaterThanOrEqual(3); }
    finally { console.log('CAST END', await hud.evaluate(e => ({ ...((e as HTMLElement).dataset) }))); }
    await page.keyboard.press('KeyB');
    await expect.poll(async () => JSON.parse((await target.getAttribute('data-camera'))!).weight).toBeLessThan(.01);
    expect(JSON.parse((await target.getAttribute('data-camera'))!).phase).toBe(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
