import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
const p = await ctx.newPage();
let nerr=[],cerr=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text().slice(0,150)); });
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
async function clickNav(label){const els=await p.$$('a,button');for(const el of els){const t=(await el.textContent()||'').trim();if(t===label){await el.click().catch(()=>{});return true;}}return false;}
await p.goto('https://app.myaipet.ai/',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1500);
await clickNav('PetClaw'); await p.waitForTimeout(2000);

// Download Extension button
let dl=null;
p.on('download', d=>{ dl=d.suggestedFilename(); });
const btns=await p.$$('button,a');
let dlbtn;
for(const el of btns){ if((await el.textContent()||'').trim()==='Download Extension'){dlbtn=el;break;} }
console.log('DownloadExtension found:',!!dlbtn);
nerr=[];
if(dlbtn){ await dlbtn.click().catch(e=>console.log('dlerr',e.message.slice(0,60))); await p.waitForTimeout(3500); }
console.log('download triggered filename:',dl,'nerr:',JSON.stringify([...new Set(nerr)]));

// Connect wallet to claim it
const before=await p.evaluate(()=>document.querySelectorAll('[role=dialog],[class*=modal i]').length);
let cw;
const btns2=await p.$$('button,a');
for(const el of btns2){ if((await el.textContent()||'').trim()==='Connect wallet to claim it'){cw=el;break;} }
console.log('ConnectWalletClaim found:',!!cw);
nerr=[];
if(cw){ await cw.click().catch(()=>{}); await p.waitForTimeout(2500); }
const after=await p.evaluate(()=>document.querySelectorAll('[role=dialog],[class*=modal i]').length);
await p.screenshot({path:SHOTS+'/wallet-modal.png'});
const modalTxt=await p.evaluate(()=>{const m=document.querySelector('[role=dialog],[class*=modal i]');return m?m.innerText.slice(0,400):'NONE';});
console.log('wallet modal before/after:',before,after,'nerr:',JSON.stringify([...new Set(nerr)]));
console.log('modalTxt:',JSON.stringify(modalTxt));
console.log('cerr:',JSON.stringify([...new Set(cerr)]));
await b.close();
