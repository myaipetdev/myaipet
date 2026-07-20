import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const SEL = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';

async function enumerate(label) {
  await p.waitForTimeout(800);
  const items = await p.$$eval(SEL, els => els.map(el => {
    const tag = el.tagName.toLowerCase();
    let txt = (el.innerText || '').trim();
    if (!txt && (tag === 'input')) txt = (el.value || '').trim();
    // visibility check
    const r = el.getBoundingClientRect();
    const st = window.getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
    return { tag, txt, visible };
  }));
  // keep visible, dedupe by text
  const seen = new Map();
  for (const it of items) {
    if (!it.visible) continue;
    const key = it.txt;
    if (!seen.has(key)) seen.set(key, { tag: it.tag, txt: it.txt, count: 0 });
    seen.get(key).count++;
  }
  const list = [...seen.values()];
  console.log(`\n=== ${label} === (${list.length} unique visible interactive)`);
  for (const it of list) {
    console.log(`  [${it.tag}] ${JSON.stringify(it.txt)}${it.count > 1 ? ' x' + it.count : ''}`);
  }
  return list;
}

async function goSection(nav) {
  const els = await p.$$('button, a');
  for (const el of els) {
    const t = (await el.textContent() || '').trim();
    if (t === nav) { await el.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(2200);
}

const ALL = [];
async function collect(label) {
  const list = await enumerate(label);
  for (const it of list) ALL.push({ surface: label, ...it });
}

await p.goto('https://app.myaipet.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);

// Enumerate top nav first
await collect('HOME (initial + nav)');

const sections = ['My Pet', 'Cards', 'Bracket', 'Studio', 'Community', 'PetClaw', 'Agent Office', 'Season Rewards'];
for (const s of sections) {
  await goSection(s);
  await collect('SECTION: ' + s);
}

// Tour URLs
const tours = [
  'https://app.myaipet.ai/?section=community&tour=1',
  'https://app.myaipet.ai/?section=my%20pet&tour=1',
  'https://app.myaipet.ai/?section=worldcup&tour=1',
];
for (const url of tours) {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  await collect('TOUR: ' + url.split('app.myaipet.ai')[1]);
}

// Wallet-connect modal — go home, find connect button
await p.goto('https://app.myaipet.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
// try to open wallet modal
const walletBtns = await p.$$('button, a');
let opened = false;
for (const el of walletBtns) {
  const t = (await el.textContent() || '').trim().toLowerCase();
  if (t.includes('connect wallet') || t === 'connect' || t.includes('sign in') || t.includes('connect')) {
    await el.click().catch(() => {});
    await p.waitForTimeout(1800);
    // check if modal appeared
    const hasModal = await p.evaluate(() => !!document.querySelector('[role="dialog"]'));
    if (hasModal) { opened = true; break; }
  }
}
console.log('\nWallet modal opened=' + opened);
await collect('WALLET-CONNECT MODAL');

console.log('\n\n########## RAW JSON ##########');
console.log(JSON.stringify(ALL));
await b.close();
