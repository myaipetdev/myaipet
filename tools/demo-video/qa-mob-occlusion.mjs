import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
await p.goto('https://app.myaipet.ai/?section=my+pet',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// measure occlusion at scroll 0: is a Feed button covered by adopt card?
const m=await p.evaluate(()=>{
  const feed=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='Feed');
  const adopt=[...document.querySelectorAll('*')].find(el=>(el.innerText||'').trim().startsWith('Adopt'));
  const fr=feed?feed.getBoundingClientRect():null;
  const ar=adopt?adopt.getBoundingClientRect():null;
  // what element is at the center of the feed button?
  let hit=null;
  if(fr){const el=document.elementFromPoint(fr.x+fr.width/2, fr.y+fr.height/2); hit=el?el.tagName+':'+((el.innerText||'').trim().slice(0,20)):null;}
  return {feedRect:fr?{y:Math.round(fr.y),bottom:Math.round(fr.bottom)}:null, adoptRect:ar?{y:Math.round(ar.y),bottom:Math.round(ar.bottom),pos:getComputedStyle(adopt).position}:null, hitAtFeedCenter:hit, vh:window.innerHeight};
});
console.log('MOBILE_SCROLL0', JSON.stringify(m));
// try clicking Feed without manual scroll — does playwright need to scroll / is it covered?
const feed=p.locator('button:has-text("Feed")').first();
const clickable=await feed.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===el||el.contains(top);});
console.log('FEED_HITTABLE_AT_LOAD', clickable);
await b.close();
