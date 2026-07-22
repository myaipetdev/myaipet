const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionDir = __dirname;
const backgroundPath = path.join(extensionDir, "background.js");
const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
const accessModuleEnd = backgroundSource.indexOf("// Calendar-day features should follow");
assert.ok(accessModuleEnd > 0, "site-access module boundary was not found");

const state = {
  permissions: new Set(),
  scripts: new Map(),
  tabs: new Map(),
  sent: [],
  executed: [],
  registrations: 0,
  petConfig: {},
};

const chrome = {
  permissions: {
    contains: async ({ origins = [] }) => origins.every((origin) => state.permissions.has(origin)),
    remove: async ({ origins = [] }) => {
      const removable = origins.every((origin) => state.permissions.has(origin));
      if (!removable) return false;
      for (const origin of origins) state.permissions.delete(origin);
      return true;
    },
  },
  scripting: {
    getRegisteredContentScripts: async (filter = {}) => {
      const scripts = [...state.scripts.values()];
      return filter.ids ? scripts.filter((script) => filter.ids.includes(script.id)) : scripts;
    },
    unregisterContentScripts: async ({ ids = [] }) => {
      for (const id of ids) state.scripts.delete(id);
    },
    registerContentScripts: async (scripts) => {
      if (scripts.some((script) => state.scripts.has(script.id))) throw new Error("duplicate id");
      state.registrations += 1;
      for (const script of scripts) state.scripts.set(script.id, { ...script });
    },
    executeScript: async (injection) => {
      if (!state.tabs.has(injection.target.tabId)) throw new Error("missing tab");
      state.executed.push(injection);
      return [{ frameId: 0 }];
    },
  },
  tabs: {
    get: async (tabId) => {
      if (!state.tabs.has(tabId)) throw new Error("missing tab");
      return state.tabs.get(tabId);
    },
    query: async () => [...state.tabs.entries()].map(([id, tab]) => ({ id, ...tab })),
    sendMessage: async (tabId, message) => {
      state.sent.push({ tabId, message });
      return {};
    },
  },
  storage: {
    local: {
      get: async () => ({ petConfig: state.petConfig }),
      set: async (items) => {
        if (items.petConfig) state.petConfig = items.petConfig;
      },
    },
  },
};

const context = vm.createContext({ chrome, console, URL, Math, Promise, Set, String, Array, Number, Boolean });
vm.runInContext(backgroundSource.slice(0, accessModuleEnd), context, { filename: backgroundPath });
const call = (name, ...args) => {
  context.__args = args;
  return vm.runInContext(`${name}(...__args)`, context);
};

