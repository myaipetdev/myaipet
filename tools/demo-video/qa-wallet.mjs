import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let consoleErrs=[], netErrs=[];
p.on('console', m=>{ if(m.type()==='error') consoleErrs.push(m.text()); });
p.on('pageerror', e=>{ consoleErrs.push('PAGEERROR: '+e.message); });
p.on('response', r=>{ if(r.status()>=400) netErrs.push(r.status()+' '+r.url()); });
await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);

async function clickText(txt, exact=true){
  const els = await p.$$('button, a');
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact? t===txt : t.includes(txt)){ 
    try{ await el.click({timeout:5000}); return true;}catch(e){return 'ERR:'+e.message.slice(0,50);} } }
  return false;
}

// 1. Connect Wallet modal
console.log('ConnectWallet click ->', await clickText('Connect Wallet'));
await p.waitForTimeout(2500);
await p.screenshot({path:SHOTS+'/wallet-modal.png'});
// detect rainbowkit modal
const modalTxt = await p.evaluate(()=>{ const m=document.querySelector('[data-rk], [role="dialog"], .ju367v'); return m? m.innerText.slice(0,400):'NO-MODAL'; });
console.log('MODAL:', JSON.stringify(modalTxt));
// list wallet options
const walletOpts = await p.$$eval('[role="dialog"] button, [data-rk] button', bs=>bs.map(b=>(b.textContent||'').trim()).filter(Boolean).slice(0,20)).catch(()=>[]);
console.log('WALLET OPTS:', JSON.stringify(walletOpts));
// close modal - press Escape
await p.keyboard.press('Escape');
await p.waitForTimeout(1000);
const stillOpen = await p.evaluate(()=>!!document.querySelector('[role="dialog"]'));
console.log('modal still open after Esc:', stillOpen);
console.log('CONSOLE:', JSON.stringify([...new Set(consoleErrs)]));
console.log('NET:', JSON.stringify([...new Set(netErrs)]));
await b.close();
