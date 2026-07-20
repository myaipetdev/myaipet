import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
async function clk(txt,exact=true){ const els=await p.$$('button,[role=button]'); for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact?t===txt:t.includes(txt)){ await el.scrollIntoViewIfNeeded().catch(()=>{}); await el.click({timeout:3000,noWaitAfter:true}).catch(e=>console.log('clkerr',e.message.slice(0,30))); return true; } } return false; }

console.log('== STUDIO style boxShadow (correct prop) ==');
await p.goto(BASE+'/studio',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(4000);
const bs=(lbl)=>p.evaluate(l=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===l);return el?getComputedStyle(el).boxShadow.slice(0,40)+' | color '+getComputedStyle(el.querySelector('div:last-child')||el).color:null;},lbl);
console.log('Cinematic(default):',await bs('Cinematic'));
console.log('Anime before:',await bs('Anime'));
await clk('Anime'); await p.waitForTimeout(500);
console.log('Anime AFTER click:',await bs('Anime'));
console.log('Cinematic AFTER (should lose ring):',await bs('Cinematic'));

console.log('\n== BRACKET scroll anchors ==');
await p.goto(BASE+'/?section=worldcup',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const anchors=await p.evaluate(()=>({bracket:!!document.getElementById('wc-bracket'),seasonal:!!document.getElementById('wc-seasonal')}));
console.log('anchor targets exist:',JSON.stringify(anchors));
const y0=await p.evaluate(()=>window.scrollY);
await clk('Seasonal: World Cup',false); await p.waitForTimeout(1200);
const y1=await p.evaluate(()=>window.scrollY);
console.log('Seasonal click scrollY',y0,'->',y1,'moved:',Math.abs(y1-y0)>30);
await clk('Play the bracket',false); await p.waitForTimeout(1200);
const y2=await p.evaluate(()=>window.scrollY);
console.log('Play-bracket click scrollY',y1,'->',y2,'moved:',Math.abs(y2-y1)>30);

console.log('\n== TOUR Community Feed/Square toggle ==');
await p.goto(BASE+'/?section=community&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const seg=()=>p.evaluate(()=>['Feed','Square'].map(l=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===l);return el?l+':'+getComputedStyle(el).backgroundColor:l+':none';}));
console.log('before:',JSON.stringify(await seg()));
const bB=await p.evaluate(()=>document.body.innerText.length);
await clk('Feed'); await p.waitForTimeout(700);
console.log('after Feed:',JSON.stringify(await seg()),'bodyLen',bB,'->',await p.evaluate(()=>document.body.innerText.length));

await b.close(); console.log('\n==DONE==');
