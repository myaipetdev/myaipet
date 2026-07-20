import { chromium } from 'playwright';

const BASE = 'http://localhost:8795/index.html';
const results = { scanned: 0, findings: [], net: [] };

function log(...a){ console.log(...a); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Capture all network responses
const netMap = [];
page.on('response', r => {
  netMap.push({ url: r.url(), status: r.status(), method: r.request().method() });
});
const consoleErrs = [];
page.on('console', m => { if (m.type()==='error') consoleErrs.push(m.text()); });
page.on('pageerror', e => consoleErrs.push('PAGEERROR: '+e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

// Enumerate all interactive controls
const controls = await page.$$eval(
  'a, button, [role="button"], input[type=submit], input[type=button], [onclick], [style*="cursor: pointer"], [style*="cursor:pointer"]',
  els => els.map((e,i) => {
    const r = e.getBoundingClientRect();
    return {
      i, tag: e.tagName.toLowerCase(),
      text: (e.innerText||e.getAttribute('aria-label')||e.value||'').trim().slice(0,40),
      href: e.getAttribute('href'),
      onclick: e.getAttribute('onclick'),
      cls: e.className && e.className.toString().slice(0,40),
      id: e.id,
      dataCopy: e.getAttribute('data-copy'),
      disabled: e.disabled || e.getAttribute('aria-disabled')==='true',
      visible: r.width>0 && r.height>0
    };
  })
);
results.scanned = controls.length;
log('TOTAL CONTROLS:', controls.length);
for (const c of controls) log(JSON.stringify(c));

// --- Test copy chips (sovereignty) ---
log('\n=== COPY CHIPS ===');
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
for (const sel of ['[data-copy="petclaw export"]','[data-copy="petclaw import"]','[data-copy="petclaw wipe --proof"]','[data-copy="petclaw consent"]','#sdkCopy']){
  const el = await page.$(sel);
  if(!el){ log('MISSING', sel); continue; }
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.waitForTimeout(150);
  let clip=''; try{ clip = await page.evaluate(()=>navigator.clipboard.readText()); }catch(e){ clip='(read-fail)'; }
  const txt = await el.evaluate(n=>n.innerText);
  log(sel, '-> clip:', JSON.stringify(clip), 'label:', JSON.stringify(txt.slice(0,20)));
}

// --- Video dots ---
log('\n=== VIDEO DOTS ===');
const dotsBefore = await page.$$('.vdot');
log('dot count', dotsBefore.length);
await page.evaluate(()=>window.scrollTo(0,0));
for (let d=0; d<5; d++){
  await page.evaluate(i=>{ if(window.switchVideo) window.switchVideo(i); }, d);
  await page.waitForTimeout(120);
}
const cur = await page.evaluate(()=>typeof heroCurrentVideo!=='undefined'?heroCurrentVideo:null);
log('after switchVideo(0..4) heroCurrentVideo=', cur);

// --- Journey play demo ---
log('\n=== JOURNEY PLAY ===');
const jv = await page.$('#journeyVideo');
await jv.scrollIntoViewIfNeeded();
await jv.click();
await page.waitForTimeout(400);
const hasIframe = await page.$eval('#journeyVideo', n=>!!n.querySelector('iframe') && n.querySelector('iframe').src);
log('journey iframe src:', hasIframe);

// --- Companion chat input+send (suspected dead) ---
log('\n=== COMPANION CHAT ===');
const chatInput = await page.$('#hero-chat-input');
await chatInput.scrollIntoViewIfNeeded();
const msgsBefore = await page.$eval('#msgs', n=>n.innerText);
await chatInput.fill('Does this send?');
const sendBtn = await page.$('.chat-input .send');
await sendBtn.click();
await page.waitForTimeout(600);
const inputAfter = await page.$eval('#hero-chat-input', n=>n.value);
log('send button click -> input still has:', JSON.stringify(inputAfter));
// Whether our typed msg appears
const msgsAfter = await page.$eval('#msgs', n=>n.innerText);
log('typed text appears in msgs?', msgsAfter.includes('Does this send?'));

// --- Playground send (real cross-origin fetch) ---
log('\n=== PLAYGROUND ===');
const pgSendBtn = await page.$('#playgroundSend');
if(pgSendBtn){
  await pgSendBtn.scrollIntoViewIfNeeded();
  const pgInput = await page.$('#playgroundInput');
  await pgInput.fill('hi');
  await pgSendBtn.click();
  await page.waitForTimeout(3500);
  const pgOut = await page.$eval('#playgroundMsgs', n=>n.innerText.slice(-200));
  log('playground reply tail:', JSON.stringify(pgOut));
}
// prompt chips
for (const p of ['What can you do?','Data sovereignty?','How do you remember?','Export SOUL']){
  const b = await page.$(`.pg-prompt:has-text("${p}")`);
  log('pg-prompt present:', p, !!b);
}

// --- Nav anchors scroll ---
log('\n=== NAV ANCHORS ===');
for (const a of ['#companion','#community','#protocol']){
  const before = await page.evaluate(()=>window.scrollY);
  await page.click(`.nav-links a[href="${a}"]`).catch(e=>log('navclick fail',a,e.message));
  await page.waitForTimeout(700);
  const after = await page.evaluate(()=>window.scrollY);
  const target = await page.$(a);
  log(a, 'scrolled', before,'->',after, 'targetExists', !!target);
}

// Report cross-origin / external network statuses seen
log('\n=== NETWORK (non-localhost or non-200) ===');
for (const n of netMap){
  if(!n.url.includes('localhost:8795') || n.status>=400){
    log(n.status, n.method, n.url);
  }
}
log('\n=== CONSOLE ERRORS ===');
consoleErrs.forEach(e=>log(e));

await browser.close();
log('\nDONE 1440');