async function runBehaviorContract() {
  const descriptor = call("siteAccessDescriptor", "HTTPS://Example.COM.:8443/path?q=1");
  assert.equal(descriptor.host, "example.com");
  assert.equal(descriptor.pattern, "https://example.com/*");
  assert.equal(call("siteAccessDescriptor", "https://paypal.com./login"), null, "trailing-dot blocked-domain bypass");
  assert.equal(call("siteAccessDescriptor", "https://x.accounts.google.com/"), null, "blocked subdomain bypass");
  assert.equal(call("siteAccessDescriptor", "https://app.myaipet.ai/"), null, "first-party double injection");
  assert.equal(call("siteAccessDescriptor", "chrome://settings"), null, "browser page support");
  assert.equal(call("siteAccessDescriptor", "https://*/"), null, "wildcard must not become a per-site descriptor");
  for (const url of [
    "http://localhost:3000/", "http://devbox/", "http://printer.local/",
    "http://router.home.arpa/", "http://127.0.0.1/", "http://10.0.0.1/",
    "http://100.64.0.1/", "http://169.254.169.254/", "http://172.31.0.1/",
    "http://192.168.1.1/", "http://198.18.0.1/", "http://[::1]/",
    "http://[fd00::1]/", "http://224.0.0.1/",
  ]) {
    assert.equal(call("siteAccessDescriptor", url), null, `private/local host must stay blocked: ${url}`);
  }

  state.petConfig = {
    apiUrl: "https://attacker.example",
    authToken: `pck_${"x".repeat(43)}`,
    petId: 99,
    preferences: { particles: false },
  };
  const migrated = await call("getConfig");
  assert.equal(migrated.apiUrl, "https://app.myaipet.ai", "API origin must be first-party pinned");
  assert.equal(migrated.authToken, "", "legacy/non-extension token must be removed");
  assert.equal(migrated.petId, null, "a removed token must not retain a pet binding");
  assert.equal(migrated.preferences.particles, false, "stored preferences survive security migration");
  await call("saveConfig", {
    apiUrl: "https://attacker.example",
    authToken: `pex_${"x".repeat(43)}`,
    preferences: { autoTalk: true },
  });
  assert.equal(state.petConfig.apiUrl, "https://app.myaipet.ai", "saveConfig cannot override API origin");
  assert.equal(state.petConfig.preferences.particles, false, "partial preference updates must merge");
  assert.equal(state.petConfig.preferences.autoTalk, true);
  state.petConfig = {};

  let info = await call("siteAccessInfo", "https://example.com/page");
  assert.deepEqual(JSON.parse(JSON.stringify(info)), {
    supported: true,
    granted: false,
    active: false,
    host: "example.com",
    pattern: "https://example.com/*",
  });

  state.permissions.add(descriptor.pattern);
  info = await call("siteAccessInfo", "https://example.com/page");
  assert.equal(info.granted, true);
  assert.equal(info.active, false, "permission alone must not be reported as active");

  state.tabs.set(1, { url: "https://different.example/page" });
  let result = await call("registerSiteAccess", "https://example.com/page", 1);
  assert.equal(result.success, false, "tab-navigation race must be rejected");
  assert.equal(state.scripts.size, 0);
  assert.equal(state.executed.length, 0);
  assert.equal(state.permissions.has(descriptor.pattern), false, "failed activation must not retain host permission");

  state.permissions.add(descriptor.pattern);
  state.tabs.set(1, { url: "https://example.com/page" });
  state.tabs.set(2, { url: "https://example.com/other" });
  state.tabs.set(3, { url: "https://unrelated.test/" });
  result = await call("registerSiteAccess", "https://example.com/page", 1);
  assert.equal(result.success, true);
  assert.equal(result.active, true);
  assert.equal(result.injected, true);
  assert.equal(state.registrations, 1);
  assert.equal(state.executed.length, 1);
  const registered = state.scripts.get(descriptor.scriptId);
  assert.deepEqual(Array.from(registered.matches), [descriptor.pattern]);
  assert.deepEqual(Array.from(registered.js), ["content.js"]);
  assert.equal(registered.persistAcrossSessions, true);
  assert.equal(registered.runAt, "document_idle");

  await call("registerSiteAccess", "https://example.com/another", 2);
  assert.equal(state.registrations, 1, "repeat activation must reuse the exact registration");
  assert.equal(state.scripts.size, 1, "repeat activation must not duplicate registrations");

  state.petConfig = { pausedHosts: ["example.com", "keep.test"] };
  result = await call("removeSiteAccess", "https://example.com/page");
  assert.equal(result.success, true);
  assert.equal(state.permissions.has(descriptor.pattern), false);
  assert.equal(state.scripts.size, 0);
  assert.deepEqual(Array.from(state.petConfig.pausedHosts), ["keep.test"]);
  assert.equal(state.sent.length, 3, "removal must notify every open tab because injected code survives unregister");
  assert.ok(state.sent.every(({ message }) => message.type === "disableForSite" && message.host === "example.com"));

  state.sent.length = 0;
  await call("deactivateRemovedOrigins", ["https://*/*"]);
  assert.equal(state.sent.length, 3);
  assert.ok(state.sent.every(({ message }) => message.all === true));

  const stale = call("siteAccessDescriptor", "https://stale.example/");
  state.scripts.set(stale.scriptId, {
    id: stale.scriptId,
    matches: [stale.pattern],
    js: ["content.js"],
    runAt: "document_idle",
    persistAcrossSessions: true,
  });
  state.scripts.set("petclaw-site-blocked", {
    id: "petclaw-site-blocked",
    matches: ["https://paypal.com/*"],
    js: ["content.js"],
    runAt: "document_idle",
  });
  state.permissions.add("https://paypal.com/*");
  await call("reconcileSiteRegistrations");
  assert.equal(state.scripts.size, 0, "stale, malformed, or newly blocked registrations must be removed");
  assert.equal(state.permissions.has("https://paypal.com/*"), false, "newly blocked host permission must be revoked");
  assert.ok(state.sent.some(({ message }) => message.host === "paypal.com"), "newly blocked open pages must be shut down");
}

