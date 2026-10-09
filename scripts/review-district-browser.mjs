import { chromium, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.REVIEW_OUTPUT || '/tmp/halaverga-district-browsers';
await mkdir(output, { recursive: true });
const reports = [];
const engines = [
  ['chrome', chromium, { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] }],
  ['webkit', webkit, {}],
];
for (const [name, engine, options] of engines.filter(([name]) => name === (process.env.REVIEW_ENGINE || 'chrome'))) {
  const browser = await engine.launch({ headless: true, timeout: 15000, ...options });
  try {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:3486');
    await page.getByRole('button', { name: 'Begin expedition' }).tap();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${output}/${name}-portrait.png` });
    const telemetry = page.getByTestId('flight-telemetry');
    const before = JSON.parse(await telemetry.getAttribute('data-position'));
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(700);
    const after = JSON.parse(await telemetry.getAttribute('data-position'));
    const drift = Math.hypot(...after.map((value, i) => value - before[i]));
    if (drift > .4) throw new Error(`${name}: orientation changed position by ${drift} m`);
    await page.screenshot({ path: `${output}/${name}-landscape.png` });
    await page.getByRole('button', { name: 'Flight settings' }).tap();
    await page.getByRole('combobox', { name: 'Graphics', exact: true }).selectOption('low');
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/${name}-lighter.png` });
    reports.push({ name, version: browser.version(), viewport: '393x852 → 852x393', hasTouch: true, drift, errors,
      scope: 'Desktop browser with emulated touch viewport; not physical iPhone Safari.' });
    await context.close();
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await browser.close(); }
}
await writeFile(`${output}/browsers.json`, JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
