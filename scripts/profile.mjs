import { chromium } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
const duration = Number(process.env.PROFILE_SECONDS || 300);
const output = process.env.PROFILE_OUTPUT || '/tmp/halaverga-profile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:3366');
await page.getByRole('button', { name: 'Begin expedition' }).click();
await page.keyboard.press('Space');
const started = Date.now();
const commands = [['KeyR', 3000], ['KeyW', 4000], ['ArrowRight', 1000], ['KeyW', 4000], ['KeyF', 2500], ['ArrowLeft', 1000]];
let i = 0;
while (Date.now() - started < duration * 1000) {
  const [key, ms] = commands[i++ % commands.length];
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(500);
  if (i % commands.length === 0) {
    await page.getByRole('button', { name: 'Flight settings' }).click();
    await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
    await page.waitForTimeout(300); await page.locator('main').focus(); await page.keyboard.press('Space');
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
const report = { ...measurement, hardware: os.cpus()[0]?.model, gpu, os: `${os.platform()} ${os.release()}`, browserMode: 'Headless system Chrome; physical Mac, not iPhone', workload: commands, route: 'Repeat launch/canal/sideways/descent; reset to terrace each cycle to remain inside dense district.', errors };
await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report)); await browser.close();