async function runActivityConcurrencyContract() {
  const start = backgroundSource.indexOf('const EVOLUTION_KEY = "petEvolution"');
  const end = backgroundSource.indexOf('const GAME_KEY = "petGameStats"');
  assert.ok(start > 0 && end > start, "activity mutation module boundary was not found");

  const activityState = {
    petEvolution: { stage: 0, xp: 0 },
    petPoints: {},
  };
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const activityChrome = {
    storage: {
      local: {
        get: async (key) => {
          await Promise.resolve();
          return { [key]: clone(activityState[key]) };
        },
        set: async (items) => {
          await Promise.resolve();
          Object.assign(activityState, clone(items));
        },
      },
    },
  };
  const activityConsole = { log() {}, warn: console.warn, error: console.error };
  const activityContext = vm.createContext({ chrome: activityChrome, console: activityConsole, Math, Promise });
  const moodStart = backgroundSource.indexOf("async function recordEmotionSeen");
  const moodEnd = backgroundSource.indexOf("function getDominantEmotion");
  const streakStart = backgroundSource.indexOf("let streakTickInFlight = null");
  const streakEnd = backgroundSource.indexOf("async function fetchPetInfo");
  assert.ok(moodStart > 0 && moodEnd > moodStart, "mood metadata mutation boundary was not found");
  assert.ok(streakStart > 0 && streakEnd > streakStart, "streak mutation boundary was not found");
  activityContext.Date = Date;
  activityContext.localDayKey = () => "2026-07-18";
  activityContext.addNotification = async () => {};
  vm.runInContext(
    `${backgroundSource.slice(moodStart, moodEnd)}\n${backgroundSource.slice(start, end)}\n${backgroundSource.slice(streakStart, streakEnd)}`,
    activityContext,
    { filename: backgroundPath },
  );
  activityContext.__awards = Array.from({ length: 50 }, (_, index) => index);
  await vm.runInContext(
    'Promise.all([...__awards.map((index) => addPoints("care", 1, `race-${index}`)), recordEmotionSeen("Happy"), tickStreak()])',
    activityContext,
  );
  assert.equal(activityState.petPoints.totalPoints, 62, "concurrent awards and daily bonuses must preserve the total");
  assert.equal(activityState.petPoints.carePoints, 50, "concurrent care awards must preserve their category total");
  assert.equal(activityState.petPoints.heartbeatPoints, 12, "daily and streak bonuses must retain their category total");
  assert.equal(activityState.petPoints.dailyStreak, 1, "daily streak metadata must survive concurrent awards");
  assert.deepEqual(Array.from(activityState.petPoints._emotionSet), ["Happy"], "mood metadata must survive concurrent awards");
  assert.equal(activityState.petEvolution.xp, 56, "concurrent awards must preserve evolution XP");
}

