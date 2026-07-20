import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const SH='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/trans';

async function clickByText(txt,exact=true){
  const els=await p.$$('button,[role=button]');
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact?t===txt:t.includes(txt)){ const box=await el.boundingBox(); if(!box)continue; await el.scrollIntoViewIfNeeded().catch(()=>{}); await el.click({timeout:3000,noWaitAfter:true}).catch(e=>console.log('  clickerr',e.message.slice(0,40))); return el; } }
  return null;
}

// ===== STUDIO style chips =====
console.log('===== STUDIO =====');
await p.goto(BASE+'/studio',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
// snapshot classes of style buttons before/after clicking "Anime"
const styleState=async()=>p.evaluate(()=>{
  const names=['Cinematic','Anime','Photoreal','Watercolor','3D Pixar','Pixel'];
  const out={};
  for(const n of names){ const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===n); if(el){ const cs=getComputedStyle(el); out[n]={cls:el.className.slice(0,60),ariaSel:el.getAttribute('aria-selected'),bg:cs.backgroundColor,bd:cs.borderColor}; } }
  return out;
});
const s0=await styleState();
console.log('Style BEFORE:',JSON.stringify(s0));
await clickByText('Anime');
await p.waitForTimeout(600);
const s1=await styleState();
console.log('Style AFTER click Anime:',JSON.stringify(s1));
console.log('  Anime changed:', JSON.stringify(s0.Anime)!==JSON.stringify(s1.Anime));
console.log('  Cinematic changed:', JSON.stringify(s0.Cinematic)!==JSON.stringify(s1.Cinematic));
// also try Image/Video mode toggle
const modeBtns=await p.$$eval('button',bs=>bs.map(b=>b.textContent.trim()).filter(t=>['Image','Video'].includes(t)));
console.log('Mode buttons present:',JSON.stringify(modeBtns));
const imgState0=await p.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Image');return el?{cls:el.className.slice(0,50),bg:getComputedStyle(el).backgroundColor}:null;});
await clickByText('Video');
await p.waitForTimeout(600);
const imgState1=await p.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Image');return el?{cls:el.className.slice(0,50),bg:getComputedStyle(el).backgroundColor}:null;});
console.log('Image btn bg before Video-click:',JSON.stringify(imgState0),' after:',JSON.stringify(imgState1),' changed:',JSON.stringify(imgState0)!==JSON.stringify(imgState1));
await p.screenshot({path:SH+'/verify-studio.png'});

// ===== SEASON Earn tab =====
console.log('\n===== SEASON REWARDS tabs =====');
await p.goto(BASE+'/?section=airdrop',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const tabsBefore=await p.evaluate(()=>document.body.innerText.slice(0,0)); // noop
const bodyB=await p.evaluate(()=>document.body.innerText.length);
const el=await clickByText('Earn',false);
await p.waitForTimeout(700);
const bodyA=await p.evaluate(()=>document.body.innerText.length);
const visible=await p.evaluate(()=>{const kws=['Missions','streak','spotlight','Daily'];return kws.map(k=>({k,present:document.body.innerText.includes(k)}));});
console.log('Season Earn tab: bodyLen',bodyB,'->',bodyA,'delta',bodyA-bodyB);
console.log('  keywords:',JSON.stringify(visible));
await p.screenshot({path:SH+'/verify-season.png'});
// list top-level tab buttons in the hub
const hubTabs=await p.evaluate(()=>{
  const btns=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.top<600&&r.width>40;});
  return btns.map(b=>({t:b.textContent.trim().slice(0,30),ariaSel:b.getAttribute('aria-selected'),cls:b.className.slice(0,40)})).slice(0,15);
});
console.log('  hub top buttons:',JSON.stringify(hubTabs,null,1));

// ===== TOUR Community Square tab =====
console.log('\n===== TOUR Community =====');
await p.goto(BASE+'/?section=community&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const cB=await p.evaluate(()=>({len:document.body.innerText.length,url:location.href}));
await clickByText('Square',false);
await p.waitForTimeout(800);
const cA=await p.evaluate(()=>({len:document.body.innerText.length,url:location.href}));
console.log('Square tab: ',JSON.stringify(cB),'->',JSON.stringify(cA),'delta',cA.len-cB.len);
await p.screenshot({path:SH+'/verify-tourcommunity.png'});

// ===== TOUR Bracket voting + tabs =====
console.log('\n===== TOUR Bracket =====');
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
// list all buttons
const bBtns=await p.$$eval('button',bs=>bs.map(b=>b.textContent.trim().slice(0,30)).filter(Boolean));
console.log('Bracket buttons:',JSON.stringify(bBtns));
// snapshot the matchup, click first Pick, see if it changes
const before=await p.evaluate(()=>{const picks=[...document.querySelectorAll('button')].filter(b=>/^Pick /.test(b.textContent.trim()));return {picks:picks.map(b=>b.textContent.trim()),bodyLen:document.body.innerText.length};});
console.log('Picks before:',JSON.stringify(before.picks));
const pick=await p.$$('button');
let pk=null; for(const el of pick){ if(/^Pick /.test((await el.textContent()||'').trim())){pk=el;break;} }
if(pk){ await pk.click({noWaitAfter:true}).catch(e=>console.log('pickerr',e.message.slice(0,40))); await p.waitForTimeout(900);
  const after=await p.evaluate(()=>{const picks=[...document.querySelectorAll('button')].filter(b=>/^Pick /.test(b.textContent.trim()));return {picks:picks.map(b=>b.textContent.trim()),bodyLen:document.body.innerText.length};});
  console.log('Picks after click:',JSON.stringify(after.picks),'bodyLen',before.bodyLen,'->',after.bodyLen);
  console.log('  matchup advanced:',JSON.stringify(before.picks)!==JSON.stringify(after.picks));
} else console.log('no Pick button found');
// tabs "Play the bracket" / "Seasonal: World Cup"
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
const tB=await p.evaluate(()=>document.body.innerText.length);
await clickByText('Seasonal: World Cup',false);
await p.waitForTimeout(800);
const tA=await p.evaluate(()=>document.body.innerText.length);
console.log('Seasonal:WorldCup tab bodyLen',tB,'->',tA,'delta',tA-tB);
await p.screenshot({path:SH+'/verify-tourbracket.png'});

// ===== Connect Wallet button (Season) =====
console.log('\n===== CONNECT WALLET =====');
await p.goto(BASE+'/?section=airdrop',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
const cw=await clickByText('Connect Wallet',false);
await p.waitForTimeout(1200);
const modal=await p.evaluate(()=>({rk:document.querySelectorAll('[data-rk]').length,dialog:document.querySelectorAll('[role=dialog]').length, w3m:document.querySelectorAll('w3m-modal,wcm-modal').length, txt:document.body.innerText.includes('WalletConnect')||document.body.innerText.includes('MetaMask')||document.body.innerText.includes('Coinbase')}));
console.log('After Connect Wallet click:',JSON.stringify(modal));
await p.screenshot({path:SH+'/verify-wallet.png'});

await b.close();
console.log('\n===DONE===');
