import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const bad = [];

async function attach(page, tag) {
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${tag}] PAGEERROR ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) bad.push(`[${tag}] ${r.status()} ${r.url()}`); });
}

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });

// DESKTOP
const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dp = await dctx.newPage();
await attach(dp, 'desktop');
await dp.goto('https://app.myaipet.ai', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => errors.push('goto '+e.message));
await dp.waitForTimeout(2500);

// full page height
const h = await dp.evaluate(() => document.body.scrollHeight);
console.log('DESKTOP page height', h);

// scroll capture in viewport chunks
let y = 0, i = 0;
while (y < h && i < 12) {
  await dp.evaluate(sy => window.scrollTo(0, sy), y);
  await dp.waitForTimeout(600);
  await dp.screenshot({ path: `${OUT}/d-${String(i).padStart(2,'0')}.png` });
  y += 850; i++;
}
await dp.evaluate(() => window.scrollTo(0,0));

await dctx.close();

// MOBILE
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await attach(mp, 'mobile');
await mp.goto('https://app.myaipet.ai', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => errors.push('goto '+e.message));
await mp.waitForTimeout(2500);
const mh = await mp.evaluate(() => document.body.scrollHeight);
console.log('MOBILE page height', mh);
let my = 0, mi = 0;
while (my < mh && mi < 16) {
  await mp.evaluate(sy => window.scrollTo(0, sy), my);
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${OUT}/m-${String(mi).padStart(2,'0')}.png` });
  my += 780; mi++;
}
await mctx.close();

await browser.close();

fs.writeFileSync(`${OUT}/errors.txt`, errors.join('\n') + '\n\n=== BAD RESPONSES ===\n' + bad.join('\n'));
console.log('ERRORS', errors.length, 'BAD', bad.length);
console.log(errors.slice(0,40).join('\n'));
console.log('---BAD---');
console.log(bad.slice(0,40).join('\n'));