function runStaticContract() {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
  const pairingHtml = fs.readFileSync(path.join(extensionDir, "popup.html"), "utf8");
  const pairingJs = fs.readFileSync(path.join(extensionDir, "popup.js"), "utf8");
  assert.match(
    pairingHtml,
    /https:\/\/app\.myaipet\.ai\/\?section=sovereignty#extension-token/,
    "extension pairing CTA must deep-link to the real token card",
  );
  assert.doesNotMatch(pairingHtml, /#connect-cli/, "removed token anchor must not return");
  assert.match(pairingJs, /!paired && !pairingTabAutoOpened/, "unpaired installs must open Settings once");
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number(manifest.minimum_chrome_version) >= 102, "trusted-only storage access requires Chrome 102+");
  assert.equal(manifest.content_scripts, undefined, "no static all-site injection");
  assert.deepEqual(manifest.host_permissions, ["https://app.myaipet.ai/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("tabs"), "persistent tabs access is unnecessary");
  assert.equal(
    manifest.content_security_policy?.extension_pages,
    "script-src 'self'; object-src 'none'; base-uri 'none'",
    "extension pages need an explicit no-remote-code CSP",
  );

  const popupSource = fs.readFileSync(path.join(extensionDir, "popup.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(extensionDir, "popup.html"), "utf8");
  const contentSource = fs.readFileSync(path.join(extensionDir, "content.js"), "utf8");
  assert.match(popupHtml, /<html lang="en">[\s\S]*<title>PetClaw<\/title>/, "popup needs a language and document title");
  assert.match(popupSource, /siteAccessBtn[\s\S]*chrome\.permissions\.request/, "permission request must follow the site-access user action");
  assert.doesNotMatch(backgroundSource, /chrome\.permissions\.request/, "service worker must not prompt outside a direct user gesture");
  assert.match(backgroundSource, /sender\.tab[\s\S]*Promise\.all\(\[siteAccessInfo\(senderUrl\), getConfig\(\)\]\)/, "page messages require active-site and runtime-policy authorization");
  assert.match(backgroundSource, /const PAGE_MESSAGE_TYPES = new Set[\s\S]*sender\.tab && !PAGE_MESSAGE_TYPES\.has/, "page contexts need a narrow message allowlist");
  assert.match(backgroundSource, /const API_URL = "https:\/\/app\.myaipet\.ai"[\s\S]*const url = `\$\{API_URL\}\$\{endpoint\}`/, "API requests must use the pinned first-party origin");
  assert.doesNotMatch(backgroundSource, /\/api\/petclaw\/(?:export|import)|\bexportSoul\b|\bimportSoul\b/, "reduced extension tokens must not attempt broad SOUL operations");
  assert.match(backgroundSource, /openSovereigntyDashboard[\s\S]*\?section=sovereignty[\s\S]*openSovereignty:/, "SOUL controls must hand off to the first-party dashboard");
  assert.match(contentSource, /Manage SOUL in dashboard[\s\S]*case "export"[\s\S]*type: "openSovereignty"/, "the in-page SOUL action must describe and use the secure handoff");
  assert.match(popupSource, /exportBtn[\s\S]*type: "openSovereignty"[\s\S]*importBtn[\s\S]*type: "openSovereignty"/, "popup SOUL controls must use the secure dashboard handoff");
  assert.match(contentSource, /globalThis\[INSTANCE_KEY\][\s\S]*before any await/, "content script must claim its document synchronously");
  assert.match(contentSource, /function shutdown\(\)[\s\S]*cancelAnimationFrame[\s\S]*removeListener[\s\S]*extensionHost\.remove/, "permission removal must tear down page observers and timers");
  assert.match(contentSource, /PAGE_SUMMARY_MAX_CHARS = 1_500[\s\S]*Preview up to 1,500 characters/, "summary preview and transport limits must agree");
  assert.match(contentSource, /id="aipet-body" role="button" tabindex="0"[\s\S]*event\.key === "ContextMenu"/, "page companion must be keyboard operable");
  const menuTemplate = contentSource.match(/menu\.innerHTML = `([\s\S]*?)`;/)?.[1] || "";
  const menuButtons = menuTemplate.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(menuButtons.length, 11, "page companion menu inventory changed; audit every added or removed action");
  for (const tag of menuButtons) {
    assert.match(tag, /type="button"/, `companion menu button lacks explicit type: ${tag}`);
    assert.match(tag, /role="menuitem"/, `companion menu button lacks menuitem semantics: ${tag}`);
    const action = tag.match(/data-action="([^"]+)"/)?.[1];
    assert.ok(action, `companion menu button lacks an action: ${tag}`);
    assert.match(contentSource, new RegExp(`case "${action}"`), `companion menu action has no handler: ${action}`);
  }
  const disabledMenuButtons = menuButtons.filter((tag) => /\bdisabled\b/.test(tag));
  assert.equal(disabledMenuButtons.length, 1, "only the honest coming-soon action may be disabled");
  assert.match(disabledMenuButtons[0], /Selfie — Coming soon/, "disabled companion action must explain its state");
  assert.match(contentSource, /function bubbleButton[\s\S]*btn\.type = "button"[\s\S]*if \(!event\.isTrusted\) return/, "summary consent buttons need trusted-click gating");
  assert.match(contentSource, /bubbleButton\("Preview"/, "page summaries need an explicit preview control");
  assert.match(contentSource, /bubbleButton\("Send for summary"/, "page summaries need a separate send confirmation");
  assert.match(contentSource, /el\.type = "button"[\s\S]*Collect \$\{kind[\s\S]*if \(!ev\.isTrusted\) return/, "collectible controls need names and trusted-click gating");
  assert.match(popupHtml, /id="siteAccessBtn"[^>]*aria-describedby="siteAccessStatus"/, "site access control needs its status description");
  assert.match(popupHtml, /id="disconnectBtn"/, "pairing needs an explicit local disconnect action");
  assert.match(popupSource, /disconnectBtn[\s\S]*authToken: ""[\s\S]*petId: null/, "disconnect must clear the local credential and pet binding");
  assert.match(popupHtml, /<select id="petId"[\s\S]*choose the identity this browser should use/i, "multi-pet pairing needs an explicit owned-pet selector");
  assert.match(backgroundSource, /tokenChanged[\s\S]*merged\.petId = null/, "a changed token must revoke the previous pet binding");
  const multiPetBranch = backgroundSource.slice(
    backgroundSource.indexOf("if (!pet && pets.length > 1)"),
    backgroundSource.indexOf("if (!pet) pet = pets[0]"),
  );
  assert.match(multiPetBranch, /needsPetSelection: true[\s\S]*return \{ \.\.\.updated, ownedPets: pets \}/, "multi-pet accounts must pause for an explicit selection before the single-pet fallback");
  const companionInvocation = backgroundSource.slice(
    backgroundSource.indexOf('skillId: "companion-chat"'),
    backgroundSource.indexOf("if (result?.success && result.output?.reply)"),
  );
  assert.doesNotMatch(companionInvocation, /\bmood:|\bemotions:/, "extension companion input must match the canonical strict schema");
  const summaryInvocation = backgroundSource.slice(
    backgroundSource.indexOf('skillId: "summarize-page"'),
    backgroundSource.indexOf("if (result?.success && result.output?.reply)", backgroundSource.indexOf('skillId: "summarize-page"')),
  );
  assert.doesNotMatch(summaryInvocation, /\bplatform:/, "extension summary input must match the canonical strict schema");
  assert.match(backgroundSource, /let activityMutationTail = Promise\.resolve\(\)[\s\S]*function withActivityMutation[\s\S]*async function addPoints[\s\S]*withActivityMutation/, "points/evolution mutations must be serialized across tabs and alarms");
  assert.match(backgroundSource, /carePoints: 0/, "care awards need a durable points bucket");
  assert.match(popupHtml, /id="carePoints"/, "the popup must account for care points shown in the total");
  assert.match(popupSource, /\$\("carePoints"\)\.textContent = p\.carePoints/, "the popup must render the care points bucket");
  assert.match(backgroundSource, /function isPrivateOrLocalSiteHost[\s\S]*siteAccessDescriptor/, "private/local hosts need a fail-closed site gate");
  assert.match(popupHtml, /role="tablist"[^>]*aria-orientation="horizontal"/, "the popup tablist needs an orientation");
  assert.match(popupHtml, /id="evoProgress"[^>]*role="progressbar"[^>]*aria-valuenow="0"/, "evolution progress needs accessible value semantics");

  const ids = [...popupHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "popup element IDs must be unique");
  assert.doesNotMatch(popupHtml, /\son[a-z]+\s*=/i, "popup markup must not use inline event handlers");
  for (const link of popupHtml.match(/<a\b[^>]*>/g) || []) {
    assert.match(link, /href="https:\/\/app\.myaipet\.ai\//, `popup link must stay first-party HTTPS: ${link}`);
    if (/target="_blank"/.test(link)) assert.match(link, /rel="noopener noreferrer"/, `new-tab link needs rel isolation: ${link}`);
  }

  const tabs = [...popupHtml.matchAll(/<button\b[^>]*role="tab"[^>]*aria-controls="([^"]+)"[^>]*>/g)];
  assert.equal(tabs.length, 6, "all six popup sections need operable tabs");
  for (const [, panelId] of tabs) {
    assert.match(popupHtml, new RegExp(`id="${panelId}"[^>]*role="tabpanel"`), `missing tab panel: ${panelId}`);
  }
  const inactivePanels = [...popupHtml.matchAll(/<div\b[^>]*class="tab-content"[^>]*role="tabpanel"[^>]*>/g)];
  assert.equal(inactivePanels.length, 5, "only one tab panel should be active initially");
  assert.ok(inactivePanels.every(([tag]) => /\bhidden\b/.test(tag)), "inactive tab panels must be hidden from assistive technology");

  const palette = Object.fromEntries(
    [...popupHtml.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(([, name, value]) => [name, value]),
  );
  const luminance = (hex) => {
    const channels = hex.match(/[0-9A-Fa-f]{2}/g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const [foreground, background] of [
    [palette.terracotta, palette.paper],
    [palette.muted, palette.paper],
    [palette.muted, palette.field],
    [palette["muted-soft"], palette.paper],
  ]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must meet WCAG AA text contrast`);
  }

  const popupButtons = popupHtml.match(/<button\b[^>]*>/g) || [];
  for (const tag of popupButtons) {
    assert.match(tag, /\btype="button"/, `popup button lacks explicit type: ${tag}`);
  }
  assert.equal(popupButtons.length, 26, "popup button inventory changed; audit every added or removed control");
  for (const match of popupHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1];
    const visibleText = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(visibleText || /\baria-label="[^"]+"/.test(attrs), `popup button lacks an accessible name: ${match[0]}`);
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    if (id && !/\bclass="[^"]*\b(?:tab|toggle)\b/.test(attrs)) {
      assert.match(popupSource, new RegExp(`\\$\\("${id}"\\)\\??\\.addEventListener|\\$\\("${id}"\\)\\.addEventListener`), `popup button has no direct handler: ${id}`);
    }
  }

  const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
  for (const file of ["manifest.json", "background.js", "content.js", "popup.html", "popup.js", "styles.css"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(extensionDir, file), "utf8"), hangul, `${file} contains Korean text`);
  }
}

runBehaviorContract()
  .then(runActivityConcurrencyContract)
  .then(() => {
    runStaticContract();
    console.log("PetClaw site-access contract passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
