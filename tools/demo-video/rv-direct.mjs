import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/rv";
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto("https://app.myaipet.ai/studio", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
const input = page.locator('input[aria-label="One-line idea for the Director"]');
await input.fill("pet chasing fireflies at dusk");
await page.waitForTimeout(300);
const direct = page.locator("button", { hasText: /^Direct it$/ }).first();
await direct.click({ timeout: 5000 });
await page.waitForTimeout(2500);
const res = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    signInMsg: (t.match(/[^\n]*Sign in to use the Director[^\n]*/i) || [null])[0],
    modal: (t.match(/[^\n]*(connect|sign.?in)[^\n]*/gi) || []).slice(0, 6),
  };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: `${OUT}/studio-direct3.jpg`, type: "jpeg", quality: 80 });
await browser.close();
