import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const SH='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/trans';
async function clk(txt,exact=true){ const els=await p.$$('button,[role=button]'); for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact?t===txt:t.includes(txt)){ await el.scrollIntoViewIfNeeded().catch(()=>{}); await el.click({timeout:3000,noWaitAfter:true}).catch(e=>console.log('  clkerr',txt,e.message.slice(0,30))); return true; } } return false; }

console.log('===== STUDIO style chips =====');
await p.goto(BASE+'/studio',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(4000);
const stStyle=async()=>p.evaluate(()=>{const names=['Cinematic','Anime','Photoreal','Watercolor'];const o={};for(const n of names){const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===n);if(el)o[n]=getComputedStyle(el).borderColor+'/'+getComputedStyle(el).backgroundColor;}return o;});
console.log('before:',JSON.stringify(await stStyle()));
await clk('Anime'); await p.waitForTimeout(500);
console.log('after Anime:',JSON.stringify(await stStyle()));
await clk('Watercolor'); await p.waitForTimeout(500);
console.log('after Watercolor:',JSON.stringify(await stStyle()));
// preset chips
console.log('-- preset chip: click "surfing a giant wave" -> does prompt textarea fill?');
const ta0=await p.evaluate(()=>{const t=document.querySelector('textarea');return t?t.value:null;});
await clk('surfing a giant wave',false); await p.waitForTimeout(500);
const ta1=await p.evaluate(()=>{const t=document.querySelector('textarea');return t?t.value:null;});
console.log('  textarea:',JSON.stringify(ta0),'->',JSON.stringify(ta1),'changed:',ta0!==ta1);

console.log('\n===== SEASON tab switching =====');
await p.goto(BASE+'/?section=airdrop',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const segState=async()=>p.evaluate(()=>{const b=[...document.querySelectorAll('button.mp-lift')];return b.map(x=>({t:x.textContent.trim().slice(0,12),bg:getComputedStyle(x).backgroundColor,ar:x.getAttribute('aria-selected')}));});
console.log('segments before:',JSON.stringify(await segState()));
const bodyB=await p.evaluate(()=>document.body.innerText.length);
await clk('CompeteLeaderboards',false); await p.waitForTimeout(700);
const bodyC=await p.evaluate(()=>document.body.innerText.length);
console.log('after Compete: segments',JSON.stringify(await segState()),'bodyLen',bodyB,'->',bodyC);
await clk('EarnMissions',false); await p.waitForTimeout(700);
const bodyE=await p.evaluate(()=>document.body.innerText.length);
console.log('after Earn(back): bodyLen',bodyC,'->',bodyE);

console.log('\n===== TOUR Community "Square" =====');
await p.goto(BASE+'/?section=community&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const allC=await p.$$eval('button',bs=>bs.map(b=>b.textContent.trim().slice(0,26)).filter(Boolean));
console.log('buttons:',JSON.stringify(allC));
const sqInfo=await p.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Square');if(!el)return null;return {cls:el.className.slice(0,50),ar:el.getAttribute('aria-selected'),role:el.getAttribute('role'),bg:getComputedStyle(el).backgroundColor};});
console.log('Square btn:',JSON.stringify(sqInfo));
// what other tabs exist beside Square?
const bodyB2=await p.evaluate(()=>document.body.innerText.slice(0,400));
await clk('Square'); await p.waitForTimeout(800);
const bodyA2=await p.evaluate(()=>document.body.innerText.slice(0,400));
console.log('Square click text-change:',bodyB2!==bodyA2);
await p.screenshot({path:SH+'/v3-tourcommunity.png',fullPage:true});

console.log('\n===== TOUR Bracket contestant vote + Seasonal tab =====');
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
const contestBefore=await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].filter(x=>/Level \d/.test(x.textContent));return b.map(x=>x.textContent.trim().slice(0,20));});
console.log('contestants before:',JSON.stringify(contestBefore));
// click first contestant
const els=await p.$$('button'); let done=false;
for(const el of els){ const t=(await el.textContent()||'').trim(); if(/Level \d/.test(t)){ await el.click({noWaitAfter:true}).catch(e=>console.log('voteerr',e.message.slice(0,30))); done=true; break; } }
await p.waitForTimeout(1000);
const contestAfter=await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].filter(x=>/Level \d/.test(x.textContent));return b.map(x=>x.textContent.trim().slice(0,20));});
console.log('contestants after vote:',JSON.stringify(contestAfter),'advanced:',JSON.stringify(contestBefore)!==JSON.stringify(contestAfter));
// Reshuffle
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
const rB=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(x=>/Level \d/.test(x.textContent)).map(x=>x.textContent.trim().slice(0,20)));
await clk('Reshuffle'); await p.waitForTimeout(900);
const rA=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(x=>/Level \d/.test(x.textContent)).map(x=>x.textContent.trim().slice(0,20)));
console.log('Reshuffle: ',JSON.stringify(rB),'->',JSON.stringify(rA),'changed:',JSON.stringify(rB)!==JSON.stringify(rA));
// Seasonal tab
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
const seasBodyB=await p.evaluate(()=>document.body.innerText.length);
const seasFound=await clk('Seasonal: World Cup',false); await p.waitForTimeout(800);
const seasBodyA=await p.evaluate(()=>document.body.innerText.length);
const playTabInfo=await p.evaluate(()=>{const els=[...document.querySelectorAll('button')];const play=els.find(b=>b.textContent.trim()==='Play the bracket');const seas=els.find(b=>b.textContent.includes('Seasonal'));return{play:play?{ar:play.getAttribute('aria-selected'),bg:getComputedStyle(play).backgroundColor}:null,seas:seas?{ar:seas.getAttribute('aria-selected'),bg:getComputedStyle(seas).backgroundColor}:null};});
console.log('Seasonal tab found=',seasFound,'bodyLen',seasBodyB,'->',seasBodyA,'tabInfo',JSON.stringify(playTabInfo));
await p.screenshot({path:SH+'/v3-tourbracket.png',fullPage:true});
// Hide button
await clk('Hide'); await p.waitForTimeout(600);
const afterHide=await p.evaluate(()=>document.body.innerText.length);
console.log('after Hide bodyLen ->',afterHide);

await b.close(); console.log('\n===DONE===');
