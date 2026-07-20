import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad';
const SHOTS=OUT+'/trans';
fs.mkdirSync(SHOTS,{recursive:true});
const BASE='https://app.myaipet.ai';

const SECTIONS=[
  {name:'Home', url:BASE+'/?section=home'},
  {name:'My Pet', url:BASE+'/?section=my%20pet'},
  {name:'Cards', url:BASE+'/?section=cards'},
  {name:'Bracket', url:BASE+'/?section=worldcup'},
  {name:'Studio', url:BASE+'/studio'},
  {name:'Community', url:BASE+'/?section=community'},
  {name:'PetClaw', url:BASE+'/?section=sovereignty'},
  {name:'Agent Office', url:BASE+'/?section=office'},
  {name:'Season Rewards', url:BASE+'/?section=airdrop'},
  {name:'TOUR Community', url:BASE+'/?section=community&tour=1'},
  {name:'TOUR My Pet', url:BASE+'/?section=my%20pet&tour=1'},
  {name:'TOUR Bracket', url:BASE+'/?section=worldcup&tour=1'},
];
const NAV_LABELS=new Set(['Home','My Pet','Cards','Bracket','Studio','Community','PetClaw','Agent Office','Season Rewards']);

const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
const p=await ctx.newPage();

let cerr=[],nerr=[],reqlog=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text().slice(0,200)); });
p.on('pageerror', e=>cerr.push('PAGEERR:'+e.message.slice(0,200)));
p.on('response', r=>{ const u=r.url().replace(BASE,''); if(r.status()>=400) nerr.push(r.status()+' '+u); reqlog.push({s:r.status(),u}); });

const results={};

