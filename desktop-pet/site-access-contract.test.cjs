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
  const clone = (value) => JSON.parse(JSON.stringify(value));
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
  vm.runInContext(backgroundSource.slice(start, end), activityContext, { filename: backgroundPath });
  activityContext.__awards = Array.from({ length: 50 }, (_, index) => index);
  await vm.runInContext(
    'Promise.all(__awards.map((index) => addPoints("care", 1, `race-${index}`)))',
    activityContext,
  );
  assert.equal(activityState.petPoints.totalPoints, 50, "concurrent awards must preserve the total");
  assert.equal(activityState.petPoints.carePoints, 50, "concurrent care awards must preserve their category total");
  assert.equal(activityState.petEvolution.xp, 50, "concurrent awards must preserve evolution XP");
}

function runStaticContract() {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number(manifest.minimum_chrome_version) >= 102, "trusted-only storage access requires Chrome 102+");
  assert.equal(manifest.content_scripts, undefined, "no static all-site injection");
  assert.deepEqual(manifest.host_permissions, ["https://app.myaipet.ai/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("tabs"), "persistent tabs access is unnecessary");

  const popupSource = fs.readFileSync(path.join(extensionDir, "popup.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(extensionDir, "popup.html"), "utf8");
  const contentSource = fs.readFileSync(path.join(extensionDir, "content.js"), "utf8");
  assert.match(popupSource, /siteAccessBtn[\s\S]*chrome\.permissions\.request/, "permission request must follow the site-access user action");
  assert.doesNotMatch(backgroundSource, /chrome\.permissions\.request/, "service worker must not prompt outside a direct user gesture");
  assert.match(backgroundSource, /sender\.tab[\s\S]*Promise\.all\(\[siteAccessInfo\(senderUrl\), getConfig\(\)\]\)/, "page messages require active-site and runtime-policy authorization");
  assert.match(backgroundSource, /const PAGE_MESSAGE_TYPES = new Set[\s\S]*sender\.tab && !PAGE_MESSAGE_TYPES\.has/, "page contexts need a narrow message allowlist");
  assert.match(backgroundSource, /const API_URL = "https:\/\/app\.myaipet\.ai"[\s\S]*const url = `\$\{API_URL\}\$\{endpoint\}`/, "API requests must use the pinned first-party origin");
  assert.match(contentSource, /globalThis\[INSTANCE_KEY\][\s\S]*before any await/, "content script must claim its document synchronously");
  assert.match(contentSource, /function shutdown\(\)[\s\S]*cancelAnimationFrame[\s\S]*removeListener[\s\S]*extensionHost\.remove/, "permission removal must tear down page observers and timers");
  assert.match(contentSource, /PAGE_SUMMARY_MAX_CHARS = 1_500[\s\S]*Preview up to 1,500 characters/, "summary preview and transport limits must agree");
  assert.match(contentSource, /id="aipet-body" role="button" tabindex="0"[\s\S]*event\.key === "ContextMenu"/, "page companion must be keyboard operable");
  assert.match(popupHtml, /id="siteAccessBtn"[^>]*aria-describedby="siteAccessStatus"/, "site access control needs its status description");
  assert.match(popupHtml, /id="disconnectBtn"/, "pairing needs an explicit local disconnect action");
  assert.match(popupSource, /disconnectBtn[\s\S]*authToken: ""[\s\S]*petId: null/, "disconnect must clear the local credential and pet binding");
  assert.match(backgroundSource, /let activityMutationTail = Promise\.resolve\(\)[\s\S]*function withActivityMutation[\s\S]*async function addPoints[\s\S]*withActivityMutation/, "points/evolution mutations must be serialized across tabs and alarms");
  assert.match(backgroundSource, /carePoints: 0/, "care awards need a durable points bucket");
  assert.match(popupHtml, /id="carePoints"/, "the popup must account for care points shown in the total");
  assert.match(popupSource, /\$\("carePoints"\)\.textContent = p\.carePoints/, "the popup must render the care points bucket");

  for (const tag of popupHtml.match(/<button\b[^>]*>/g) || []) {
    assert.match(tag, /\btype="button"/, `popup button lacks explicit type: ${tag}`);
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
