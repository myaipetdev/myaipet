import { chromium } from 'playwright';

const SEL = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';

function extractScript() {
  const sel = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';
  const els = Array.from(document.querySelectorAll(sel));
  return els.map(el => {
    const tag = el.tagName.toLowerCase();
    let txt = (el.innerText || '').trim();
    if ((tag === 'input') && !txt) txt = (el.value || '').trim();
    const visible = !!(el.offsetParent !== null || el.getClientRects().length);
    return { tag, text: txt, value: el.value || '', visible };
  });
}

async function run() {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });

  // ---- Extension popup ----
  const ctx1 = await browser.newContext({ viewport: { width: 380, height: 600 } });
  const p1 = await ctx1.newPage();
  await p1.goto('http://localhost:8796/popup.html', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(800);

  const tabs = ['Points', 'Evolve', 'Mood', 'Game', 'Badges', 'Settings'];
  const extResults = {};
  // first, capture default view
  extResults['__default'] = await p1.evaluate(extractScript);

  // Find tab buttons
  const tabButtons = await p1.$$eval(SEL, els => els.map((el,i) => ({i, text:(el.innerText||'').trim()})));
  console.log('EXT tab-candidate buttons:', JSON.stringify(tabButtons.filter(t=>t.text)));

  for (const name of tabs) {
    try {
      // click a nav element whose text matches the tab name
      const clicked = await p1.evaluate((tabName) => {
        const sel = 'button, [role=button], a, [onclick], .tab, [data-tab]';
        const els = Array.from(document.querySelectorAll(sel));
        const target = els.find(el => {
          const t = (el.innerText||'').trim().toLowerCase();
          const dt = (el.getAttribute('data-tab')||'').toLowerCase();
          return t === tabName.toLowerCase() || dt === tabName.toLowerCase() || t.includes(tabName.toLowerCase());
        });
        if (target) { target.click(); return true; }
        return false;
      }, name);
      await p1.waitForTimeout(500);
      extResults[name] = { clicked, labels: await p1.evaluate(extractScript) };
    } catch (e) {
      extResults[name] = { error: String(e) };
    }
  }

  console.log('=== EXT RESULTS ===');
  console.log(JSON.stringify(extResults, null, 1));

  await browser.close();
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
