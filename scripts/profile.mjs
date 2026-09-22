import { chromium } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
const duration = Number(process.env.PROFILE_SECONDS || 300);
const surge = process.env.PROFILE_SURGE === '1';
// PROFILE_SHOOTER=1: ?shooter=1, aim (Q) and fire (C) in bursts between route legs; reports peak draw calls and triangles.
const shooter = process.env.PROFILE_SHOOTER === '1';
const output = process.env.PROFILE_OUTPUT || '/tmp/halaverga-profile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const base = process.env.PLAYTEST_URL || 'http://127.0.0.1:3366';
// PROFILE_SHOOTER=0 opens ?shooter=0: the pre-shooter baseline the draw-call budget is measured against.
await page.goto(process.env.PROFILE_SHOOTER ? new URL(`/?shooter=${shooter ? 1 : 0}`, base).href : base);
await page.getByRole('button', { name: 'Begin expedition' }).click();
await page.keyboard.press('Space');
if (surge) await page.keyboard.press('Shift');
const started = Date.now();
const commands = [['KeyR', 3000], ['KeyW', 4000], ['ArrowRight', 1000], ['KeyW', 4000], ['KeyF', 2500], ['ArrowLeft', 1000]];
let i = 0;
while (Date.now() - started < duration * 1000) {
  const [key, ms] = commands[i++ % commands.length];
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(500);
  if (shooter) {
    await page.keyboard.down('KeyQ');
    for (let burst = 0; burst < 2; burst++) { await page.keyboard.down('KeyC'); await page.waitForTimeout(700); await page.keyboard.up('KeyC'); await page.waitForTimeout(300); }
    await page.keyboard.up('KeyQ'); await page.waitForTimeout(300);
  }
  if (i % commands.length === 0) {
    await page.getByRole('button', { name: 'Flight settings' }).click();
    await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
    await page.waitForTimeout(300); await page.locator('main').focus(); await page.keyboard.press('Space');
    if (surge) await page.keyboard.press('Shift');
  }
}
await page.screenshot({ path: output + '/route.png' });
const gpu = await page.evaluate(() => {
  const gl = document.querySelector('canvas')?.getContext('webgl2');
  if (!gl) return 'Unavailable';
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
await page.getByRole('button', { name: 'Flight settings' }).click();
await page.getByText('Playtest measurements', { exact: true }).click();
const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download measurements' }).click();
const download = await pending, measurement = JSON.parse(await readFile(await download.path(), 'utf8'));
const report = { ...measurement, shooter, hardware: os.cpus()[0]?.model, gpu, os: `${os.platform()} ${os.release()}`, browserMode: 'Headless system Chrome; physical Mac, not iPhone', speedMode: surge ? 'Surge (34 m/s maximum; clearance may reduce speed)' : 'Cruise (13 m/s maximum)', workload: commands, route: 'Repeat launch/canal/sideways/descent; reset to terrace each cycle to remain inside dense district.', errors };
await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
const peak = measurement.peakResources ?? {};
console.log(`Peak draw calls ${peak.drawCalls}, peak triangles ${peak.triangles}${shooter ? ' (shooter on; budget: at most 12 draw calls and 10k triangles above a PROFILE_SHOOTER=0 run)' : ''}`);
await browser.close();
