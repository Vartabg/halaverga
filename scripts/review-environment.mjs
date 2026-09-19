import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.REVIEW_OUTPUT || '/tmp/halaverga-environment-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-gl=angle', '--use-angle=metal'] });
const errors = [], captures = [];
for (const [name, width, height] of [['desktop', 1440, 1000], ['portrait', 393, 852]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:3474');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${output}/${name}-arrival.png` });
  captures.push({ name, width, height, position: await page.getByTestId('flight-telemetry').getAttribute('data-position') });
  if (name === 'desktop') {
    await page.keyboard.press('Space');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2300); await page.keyboard.up('KeyW');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${output}/desktop-approach.png` });
    captures.push({ name: 'approach', position: await page.getByTestId('flight-telemetry').getAttribute('data-position') });
  }
  await page.close();
}
await writeFile(`${output}/capture.json`, JSON.stringify({ browser: browser.version(), captures, errors }, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ output, captures, errors }));
