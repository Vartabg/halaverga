import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.ENVIRONMENT_REVIEW_OUTPUT || '/tmp/halaverga-environment-review'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const errors=[],views=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:3366'); await page.getByRole('button',{name:'Begin expedition'}).click();
async function capture(name){await page.waitForTimeout(650);await page.screenshot({path:`${out}/${name}.jpg`,quality:90});views.push({name,position:await page.getByTestId('flight-telemetry').getAttribute('data-position')});}
async function move(key,ms){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
await capture('arrival');
await page.keyboard.press('Space'); await move('KeyW',2800); await move('KeyF',2400);await capture('waterfront');
await page.getByRole('button',{name:'Flight settings'}).click();await page.getByRole('button',{name:'First person',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await capture('water-level');
await move('KeyR',5800);await move('ArrowDown',370);await capture('aerial');
await page.getByRole('button',{name:'Flight settings'}).click();await page.getByRole('combobox',{name:/Graphics/}).selectOption('low');await page.getByLabel('Reduced camera motion').check();await page.getByRole('button',{name:'Return to arrival terrace'}).click();
await capture('low-detail');
await page.setViewportSize({width:393,height:852});await capture('portrait');
await page.setViewportSize({width:852,height:393});await capture('landscape');
await writeFile(`${out}/report.json`,JSON.stringify({browser:await browser.version(),scope:'Headless Chrome on Mac; portrait/landscape are viewport emulation, not physical iPhone validation',views,errors},null,2));
console.log(JSON.stringify({out,views,errors}));await browser.close();
if(errors.length) process.exit(1);