for(const sec of SECTIONS){
  await p.goto(sec.url,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('GOTO ERR',sec.name,e.message.slice(0,60)));
  await p.waitForTimeout(3500);
  // dismiss any onboarding/paywall overlay to reach content
  await p.keyboard.press('Escape').catch(()=>{});
  await p.waitForTimeout(300);
  const safe=sec.name.replace(/\W+/g,'_');
  await p.screenshot({path:`${SHOTS}/${safe}.png`,fullPage:false}).catch(()=>{});

  // enumerate controls
  const controls=await p.$$eval('button,[role="button"],a,input[type=button],input[type=submit],[onclick]', els=>{
    const seen=new Set();
    return els.map((el,i)=>{
      const tag=el.tagName.toLowerCase();
      const label=(el.getAttribute('aria-label')||el.textContent||el.value||'').trim().replace(/\s+/g,' ').slice(0,40);
      const href=el.getAttribute('href');
      const cs=getComputedStyle(el);
      const r=el.getBoundingClientRect();
      const visible=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&cs.opacity!=='0';
      return {tag,label,href,disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',
        cursor:cs.cursor, visible, hasOnclick:!!el.getAttribute('onclick')};
    }).filter(x=>x.visible);
  });
  // build signature list (dedupe by tag+label+href+ordinal)
  const sigCount={};
  const sigs=controls.map(c=>{ const base=c.tag+'|'+c.label+'|'+(c.href||''); sigCount[base]=(sigCount[base]||0)+1; return {...c, sig:base, ord:sigCount[base]-1}; });

  const secFindings=[];
  for(const c of sigs){
    // skip nav items themselves (tested via navigation) but note href issues
    const isNav=c.tag==='button'&&NAV_LABELS.has(c.label);
    // static dead-href check for anchors
    let staticDead=null;
    if(c.tag==='a'){
      const h=(c.href||'').trim();
      if(h===''||h==='#'||h==='javascript:void(0)'||h==='javascript:;') staticDead='empty/#/void href';
    }
    // dynamic click test — re-locate by re-querying to stay valid
    cerr=[];nerr=[];reqlog=[];
    const before=await p.evaluate(()=>({url:location.href, nodes:document.querySelectorAll('*').length,
      dialogs:document.querySelectorAll('[role=dialog],[class*="modal" i],[class*="lightbox" i]').length,
      bodyLen:document.body.innerHTML.length}));
    // find the matching element handle fresh
    const handle=await p.evaluateHandle((args)=>{
      const {sig,ord}=args;
      const els=[...document.querySelectorAll('button,[role="button"],a,input[type=button],input[type=submit],[onclick]')];
      let n=0;
      for(const el of els){
        const tag=el.tagName.toLowerCase();
        const label=(el.getAttribute('aria-label')||el.textContent||el.value||'').trim().replace(/\s+/g,' ').slice(0,40);
        const href=el.getAttribute('href');
        const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
        const visible=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&cs.opacity!=='0';
        if(!visible) continue;
        const base=tag+'|'+label+'|'+(href||'');
        if(base===sig){ if(n===ord) return el; n++; }
      }
      return null;
    },{sig:c.sig,ord:c.ord});
    const elem=handle.asElement();
    let clickErr=null, effect={};
    if(elem && !c.disabled){
      try{ await elem.scrollIntoViewIfNeeded({timeout:2000}); }catch(e){}
      try{ await elem.click({timeout:3000,noWaitAfter:true}); }
      catch(e){ clickErr=e.message.slice(0,50); }
      await p.waitForTimeout(650);
      const after=await p.evaluate(()=>({url:location.href, nodes:document.querySelectorAll('*').length,
        dialogs:document.querySelectorAll('[role=dialog],[class*="modal" i],[class*="lightbox" i]').length,
        bodyLen:document.body.innerHTML.length,
        toast:[...document.querySelectorAll('[class*="toast" i],[role="status"],[role="alert"]')].map(e=>e.innerText).join('|').slice(0,120)}));
      const urlChanged=after.url!==before.url;
      const nodeDelta=Math.abs(after.nodes-before.nodes);
      const dialogOpened=after.dialogs>before.dialogs;
      const bodyDelta=Math.abs(after.bodyLen-before.bodyLen);
      const req2xx=reqlog.filter(r=>r.s>=200&&r.s<300).length;
      const toast=after.toast;
      const bad=[...new Set(nerr)];
      const observed = urlChanged||dialogOpened||nodeDelta>3||bodyDelta>150||!!toast||req2xx>0;
      effect={urlChanged,nodeDelta,dialogOpened,bodyDelta,req2xx,toast:toast||'',bad,cerr:[...new Set(cerr)].slice(0,4),observed};
      // cleanup: close modal, restore section
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(150);
      if(urlChanged && !after.url.includes(sec.url.split('?')[0].replace(BASE,''))){
        // navigated away — go back to section
        await p.goto(sec.url,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
        await p.waitForTimeout(2500);
      }
    }
    // classify
    let verdict=null,reason=null;
    if(c.disabled){ verdict='disabled'; reason='disabled'; }
    else if(staticDead){ verdict='dead'; reason=staticDead; }
    else if(clickErr){ verdict='clickblocked'; reason=clickErr; }
    else if(effect.bad&&effect.bad.length&&!effect.urlChanged&&!effect.dialogOpened&&!effect.toast&&effect.nodeDelta<=3){ verdict='silent-fail'; reason='4xx/5xx no UI: '+effect.bad.join(','); }
    else if(!effect.observed){ verdict='dead'; reason='no observable effect (no nav/modal/DOM/toast/2xx)'; }
    else { verdict='ok'; }
    secFindings.push({label:c.label||'(empty)',tag:c.tag,href:c.href,isNav,verdict,reason,effect:{u:effect.urlChanged,d:effect.dialogOpened,nd:effect.nodeDelta,bd:effect.bodyDelta,r2:effect.req2xx,t:effect.toast?effect.toast.slice(0,50):'',bad:effect.bad}});
  }
  results[sec.name]=secFindings;
  const dead=secFindings.filter(f=>f.verdict!=='ok'&&f.verdict!=='disabled'&&!f.isNav);
  const disabledN=secFindings.filter(f=>f.verdict==='disabled');
  console.log(`\n#### ${sec.name} :: total=${secFindings.length} problems=${dead.length} disabled=${disabledN.length}`);
  for(const f of secFindings){
    if(f.verdict==='ok') continue;
    console.log(`  [${f.verdict}] <${f.tag}> "${f.label}"${f.href?' href='+f.href:''}${f.isNav?' (NAV)':''} :: ${f.reason||''} :: ${JSON.stringify(f.effect)}`);
  }
}
fs.writeFileSync(OUT+'/trans-results.json', JSON.stringify(results,null,1));
await b.close();
console.log('\n===DONE===');
