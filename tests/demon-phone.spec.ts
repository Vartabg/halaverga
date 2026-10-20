import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { openSettings, closeAndResume } from './lab-browser';
for (const [width,height] of [[393,852],[852,393]]) test(`sculpted demons load and fight at ${width}x${height}`, async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.setViewportSize({width,height});
 const model = page.waitForResponse(r => r.url().endsWith('/models/abyssal.glb'));
 await page.goto('/'); await page.getByRole('button', { name:'Begin expedition' }).click();
 expect((await model).status()).toBe(200);
 await page.keyboard.press('Space'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
 await page.keyboard.press('Digit1'); await page.waitForTimeout(1000);
 await page.screenshot({path:`docs/art/demon-asset/phone-${width}.png`});
 await openSettings(page); await page.getByText('Playtest measurements',{exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download measurements'}).click();
 const data=JSON.parse(await readFile((await (await pending).path())!,'utf8'));
 await writeFile(`docs/art/demon-asset/resources-${width}.json`,JSON.stringify({browser:'Mac Chrome, emulated phone viewport',width,height,resources:data.resources},null,2)+'\n');
 expect(data.resources.drawCalls).toBeLessThan(65);expect(data.resources.triangles).toBeLessThan(400000);
 await test.info().attach('demon-phone-measurements',{body:JSON.stringify(data,null,2),contentType:'application/json'});
 await closeAndResume(page);expect(errors).toEqual([]);
});

for (const [width,height] of [[393,852],[852,393]]) test(`before/after comparison works at ${width}x${height}`, async ({ page }) => {
 await page.setViewportSize({width,height});await page.goto('/demon-comparison.html');
 await expect(page.getByRole('heading',{name:'Compare the demons'})).toBeVisible();
 await page.getByRole('button',{name:'Previous demon'}).click();
 await expect(page.locator('#face')).toHaveAttribute('src','/demon-old-face.png');
 await page.getByRole('button',{name:'New demon'}).click();
 await expect(page.locator('#face')).toHaveAttribute('src','/demon-new-face.png');
 expect(await page.locator('#face').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
