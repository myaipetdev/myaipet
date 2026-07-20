import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("./qa-landing-int/", import.meta.url));
mkdirSync(DIR, { recursive: true });
const URL_ = "http://localhost:8795/index.html";
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const log = [];

// ---- Desktop interactions
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on("console", m => m.type()==="error" && errs.push(m.text()));
  page.on("pageerror", e => errs.push("PE: "+e.message));
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // hero CTA hrefs
  const getStarted = await page.getAttribute('a.btn-primary', 'href').catch(()=>null);
  log.push("Get started href: " + getStarted);

  // carousel dot 3 click -> video switch
  await page.click('button.vdot[aria-label="Show hero video 3"]');
  await page.waitForTimeout(800);
  const pressed = await page.getAttribute('button.vdot[aria-label="Show hero video 3"]','aria-pressed');
  log.push("vdot3 aria-pressed after click: " + pressed);

  // demo reel play
  await page.evaluate(()=>document.getElementById('journey').scrollIntoView());
  await page.waitForTimeout(600);
  const reel = await page.$('[onclick="playDemo(this)"]');
  if (reel) { await reel.click(); await page.waitForTimeout(1500);
    const hasIframe = await page.$('#journey iframe'); log.push("demo reel iframe after click: " + !!hasIframe); }
  else log.push("demo reel el NOT FOUND");

  // npm copy button
  await page.evaluate(()=>document.getElementById('protocol').scrollIntoView());
  await page.waitForTimeout(500);
  await page.click('#sdkCopy');
  await page.waitForTimeout(400);
  const copyTxt = await page.textContent('#sdkCopy').catch(()=>null);
  log.push("copy button label after click: " + JSON.stringify(copyTxt));

  // playground send (real prod API)
  await page.evaluate(()=>document.getElementById('playground').scrollIntoView());
  await page.waitForTimeout(500);
  await page.fill('#playgroundInput', 'Hi Sparky, what can you do?');
  await page.click('#playgroundSend');
  await page.waitForTimeout(9000);
  const pgMsgs = await page.$$eval('#playgroundMsgs *', els => els.map(e=>e.textContent).filter(Boolean));
  log.push("playground messages: " + JSON.stringify(pgMsgs.slice(-4)));
  await page.screenshot({ path: DIR+"pg-result.jpg", type:"jpeg", quality:82 });

  log.push("DESKTOP console errors: " + JSON.stringify([...new Set(errs)]));
  await page.close();
}

// ---- Mobile hamburger
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.click('#navBurger');
  await page.waitForTimeout(500);
  const expanded = await page.getAttribute('#navBurger','aria-expanded');
  log.push("mobile burger aria-expanded after click: " + expanded);
  await page.screenshot({ path: DIR+"m-menu-open.jpg", type:"jpeg", quality:82 });
  // click a nav link
  const linkVisible = await page.isVisible('#navLinks a[href="#companion"]').catch(()=>false);
  log.push("mobile menu companion link visible: " + linkVisible);
  await page.close();
}

await browser.close();
console.log(log.join("\n"));
