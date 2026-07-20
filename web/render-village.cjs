/* Dev-only harness: transpile the real PetVillage.tsx and server-render it with
   representative mock mission-control data so the illustration can be eyeballed.
   Writes a self-contained HTML file. Not shipped. */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const src = fs.readFileSync(path.join(__dirname, "src/components/PetVillage.tsx"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: "PetVillage.tsx",
}).outputText;

const outFile = path.join(__dirname, "._village_compiled.cjs");
fs.writeFileSync(outFile, js);
const PetVillage = require(outFile).default;

const now = new Date().toISOString();
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

const busyMc = {
  pet: { id: 1, name: "Mango", level: 3 },
  pillars: {
    soul: { set: true, persona: "The Curious Companion", checkpoints: 1 },
    memory: { count: 24, cap: 40, lastFact: "likes rainy mornings", updatedAt: ago(8) },
    user: { count: 12, cap: 25 },
    skills: { installed: 6, learned: 2, total: 18 },
    crons: { routines: 3, nextLabel: "next in 2h" },
  },
  kanban: {
    pending: [
      { id: 1, title: "Summarize this week's journal", kind: "goal" },
      { id: 2, title: "Draft a birthday reminder", kind: "goal" },
    ],
    working: [{ id: 3, title: "Recall my week and suggest something", skill: "memory.recall", detail: "3 steps · planning" }],
    blocked: [{ id: 4, title: "Post to X", reason: "no channel connected", at: ago(40) }],
    done: [
      { id: 5, title: "Fetched the weather", skill: "web.get", credits: 5, at: ago(20) },
      { id: 6, title: "Logged a memory", skill: "memory.write", at: ago(55) },
      { id: 7, title: "Made a sticker", skill: "codex.illustrate", credits: 5, at: ago(90) },
    ],
  },
  roster: [
    { id: "s1", name: "memory.recall", kind: "skill", role: "Pulls the right past facts into context", installed: true, status: "active", runs: 42, successRate: 96, lastAt: ago(5) },
    { id: "s2", name: "web.get", kind: "skill", role: "Fetches a page and reads it", installed: true, status: "idle", runs: 18, successRate: 88, lastAt: ago(30) },
    { id: "s3", name: "codex.illustrate", kind: "skill", role: "Draws a collectible creature sticker", installed: true, status: "idle", runs: 7, successRate: 100, lastAt: ago(120) },
    { id: "s4", name: "plan.execute", kind: "skill", role: "Breaks a goal into steps and runs them", installed: true, status: "active", runs: 12, successRate: 83, lastAt: ago(2) },
    { id: "s5", name: "calendar.add", kind: "skill", role: "Adds a reminder", installed: false, status: "idle", runs: 0 },
    { id: "v1", name: "watcher", kind: "vigil", role: "Notices new signals worth remembering", installed: true, status: "active", runs: 301, lastAt: ago(1) },
    { id: "v2", name: "curator", kind: "vigil", role: "Keeps the memory ledger tidy", installed: true, status: "idle", runs: 88, lastAt: ago(70) },
  ],
  schedules: [
    { id: "c1", name: "Morning digest", cadence: "daily 8am", lastRun: ago(300), nextRun: now, desc: "A short recap of yesterday" },
    { id: "c2", name: "Weekly reflection", cadence: "sun 6pm", lastRun: null, nextRun: now, desc: "Looks back on the week" },
    { id: "c3", name: "Memory sweep", cadence: "every 6h", lastRun: ago(120), nextRun: now, desc: "Consolidates loose facts" },
  ],
  generatedAt: now,
};

const quietMc = JSON.parse(JSON.stringify(busyMc));
quietMc.pillars.soul = { set: false, persona: "", checkpoints: 0 };
quietMc.pillars.memory = { count: 3, cap: 40, lastFact: null, updatedAt: null };
quietMc.pillars.user = { count: 0, cap: 25 };
quietMc.kanban = { pending: [], working: [], blocked: [], done: [] };
quietMc.roster = quietMc.roster.map((r) => ({ ...r, status: "idle" }));

const busyHtml = renderToStaticMarkup(
  React.createElement(PetVillage, {
    mc: busyMc,
    liveRun: { title: "Recall my week and suggest something", steps: [{ skill: "memory.recall", ok: true }, { skill: "plan.execute", ok: true }], done: false },
    running: true,
    isWorking: true,
    petName: "Mango",
  })
);
const quietHtml = renderToStaticMarkup(
  React.createElement(PetVillage, { mc: quietMc, liveRun: null, running: false, isWorking: false, petName: "Pip" })
);

const page = `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--ed-disp:'Georgia',serif;--ed-body:system-ui,sans-serif;--ed-m:ui-monospace,monospace;--ed-shadow-card:0 20px 40px -26px rgba(80,55,20,.5)}
  body{margin:0;background:#EFE7D6;font-family:system-ui}
  .wrap{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
  h3{font-family:var(--ed-m);letter-spacing:.16em;color:#6B4FA0;font-size:13px;margin:34px 0 10px}
  @keyframes officePulse{0%,100%{box-shadow:0 0 0 0 rgba(107,79,160,0),var(--ed-shadow-card)}50%{box-shadow:0 0 0 3px rgba(107,79,160,.18),var(--ed-shadow-card)}}
</style></head><body><div class="wrap">
<h3>STATE A — BUSY / LIT (soul set · forge on · well busy · courier · active pets)</h3>
${busyHtml}
<h3>STATE B — QUIET / OFF (soul not set · empty board · idle pets)</h3>
${quietHtml}
</div></body></html>`;

const dir = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad";
const soloPage = (inner) => `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--ed-disp:'Georgia',serif;--ed-body:system-ui,sans-serif;--ed-m:ui-monospace,monospace;--ed-shadow-card:0 20px 40px -26px rgba(80,55,20,.5)}body{margin:0;background:#EFE7D6;font-family:system-ui}.wrap{max-width:1180px;margin:0 auto;padding:20px}@keyframes officePulse{0%,100%{box-shadow:0 0 0 0 rgba(107,79,160,0),var(--ed-shadow-card)}50%{box-shadow:0 0 0 3px rgba(107,79,160,.18),var(--ed-shadow-card)}}</style></head><body><div class="wrap">${inner}</div></body></html>`;

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "village.html"), page);
fs.writeFileSync(path.join(dir, "village-quiet.html"), soloPage(quietHtml));
fs.unlinkSync(outFile);
console.log("wrote", path.join(dir, "village.html"), "bytes:", page.length);
