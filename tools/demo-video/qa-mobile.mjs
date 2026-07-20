import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://app.myaipet.ai';
const consoleErrors = [];
const badResponses = [];
const pageErrors = [];

function log(...a) { console.log('[QA]', ...a); }

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 300) });
});
page.on('pageerror', err => pageErrors.push({ url: page.url(), text: String(err).slice(0, 300) }));
page.on('response', r => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url().slice(0, 160) }); });

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
}

async function overflowCheck(label) {
  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const horiz = de.scrollWidth > de.clientWidth + 2;
    // find elements wider than viewport
    const wide = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth + 4 && r.height > 8 && r.right > window.innerWidth + 4) {
        wide.push({ tag: el.tagName, cls: (el.className && el.className.toString().slice(0,40)) || '', w: Math.round(r.width), right: Math.round(r.right) });
      }
    });
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, horiz, wide: wide.slice(0, 8) };
  });
  log(`OVERFLOW[${label}]`, JSON.stringify(info));
  return info;
}

log('=== HOME ===');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => log('goto err', e.message));
await page.waitForTimeout(3000);
await shot('01-home');
await overflowCheck('home');

// dump nav items
const navInfo = await page.evaluate(() => {
  const navs = document.querySelectorAll('nav');
  const out = [];
  navs.forEach((nav, i) => {
    const r = nav.getBoundingClientRect();
    const items = [...nav.querySelectorAll('button,a,[role=button]')].map(b => ({
      t: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 20),
      x: Math.round(b.getBoundingClientRect().x),
      w: Math.round(b.getBoundingClientRect().width),
    }));
    out.push({ i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), overflowX: getComputedStyle(nav).overflowX, itemCount: items.length, items });
  });
  return out;
});
log('NAV', JSON.stringify(navInfo, null, 1));

await browser.close();
log('DONE-PHASE1');
fs.writeFileSync(OUT + '/../errors.json', JSON.stringify({ consoleErrors, badResponses, pageErrors }, null, 2));
