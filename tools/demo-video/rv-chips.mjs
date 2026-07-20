import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto("https://app.myaipet.ai", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
const res = await page.evaluate(() => {
  const pillars = [...document.querySelectorAll("div")].filter(d => /^(AI Video Engine|Evolve & Equip|Social Circle|Portable Legacy)$/.test((d.querySelector("*")?.textContent || "").trim()) || /AI Video Engine/.test(d.innerText || "")).slice(0, 1);
  const cards = [...document.querySelectorAll("*")].filter(e => e.children.length && /^(AI Video Engine)$/.test(e.innerText?.split("\n")[1] || "") || false);
  // simpler: find text nodes
  function cardOf(label) {
    const el = [...document.querySelectorAll("*")].find(e => e.childElementCount === 0 && e.textContent.trim() === label);
    if (!el) return null;
    let c = el; for (let k = 0; k < 4 && c.parentElement; k++) c = c.parentElement;
    return c;
  }
  return ["AI Video Engine", "Evolve & Equip", "Social Circle", "Portable Legacy"].map(l => {
    const c = cardOf(l);
    if (!c) return { l, found: false };
    const svgs = c.querySelectorAll("svg").length;
    const emoji = (c.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
    return { l, svgs, emojiInText: emoji };
  });
});
console.log(JSON.stringify(res));
await browser.close();
