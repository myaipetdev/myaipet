/**
 * MY AI PET — Background Service Worker
 * Handles API, emotions, evolution, points, notifications, mini-game
 */

// ══════════════════════════════════════
// ── CONFIG ──
// ══════════════════════════════════════

const API_URL = "https://app.myaipet.ai";
const EXTENSION_TOKEN_PATTERN = /^pex_[A-Za-z0-9_-]{32,128}$/;
const API_TIMEOUT_MS = 20_000;
const PAGE_SUMMARY_MAX_CHARS = 1_500;
const PAGE_SUMMARY_MAX_BYTES = 2_800;

const DEFAULT_CONFIG = {
  apiUrl: API_URL,
  authToken: "",        // pex_ extension token only (30-day, route-scoped)
  syncEnabled: true,    // pull live pet stats from server when authToken is set
  petId: null,
  petName: "Demo Pet",   // local-only demo until an extension token links the owner's pet
  petEmoji: "\uD83D\uDC3E",
  avatarUrl: "",
  personality: "playful",
  level: 1,
  autoTalkInterval: 90,
  enabled: true,
  pausedHosts: [],
  preferences: {
    notifications: true,
    particles: true,
    autoTalk: false,
    pageAwareness: false,
    sound: false,
  },
};

const SITE_SCRIPT_PREFIX = "petclaw-site-";
const BLOCKED_SITE_DOMAINS = [
  "myaipet.ai", "app.myaipet.ai", "paypal.com", "accounts.google.com",
  "mail.google.com", "outlook.live.com", "outlook.office.com", "icloud.com",
  "login.microsoftonline.com", "account.microsoft.com", "login.live.com",
  "appleid.apple.com", "idmsa.apple.com", "login.yahoo.com", "mail.yahoo.com",
  "proton.me", "protonmail.com", "fastmail.com",
  "atlassian.net", "1password.com", "lastpass.com", "bitwarden.com",
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com",
  "citibank.com", "capitalone.com", "usbank.com", "americanexpress.com",
  "discover.com", "fidelity.com", "schwab.com", "vanguard.com",
  "robinhood.com", "coinbase.com", "binance.com", "kraken.com", "upbit.com",
  "metamask.io", "phantom.app", "ledger.com", "trezor.io", "walletconnect.com",
  "safe.global", "stripe.com", "wise.com", "revolut.com",
  "bithumb.com", "kbstar.com", "shinhan.com", "shinhancard.com", "wooribank.com",
  "kebhana.com", "hanabank.com", "nonghyup.com", "kakaobank.com", "tossbank.com",
  "ibk.co.kr",
];

function normalizeSiteHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.+$/, "");
}

function siteAccessDescriptor(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "")); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = normalizeSiteHost(parsed.hostname);
  if (!host || host.includes("*") || BLOCKED_SITE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return null;
  }
  const pattern = `${parsed.protocol}//${host}/*`;
  let hash = 2166136261;
  for (const char of pattern) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return { host, pattern, scriptId: `${SITE_SCRIPT_PREFIX}${(hash >>> 0).toString(16)}` };
}

function siteDescriptorFromPattern(pattern) {
  const value = String(pattern || "");
  if (!value.endsWith("/*")) return null;
  return siteAccessDescriptor(value.slice(0, -1));
}

function siteHostFromPattern(pattern) {
  const value = String(pattern || "");
  if (!value.endsWith("/*")) return null;
  try {
    const parsed = new URL(value.slice(0, -1));
    const host = normalizeSiteHost(parsed.hostname);
    return ['http:', 'https:'].includes(parsed.protocol) && host && !host.includes("*") ? host : null;
  } catch {
    return null;
  }
}

function registrationMatchesDescriptor(script, descriptor) {
  return Boolean(
    script && descriptor &&
    script.id === descriptor.scriptId &&
    Array.isArray(script.matches) && script.matches.length === 1 && script.matches[0] === descriptor.pattern &&
    Array.isArray(script.js) && script.js.length === 1 && script.js[0] === "content.js" &&
    (!script.runAt || script.runAt === "document_idle") &&
    script.allFrames !== true &&
    (!script.world || script.world === "ISOLATED")
  );
}

async function registeredSiteScript(descriptor) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [descriptor.scriptId] });
  return scripts.find((script) => registrationMatchesDescriptor(script, descriptor)) || null;
}

async function siteAccessInfo(rawUrl) {
  const descriptor = siteAccessDescriptor(rawUrl);
  if (!descriptor) return { supported: false, granted: false, active: false };
  const [granted, registered] = await Promise.all([
    chrome.permissions.contains({ origins: [descriptor.pattern] }),
    registeredSiteScript(descriptor),
  ]);
  return {
    supported: true,
    granted,
    active: Boolean(granted && registered),
    host: descriptor.host,
    pattern: descriptor.pattern,
  };
}

async function registerSiteAccess(rawUrl, tabId) {
  const descriptor = siteAccessDescriptor(rawUrl);
  if (!descriptor) return { success: false, error: "This site is not supported" };
  if (!await chrome.permissions.contains({ origins: [descriptor.pattern] })) {
    return { success: false, error: "Site permission was not granted" };
  }
  if (!Number.isInteger(tabId)) {
    await chrome.permissions.remove({ origins: [descriptor.pattern] }).catch(() => false);
    return { success: false, error: "The selected tab is unavailable" };
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const currentDescriptor = siteAccessDescriptor(tab?.url);
  if (!currentDescriptor || currentDescriptor.pattern !== descriptor.pattern) {
    await chrome.permissions.remove({ origins: [descriptor.pattern] }).catch(() => false);
    return { success: false, error: "The selected tab changed before access was activated" };
  }

  let registered = await registeredSiteScript(descriptor);
  if (!registered) {
    const conflicting = await chrome.scripting.getRegisteredContentScripts({ ids: [descriptor.scriptId] });
    if (conflicting.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [descriptor.scriptId] });
    }
    try {
      await chrome.scripting.registerContentScripts([{
        id: descriptor.scriptId,
        matches: [descriptor.pattern],
        js: ["content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]);
    } catch {
      // Two popup windows can race. Treat an exact registration created by the
      // other request as success, but never accept a conflicting registration.
      registered = await registeredSiteScript(descriptor);
      if (!registered) {
        await chrome.permissions.remove({ origins: [descriptor.pattern] }).catch(() => false);
        return { success: false, error: "Website access could not be registered" };
      }
    }
  }

  if (!await chrome.permissions.contains({ origins: [descriptor.pattern] })) {
    await chrome.scripting.unregisterContentScripts({ ids: [descriptor.scriptId] }).catch(() => {});
    return { success: false, error: "Site permission was removed before activation finished" };
  }

  let injected = false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"], world: "ISOLATED" });
    injected = true;
  } catch {
    // The persistent registration is still valid for the next load. A tab can
    // close or navigate between the validation above and this best-effort call.
  }
  return {
    success: true,
    granted: true,
    active: true,
    injected,
    reloadRequired: !injected,
    host: descriptor.host,
  };
}

async function broadcastSiteDisabled(host, all = false) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.all(tabs.map((tab) => Number.isInteger(tab.id)
    ? chrome.tabs.sendMessage(tab.id, { type: "disableForSite", host, all }).catch(() => {})
    : Promise.resolve()));
}

async function removeSiteAccess(rawUrl) {
  const descriptor = siteAccessDescriptor(rawUrl);
  if (!descriptor) return { success: false, error: "This site is not supported" };
  const removed = await chrome.permissions.remove({ origins: [descriptor.pattern] });
  const stillGranted = await chrome.permissions.contains({ origins: [descriptor.pattern] });
  if (!removed || stillGranted) {
    return {
      success: false,
      granted: true,
      active: Boolean(await registeredSiteScript(descriptor)),
      host: descriptor.host,
      error: "Chrome still grants site access. Remove it from the extension's Site access settings.",
    };
  }
  await chrome.scripting.unregisterContentScripts({ ids: [descriptor.scriptId] }).catch(() => {});
  await getConfig().then(async (config) => {
    const pausedHosts = Array.isArray(config.pausedHosts) ? config.pausedHosts : [];
    if (pausedHosts.includes(descriptor.host)) {
      await saveConfig({ ...config, pausedHosts: pausedHosts.filter((host) => host !== descriptor.host) });
    }
  }).catch(() => {});
  // Chrome explicitly documents that unregistering a dynamic content script
  // does not remove code already injected into open pages.
  await broadcastSiteDisabled(descriptor.host);
  return { success: true, granted: false, active: false, host: descriptor.host };
}

async function reconcileSiteRegistrations() {
  const scripts = await chrome.scripting.getRegisteredContentScripts().catch(() => []);
  for (const script of scripts.filter((entry) => entry.id.startsWith(SITE_SCRIPT_PREFIX))) {
    const origins = Array.isArray(script.matches) ? script.matches : [];
    const descriptor = origins.length === 1 ? siteDescriptorFromPattern(origins[0]) : null;
    if (
      !descriptor ||
      !registrationMatchesDescriptor(script, descriptor) ||
      !await chrome.permissions.contains({ origins: [descriptor.pattern] })
    ) {
      await chrome.scripting.unregisterContentScripts({ ids: [script.id] }).catch(() => {});
      const host = origins.length === 1 ? siteHostFromPattern(origins[0]) : null;
      if (host) await broadcastSiteDisabled(host);
      // Invalid or newly blocked PetClaw registrations must not leave dormant
      // host access behind. Required first-party access simply returns false.
      if (origins.length === 1 && host) {
        await chrome.permissions.remove({ origins }).catch(() => false);
      }
    }
  }
}

async function deactivateRemovedOrigins(origins) {
  let disableAll = false;
  const hosts = new Set();
  for (const origin of Array.isArray(origins) ? origins : []) {
    if (/^https?:\/\/\*\/\*$/.test(String(origin))) {
      disableAll = true;
      break;
    }
    const host = siteHostFromPattern(origin);
    if (host) hosts.add(host);
  }
  if (disableAll) {
    await broadcastSiteDisabled("", true);
    return;
  }
  for (const host of hosts) await broadcastSiteDisabled(host);
}

async function getConfig() {
  const result = await chrome.storage.local.get("petConfig");
  let stored = result.petConfig || {};
  let changed = false;
  // Old builds allowed a custom API server. Extension tokens must never be sent
  // anywhere except the first-party origin, even when a user has separately
  // granted optional website access to that host.
  if (stored.apiUrl !== API_URL) {
    stored = { ...stored, apiUrl: API_URL };
    changed = true;
  }
  // Long-lived CLI tokens were accepted by early builds. Revoke that local
  // compatibility path: the extension now accepts only short-lived pex_ tokens.
  if (stored.authToken && !EXTENSION_TOKEN_PATTERN.test(String(stored.authToken))) {
    stored = { ...stored, authToken: "", needsPairing: true, petId: null };
    changed = true;
  }
  if (changed) await chrome.storage.local.set({ petConfig: stored });
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    preferences: { ...DEFAULT_CONFIG.preferences, ...(stored.preferences || {}) },
  };
}

function contentSafeConfig(config) {
  return {
    petName: config.petName,
    petEmoji: config.petEmoji,
    avatarUrl: config.avatarUrl,
    personality: config.personality,
    level: config.level,
    enabled: config.enabled,
    pausedHosts: config.pausedHosts,
    preferences: config.preferences,
    paired: Boolean(config.authToken && config.petId && !config.needsPairing),
  };
}

async function saveConfig(config) {
  const current = await getConfig();
  const requested = config && typeof config === "object" ? config : {};
  const merged = { ...current, ...requested, apiUrl: API_URL };
  if (merged.authToken && !EXTENSION_TOKEN_PATTERN.test(String(merged.authToken))) {
    merged.authToken = "";
    merged.petId = null;
    merged.needsPairing = true;
  }
  merged.preferences = { ...DEFAULT_CONFIG.preferences, ...(current.preferences || {}), ...(requested.preferences || {}) };
  await chrome.storage.local.set({ petConfig: merged });
}

// Calendar-day features should follow the user's local day, not UTC (which
// rolled quests/streaks at 09:00 in Korea/Japan).
function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ══════════════════════════════════════
// ── API ──
// ══════════════════════════════════════

async function callPetClawAPI(endpoint, options = {}) {
  const config = await getConfig();
  if (typeof endpoint !== "string" || !endpoint.startsWith("/api/")) return null;
  const url = `${API_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (config.authToken) headers["Authorization"] = `Bearer ${config.authToken}`;
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("[AI Pet] API error:", e.message);
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

// Protected owner media deliberately rejects unauthenticated page requests.
// Fetch it inside the trusted service worker with the short-lived extension
// token, validate the response, then hand content scripts an isolated data URL.
// This avoids putting an auth token in a query string or exposing it to a host
// page through an <img> request.
async function fetchProtectedAvatar(url, config) {
  if (!url) return "";
  let parsed;
  try {
    parsed = new URL(url, config.apiUrl);
  } catch {
    return "";
  }
  const apiOrigin = new URL(config.apiUrl).origin;
  if (parsed.origin !== apiOrigin || !/^\/(uploads|api\/media)\//.test(parsed.pathname)) {
    return parsed.protocol === "https:" ? parsed.href : "";
  }
  try {
    const res = await fetch(parsed.href, {
      headers: { Authorization: `Bearer ${config.authToken}` },
      cache: "no-store",
    });
    const type = (res.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
    const length = Number(res.headers.get("content-length") || 0);
    if (!res.ok || !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(type)) return "";
    if (length > 2 * 1024 * 1024) return "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 2 * 1024 * 1024) return "";
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch (error) {
    console.warn("[AI Pet] Could not load protected avatar:", error?.message || error);
    return "";
  }
}

// Ambient-care engagement → the account's season recognition score. We send ONLY
// the action name; the SERVER decides the grant and enforces the daily cap
// (/api/petclaw/engagement). Never sends an amount → nothing to farm client-side.
// Only signed-in owners feed the season; offline/local play still earns the
// extension's own local points via addPoints(). Returns granted season pts or null.
async function postEngagement(action) {
  const config = await getConfig();
  if (!config.authToken) return null;
  const res = await callPetClawAPI("/api/petclaw/engagement", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return res && typeof res.points === "number" ? res.points : null;
}

// ══════════════════════════════════════
// ── SERVER SYNC ──
// Map web app pet stats → extension emotion schema, when authenticated.
// Web pet:   happiness, energy, hunger, bond_level
// Extension: happiness, energy, hunger, affection, curiosity
// ══════════════════════════════════════
async function syncFromServer() {
  const config = await getConfig();
  if (!config.syncEnabled || !config.authToken || !config.petId) return null;
  const pet = await callPetClawAPI(`/api/pets/${config.petId}`);
  if (!pet || pet.error) return null;

  const current = await getEmotions();
  const synced = {
    ...current,
    happiness: typeof pet.happiness === "number" ? pet.happiness : current.happiness,
    energy:    typeof pet.energy === "number"    ? pet.energy    : current.energy,
    hunger:    typeof pet.hunger === "number"    ? pet.hunger    : current.hunger,
    affection: typeof pet.bond_level === "number" ? pet.bond_level : current.affection,
    // curiosity stays local-derived (no server field) but decays via decayEmotions()
    serverSyncedAt: Date.now(),
    serverPetName: pet.name,
    serverPetLevel: pet.level,
  };
  await saveEmotions(synced);
  return synced;
}

// ══════════════════════════════════════
// ── EMOTIONS ENGINE ──
// ══════════════════════════════════════

const EMOTIONS_KEY = "petEmotions";

const EMOTION_STATES = [
  { name: "Ecstatic", emoji: "🤩", condition: (e) => e.happiness > 90 && e.energy > 70 },
  { name: "Happy", emoji: "😊", condition: (e) => e.happiness > 60 },
  { name: "Playful", emoji: "😜", condition: (e) => e.energy > 80 && e.happiness > 50 },
  { name: "Curious", emoji: "🤔", condition: (e) => e.curiosity > 70 },
  { name: "Sleepy", emoji: "😴", condition: (e) => e.energy < 20 },
  { name: "Hungry", emoji: "🥺", condition: (e) => e.hunger > 70 },
  { name: "Lonely", emoji: "😢", condition: (e) => e.affection < 20 && e.happiness < 40 },
  { name: "Bored", emoji: "😐", condition: (e) => e.curiosity < 20 && e.energy > 40 },
  { name: "Sad", emoji: "😞", condition: (e) => e.happiness < 25 },
  { name: "Neutral", emoji: "😊", condition: () => true },
];

async function getEmotions() {
  const result = await chrome.storage.local.get(EMOTIONS_KEY);
  return {
    happiness: 70,
    energy: 60,
    hunger: 30,
    affection: 60,
    curiosity: 50,
    lastUpdate: Date.now(),
    ...(result[EMOTIONS_KEY] || {}),
  };
}

async function saveEmotions(emotions) {
  emotions.lastUpdate = Date.now();
  await chrome.storage.local.set({ [EMOTIONS_KEY]: emotions });
}

// Track the set of distinct moods the pet has shown, so the "Mood Ring"
// achievement (see 5+ different emotions) is actually reachable. Previously
// _emotionsSeen was read but never written, so it could never unlock.
async function recordEmotionSeen(name) {
  if (!name) return;
  const points = await getPoints();
  const seen = Array.isArray(points._emotionSet) ? points._emotionSet : [];
  if (!seen.includes(name)) {
    seen.push(name);
    points._emotionSet = seen;
    points._emotionsSeen = seen.length;
    await chrome.storage.local.set({ [POINTS_KEY]: points });
  }
}

function getDominantEmotion(emotions) {
  for (const state of EMOTION_STATES) {
    if (state.condition(emotions)) {
      return {
        emoji: state.emoji,
        name: state.name,
        desc: getEmotionDescription(state.name),
      };
    }
  }
  return { emoji: "😊", name: "Neutral", desc: "Your pet is doing fine." };
}

function getEmotionDescription(name) {
  const descs = {
    Ecstatic: "Over the moon! Everything is amazing!",
    Happy: "Your pet is feeling great!",
    Playful: "Full of energy and ready to play!",
    Curious: "Wondering about everything around...",
    Sleepy: "Needs some rest... zzz",
    Hungry: "Could really use a treat right now...",
    Lonely: "Missing your attention...",
    Bored: "Looking for something fun to do...",
    Sad: "Feeling a bit down today...",
    Neutral: "Your pet is doing fine.",
  };
  return descs[name] || "Your pet exists.";
}

async function decayEmotions() {
  const e = await getEmotions();
  const elapsed = (Date.now() - e.lastUpdate) / 60000; // minutes
  if (elapsed < 1) return e;

  const decay = Math.min(elapsed * 0.3, 15);
  e.happiness = Math.max(5, e.happiness - decay * 0.2);
  e.energy = Math.max(5, e.energy - decay * 0.3);
  e.hunger = Math.min(100, e.hunger + decay * 0.4);
  e.affection = Math.max(5, e.affection - decay * 0.15);
  e.curiosity = Math.max(10, e.curiosity - decay * 0.1);

  await saveEmotions(e);
  return e;
}

async function applyEmotionAction(action) {
  if (!["feed", "play", "pet"].includes(action)) {
    throw new Error("Unsupported emotion action");
  }
  const e = await getEmotions();
  switch (action) {
    case "feed":
      e.hunger = Math.max(0, e.hunger - 30);
      e.happiness = Math.min(100, e.happiness + 10);
      e.energy = Math.min(100, e.energy + 5);
      break;
    case "play":
      e.happiness = Math.min(100, e.happiness + 15);
      e.energy = Math.max(0, e.energy - 15);
      e.curiosity = Math.min(100, e.curiosity + 10);
      e.affection = Math.min(100, e.affection + 5);
      break;
    case "pet":
      e.affection = Math.min(100, e.affection + 20);
      e.happiness = Math.min(100, e.happiness + 10);
      e.curiosity = Math.min(100, e.curiosity + 5);
      break;
  }
  await saveEmotions(e);
  await addPoints("skill", 1, `${action} interaction`);
  await progressQuest(action);
  await checkAchievements();
  return e;
}

// ══════════════════════════════════════
// ── EVOLUTION SYSTEM ──
// ══════════════════════════════════════

const EVOLUTION_KEY = "petEvolution";

const EVO_THRESHOLDS = [0, 100, 500, 1500, 5000, 15000];

// Chrome can deliver messages and alarms close together. Serialize every
// local Points/Evolution read-modify-write so two allowed tabs cannot overwrite
// each other's award. The tail recovers after errors so one failed write never
// wedges future activity.
let activityMutationTail = Promise.resolve();

function withActivityMutation(task) {
  const operation = activityMutationTail.then(task, task);
  activityMutationTail = operation.then(() => undefined, () => undefined);
  return operation;
}

async function getEvolution() {
  const result = await chrome.storage.local.get(EVOLUTION_KEY);
  return { stage: 0, xp: 0, ...(result[EVOLUTION_KEY] || {}) };
}

async function saveEvolution(evo) {
  await chrome.storage.local.set({ [EVOLUTION_KEY]: evo });
}

async function addEvolutionXP(amount, reason) {
  const { evo, evolved } = await withActivityMutation(async () => {
    const next = await getEvolution();
    next.xp += amount;

    let didEvolve = false;
    while (next.stage < EVO_THRESHOLDS.length - 1 && next.xp >= EVO_THRESHOLDS[next.stage + 1]) {
      next.stage++;
      didEvolve = true;
    }

    await saveEvolution(next);
    return { evo: next, evolved: didEvolve };
  });

  if (evolved) {
    const stageNames = ["Egg", "Baby", "Young", "Adult", "Elder", "Legendary"];
    const stageIcons = ["🥚", "🐣", "🐾", "⚡", "🔥", "👑"];
    await addNotification(
      stageIcons[evo.stage],
      `Evolved to ${stageNames[evo.stage]}! 🎉`
    );
    await addPoints("evolution", 50, `evolved to ${stageNames[evo.stage]}`);

    // Notify content scripts — broadcast to ALL tabs so every open pet shows the
    // new stage/aura, not just the focused one (others would lag until their 60s sync).
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, {
            type: "evolved",
            stage: evo.stage,
            name: stageNames[evo.stage],
            icon: stageIcons[evo.stage],
          });
        } catch {}
      }
    }

    // Chrome notification
    const config = await getConfig();
    if (config.preferences?.notifications !== false) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: `${config.petName} evolved!`,
        message: `Your pet evolved to ${stageNames[evo.stage]}! Keep going!`,
      });
    }
  }

  return evo;
}

// ══════════════════════════════════════
// ── NOTIFICATIONS ──
// ══════════════════════════════════════

const NOTIF_KEY = "petNotifications";

async function getNotifications() {
  const result = await chrome.storage.local.get(NOTIF_KEY);
  return result[NOTIF_KEY] || [];
}

async function addNotification(icon, text) {
  const notifs = await getNotifications();
  const now = new Date();
  const time = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
  notifs.push({ icon, text, time, ts: Date.now() });

  // Keep last 50
  while (notifs.length > 50) notifs.shift();
  await chrome.storage.local.set({ [NOTIF_KEY]: notifs });
}

// ══════════════════════════════════════
// ── POINTS SYSTEM ──
// ══════════════════════════════════════

const POINTS_KEY = "petPoints";

async function getPoints() {
  const result = await chrome.storage.local.get(POINTS_KEY);
  return {
    totalPoints: 0,
    chatPoints: 0,
    heartbeatPoints: 0,
    skillPoints: 0,
    browsingPoints: 0,
    gamePoints: 0,
    evolutionPoints: 0,
    carePoints: 0,
    chatCount: 0,
    skillCount: 0,
    heartbeatCount: 0,
    dailyStreak: 0,
    lastHeartbeat: null,
    lastDaily: null,
    ...(result[POINTS_KEY] || {}),
  };
}

async function addPoints(category, amount, reason) {
  const { points, awardedAmount } = await withActivityMutation(async () => {
    const next = await getPoints();
    const evo = await getEvolution();

    // Legend bonus: 2x multiplier
    const adjusted = evo.stage >= 5 ? amount * 2 : amount;
    next.totalPoints += adjusted;
    next[category + "Points"] = (next[category + "Points"] || 0) + adjusted;

    if (category === "chat") next.chatCount = (next.chatCount || 0) + 1;
    if (category === "skill") next.skillCount = (next.skillCount || 0) + 1;
    if (category === "heartbeat") next.heartbeatCount = (next.heartbeatCount || 0) + 1;
    if (category === "care") next.careCount = (next.careCount || 0) + 1; // pet + treat + welcome

    await chrome.storage.local.set({ [POINTS_KEY]: next });
    return { points: next, awardedAmount: adjusted };
  });

  // XP from points
  await addEvolutionXP(Math.ceil(awardedAmount * 0.5), reason);

  console.log(`[AI Pet] +${awardedAmount} ${category} pts (${reason}). Total: ${points.totalPoints}`);
  return points;
}

// ══════════════════════════════════════
// ── GAME STATS ──
// ══════════════════════════════════════

const GAME_KEY = "petGameStats";

async function getGameStats() {
  const result = await chrome.storage.local.get(GAME_KEY);
  return { highScore: 0, highScoreMemory: 0, gamesPlayed: 0, ...(result[GAME_KEY] || {}) };
}

async function saveGameResult(score, game = "catcher") {
  const gameType = game === "memory" ? "memory" : "catcher";
  const maxScore = gameType === "memory" ? 100 : 1_000;
  const safeScore = Math.max(0, Math.min(maxScore, Math.floor(Number(score) || 0)));
  const awardedPoints = Math.floor(safeScore / 5);
  const stats = await getGameStats();
  stats.gamesPlayed++;
  const key = gameType === "memory" ? "highScoreMemory" : "highScore";
  if (safeScore > (stats[key] || 0)) stats[key] = safeScore;
  await chrome.storage.local.set({ [GAME_KEY]: stats });

  if (awardedPoints > 0) {
    await addPoints("game", awardedPoints, `${gameType} score ${safeScore}`);
    await addNotification("🎮", `${gameType === "memory" ? "Memory" : "Catcher"}: ${safeScore} pts, +${awardedPoints} Play Points`);
  }

  // Daily quests: playing a game counts toward game_1/game_2, and the score
  // quest jumps straight to the best score this run (target e.g. 50).
  await progressQuest("game");
  if (safeScore > 0) await progressQuest("score", safeScore);

  await checkAchievements();
  return { ...stats, score: safeScore, awardedPoints };
}

// ══════════════════════════════════════
// ── ACHIEVEMENTS ──
// ══════════════════════════════════════

const ACHIEVE_KEY = "petAchievements";

const ACHIEVEMENT_DEFS = [
  { id: "first_chat",     icon: "💬", name: "First Words",       desc: "Send your first chat",           check: (p) => p.chatCount >= 1 },
  { id: "chat_10",        icon: "🗣️", name: "Chatterbox",        desc: "Chat 10 times",                  check: (p) => p.chatCount >= 10 },
  { id: "chat_100",       icon: "📢", name: "Motor Mouth",       desc: "Chat 100 times",                 check: (p) => p.chatCount >= 100 },
  { id: "streak_3",       icon: "🔥", name: "On Fire",           desc: "3-day login streak",             check: (p) => p.dailyStreak >= 3 },
  { id: "streak_7",       icon: "🌟", name: "Dedicated",         desc: "7-day login streak",             check: (p) => p.dailyStreak >= 7 },
  { id: "streak_30",      icon: "👑", name: "Royalty",            desc: "30-day login streak",            check: (p) => p.dailyStreak >= 30 },
  { id: "points_100",     icon: "💰", name: "Pocket Change",     desc: "Earn 100 total points",          check: (p) => p.totalPoints >= 100 },
  { id: "points_1000",    icon: "💎", name: "Diamond Hands",     desc: "Earn 1,000 total points",        check: (p) => p.totalPoints >= 1000 },
  { id: "points_10000",   icon: "🏆", name: "Whale",             desc: "Earn 10,000 total points",       check: (p) => p.totalPoints >= 10000 },
  { id: "game_first",     icon: "🎮", name: "Gamer",             desc: "Play your first mini-game",      check: (_, g) => g.gamesPlayed >= 1 },
  { id: "game_10",        icon: "🕹️", name: "Arcade Rat",        desc: "Play 10 mini-games",             check: (_, g) => g.gamesPlayed >= 10 },
  { id: "game_highscore", icon: "⭐", name: "High Scorer",       desc: "Score 100+ in Treat Catcher",    check: (_, g) => g.highScore >= 100 },
  { id: "evo_baby",       icon: "🐣", name: "Hatched!",          desc: "Evolve to Baby",                 check: (_, __, e) => e.stage >= 1 },
  { id: "evo_teen",       icon: "⚡", name: "Growing Up",        desc: "Reach Adult",                    check: (_, __, e) => e.stage >= 3 },
  { id: "evo_legend",     icon: "👑", name: "Legendary",         desc: "Reach Legendary",                check: (_, __, e) => e.stage >= 5 },
  { id: "browse_60",      icon: "🌐", name: "Web Surfer",        desc: "Browse 60+ active minutes",      check: (_, __, ___, browseTicks) => browseTicks >= 60 },
  { id: "feed_pet",       icon: "🍖", name: "Good Owner",        desc: "Care for your pet 5 times",          check: (p) => (p.skillCount || 0) >= 5 },
  { id: "all_emotions",   icon: "🎭", name: "Mood Ring",         desc: "See 5+ different emotions",      check: (p) => (p._emotionsSeen || 0) >= 5 },
];

async function getAchievements() {
  const result = await chrome.storage.local.get(ACHIEVE_KEY);
  return result[ACHIEVE_KEY] || {};
}

async function checkAchievements() {
  const [points, gameStats, evo, current, browseState] = await Promise.all([
    getPoints(), getGameStats(), getEvolution(), getAchievements(), chrome.storage.local.get(BROWSE_KEY),
  ]);
  const browseTicks = Math.max(0, Number(browseState[BROWSE_KEY]) || 0);

  let newUnlocks = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (current[def.id]) continue;
    if (def.check(points, gameStats, evo, browseTicks)) {
      current[def.id] = { unlockedAt: Date.now() };
      newUnlocks.push(def);
    }
  }

  if (newUnlocks.length > 0) {
    await chrome.storage.local.set({ [ACHIEVE_KEY]: current });
    for (const a of newUnlocks) {
      await addNotification(a.icon, `Achievement: ${a.name}!`);
      await addPoints("skill", 10, `achievement: ${a.name}`);

      const config = await getConfig();
      if (config.preferences?.notifications !== false) {
        chrome.notifications.create(`achieve-${a.id}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: `${a.icon} Achievement Unlocked!`,
          message: `${a.name} — ${a.desc}`,
        });
      }
    }
  }

  return { achievements: current, defs: ACHIEVEMENT_DEFS };
}

// ══════════════════════════════════════
// ── DAILY QUESTS ──
// ══════════════════════════════════════

const QUEST_KEY = "petDailyQuests";

const QUEST_POOL = [
  { id: "chat_3",    icon: "💬", name: "Social Butterfly",   desc: "Chat 3 times",          target: 3,  category: "chat",    reward: 15 },
  { id: "chat_5",    icon: "🗣️", name: "Chatty",             desc: "Chat 5 times",          target: 5,  category: "chat",    reward: 25 },
  { id: "feed_2",    icon: "🍖", name: "Pet Chef",           desc: "Feed your pet twice",   target: 2,  category: "feed",    reward: 10 },
  { id: "play_2",    icon: "🎾", name: "Play Date",          desc: "Play with pet twice",   target: 2,  category: "play",    reward: 10 },
  { id: "pet_3",     icon: "💕", name: "Love Bomb",          desc: "Pet 3 times",           target: 3,  category: "pet",     reward: 10 },
  { id: "game_1",    icon: "🎮", name: "Arcade Visit",       desc: "Play a mini-game",      target: 1,  category: "game",    reward: 10 },
  { id: "game_2",    icon: "🕹️", name: "Arcade Pro",         desc: "Play 2 mini-games",     target: 2,  category: "game",    reward: 20 },
  { id: "browse_30", icon: "🌐", name: "Web Walker",         desc: "Browse 30 minutes",     target: 30, category: "browse",  reward: 15 },
  { id: "score_50",  icon: "⭐", name: "Score Hunter",       desc: "Score 50+ in a game",   target: 50, category: "score",   reward: 20 },
  { id: "all_3",     icon: "🌈", name: "Triple Threat",      desc: "Chat, feed, and play",  target: 3,  category: "combo",   reward: 30 },
];

function pickDailyQuests(seed) {
  const shuffled = [...QUEST_POOL];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

async function getDailyQuests() {
  const result = await chrome.storage.local.get(QUEST_KEY);
  const data = result[QUEST_KEY] || {};
  const today = localDayKey();

  if (data.date !== today) {
    const seed = parseInt(today.replace(/-/g, ""), 10);
    const quests = pickDailyQuests(seed).map((q) => ({
      ...q,
      progress: 0,
      completed: false,
      claimed: false,
    }));
    const fresh = { date: today, quests };
    await chrome.storage.local.set({ [QUEST_KEY]: fresh });
    return fresh;
  }

  return data;
}

async function progressQuest(category, amount = 1) {
  const data = await getDailyQuests();
  let updated = false;

  for (const q of data.quests) {
    if (q.claimed) continue;
    if (q.category === "combo" && ["chat", "feed", "play"].includes(category)) {
      // Distinct-action combo: progress = how many DIFFERENT actions done today.
      q.seen = Array.isArray(q.seen) ? q.seen : [];
      if (!q.seen.includes(category)) q.seen.push(category);
      q.progress = Math.min(q.target, q.seen.length);
      if (q.progress >= q.target && !q.completed) {
        q.completed = true;
        updated = true;
      }
    } else if (q.category === category) {
      q.progress = Math.min(q.target, (q.progress || 0) + amount);
      if (q.progress >= q.target && !q.completed) {
        q.completed = true;
        updated = true;
      }
    }
  }

  await chrome.storage.local.set({ [QUEST_KEY]: data });

  if (updated) {
    // Notify content script of quest completion
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id) {
        try { chrome.tabs.sendMessage(tab.id, { type: "questComplete" }); } catch {}
      }
    }
  }

  return data;
}

let questClaimQueue = Promise.resolve();

async function claimQuestRewardNow(questId) {
  const data = await getDailyQuests();
  const quest = data.quests.find((q) => q.id === questId);
  if (!quest || !quest.completed || quest.claimed) return { success: false };

  quest.claimed = true;
  await chrome.storage.local.set({ [QUEST_KEY]: data });
  await addPoints("skill", quest.reward, `quest: ${quest.name}`);
  await addNotification("✅", `Quest complete: ${quest.name}! +${quest.reward} pts`);
  await checkAchievements();

  return { success: true, reward: quest.reward };
}

function claimQuestReward(questId) {
  const next = questClaimQueue.then(
    () => claimQuestRewardNow(questId),
    () => claimQuestRewardNow(questId),
  );
  questClaimQueue = next.catch(() => {});
  return next;
}

// ══════════════════════════════════════
// ── CHAT ──
// ══════════════════════════════════════

function localDemoReply(message, dominant, config) {
  const input = String(message || "").toLowerCase();
  if (/hello|\bhi\b|hey/.test(input)) return `Hi! I'm ${config.petName || "your demo pet"}. Pair me in Settings when you want your real pet's memory.`;
  if (/how are you|mood|feel/.test(input)) return `${dominant.emoji} I'm feeling ${dominant.name.toLowerCase()}! This demo reply stays entirely on your device.`;
  if (/name|who are you/.test(input)) return `I'm ${config.petName || "Demo Pet"} — a local preview until you connect your own pet.`;
  if (/memory|remember/.test(input)) return "Demo mode does not read or write any pet memory. Pair your own pet when you're ready.";
  return "I'm in private demo mode, so this reply was made locally and nothing was sent. Pair your pet in Settings for full chat.";
}

function limitPageSummaryText(value) {
  const normalized = String(value || "").replace(/<\/?page_content/gi, "[page tag]").trim();
  const encoder = new TextEncoder();
  let output = "";
  let bytes = 0;
  let chars = 0;
  for (const char of normalized) {
    const charBytes = encoder.encode(char).byteLength;
    if (chars >= PAGE_SUMMARY_MAX_CHARS || bytes + charBytes > PAGE_SUMMARY_MAX_BYTES) break;
    output += char;
    bytes += charBytes;
    chars++;
  }
  return output;
}

async function chatWithPet(message) {
  const config = await getConfig();
  const emotions = await getEmotions();
  const dominant = getDominantEmotion(emotions);

  // Anonymous mode is fully local. It never touches pet 1, another owner's pet,
  // an LLM, quota, or persistent memory.
  if (!config.authToken || !config.petId) {
    const reply = localDemoReply(message, dominant, config);
    await addPoints("chat", 1, "local demo chat");
    await progressQuest("chat");
    await checkAchievements();
    return reply;
  }

  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId: "companion-chat",
      input: {
        message,
        mood: dominant.name.toLowerCase(),
        emotions: {
          happiness: Math.round(emotions.happiness),
          energy: Math.round(emotions.energy),
          hunger: Math.round(emotions.hunger),
        },
      },
    }),
  });

  if (result?.success && result.output?.reply) {
    // Chat boosts emotions
    const e = await getEmotions();
    e.happiness = Math.min(100, e.happiness + 3);
    e.affection = Math.min(100, e.affection + 2);
    e.curiosity = Math.min(100, e.curiosity + 1);
    await saveEmotions(e);

    await addPoints("chat", 3, "chat interaction");
    await progressQuest("chat");
    await checkAchievements();
    return result.output.reply;
  }

  // Fallback based on emotion
  const fallbacks = {
    playful: ["Hehe! Can't reach my brain right now~ 😜", "Oops, thoughts got tangled! 🧶"],
    brave: ["Connection issues, but I won't give up! 💪", "Signal's weak... but I'm here! ⚔️"],
    gentle: ["Oh, I seem a little lost... 🌿", "Sorry, can't quite hear you... 😊"],
    shy: ["U-um... can't connect... 😳", "S-sorry... link is down... 🙈"],
    lazy: ["Zzz... API's sleeping too... 😴", "Too tired to connect... 😪"],
  };

  await addPoints("chat", 1, "chat attempt (offline)");
  await progressQuest("chat");
  const pFallbacks = fallbacks[config.personality] || fallbacks.playful;
  return pFallbacks[Math.floor(Math.random() * pFallbacks.length)];
}

// ══════════════════════════════════════
// ── AUTONOMOUS BEHAVIOR ──
// ══════════════════════════════════════

async function summarizePage(title, text) {
  const config = await getConfig();
  if (!config.authToken || !config.petId) {
    return { error: "Connect your pet before sending page content." };
  }
  const pageText = limitPageSummaryText(text);
  if (!pageText) return { error: "There is no readable page text to summarize." };
  const safeTitle = String(title || "Untitled page")
    .replace(/[<>&\"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[ch]))
    .slice(0, 200);
  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId: "summarize-page",
      input: { message: `<page_content title="${safeTitle}">\n${pageText}\n</page_content>`, platform: "chrome-extension" },
    }),
  });
  if (result?.success && result.output?.reply) return { reply: result.output.reply };
  return { error: "The private page summary request failed. Nothing was added to pet memory." };
}

async function generateAutonomousMessage() {
  const emotions = await getEmotions();
  // Ambient talk is local: enabling it never consumes LLM quota or creates
  // artificial persistent memories.
  if (emotions.hunger > 70) return "🍖 I'm soooo hungry...";
  if (emotions.energy < 20) return "😴 *yawn* ... so sleepy...";
  if (emotions.affection < 25) return "🥺 Pay attention to me...";

  const autoMessages = [
    "🌟 Wow, look at that!",
    "💤 *yawn* ...still here though!",
    "🌸 Isn't today nice?",
    "👀 What are you working on?",
    "✨ I love being here with you!",
    "🌺 *does a little dance*",
    "😊 Hi there~",
  ];
  return autoMessages[Math.floor(Math.random() * autoMessages.length)];
}

// ══════════════════════════════════════
// ── SKILLS & EXPORT ──
// ══════════════════════════════════════

async function executeSkill(skillId, input = {}) {
  const config = await getConfig();
  if (!config.authToken || !config.petId) return { success: false, error: "Pair your pet first" };
  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId,
      input,
    }),
  });
  if (result?.success && result.output?.status !== "invoke_via_endpoint") {
    await addPoints("skill", 5, `skill: ${skillId}`);
  }
  return result;
}

async function fetchSkillsList() {
  const config = await getConfig();
  if (!config.authToken || !config.petId) return null;
  return await callPetClawAPI(`/api/petclaw/skills?petId=${config.petId}`);
}

async function exportSoul() {
  const config = await getConfig();
  if (!config.authToken || !config.petId) return null;
  return callPetClawAPI(`/api/petclaw/export?petId=${config.petId}`);
}

// Tick daily streak — called by content script on page load. Returns current
// streak and whether it just incremented today. Lets the pet say "Day N together!"
// at the right moment instead of waiting for a 5-min heartbeat.
let streakTickInFlight = null;

async function tickStreakNow() {
  const points = await getPoints();
  const today = localDayKey();
  let justIncremented = false;
  if (points.lastDaily !== today) {
    const yesterday = localDayKey(new Date(Date.now() - 86400000));
    if (points.lastDaily === yesterday) {
      points.dailyStreak = (points.dailyStreak || 0) + 1;
    } else {
      points.dailyStreak = 1;
    }
    points.lastDaily = today;
    justIncremented = true;
    await chrome.storage.local.set({ [POINTS_KEY]: points });
    // Award the daily-login + streak bonus HERE (was only in sendHeartbeat),
    // so it fires once per day regardless of whether a page load or the 5-min
    // heartbeat was the first trigger — previously a page load set lastDaily
    // first and the heartbeat skipped, losing the bonus.
    await addPoints("heartbeat", 10, "daily login bonus");
    await addNotification("📅", "Daily login bonus! +10 pts");
    const streakBonus = Math.min(points.dailyStreak * 2, 20);
    await addPoints("heartbeat", streakBonus, `${points.dailyStreak}-day streak bonus`);
    await addNotification("🔥", `${points.dailyStreak}-day streak! +${streakBonus} bonus`);
  }
  return { streak: points.dailyStreak || 1, justIncremented };
}

function tickStreak() {
  if (streakTickInFlight) return streakTickInFlight;
  streakTickInFlight = tickStreakNow().finally(() => {
    streakTickInFlight = null;
  });
  return streakTickInFlight;
}

// SCRUM-20: import a SOUL JSON exported from the app
async function importSoul(soul) {
  const config = await getConfig();
  if (!config.authToken) {
    return { success: false, error: "Pair the extension before importing SOUL data" };
  }
  if (!soul || typeof soul !== "object") {
    return { success: false, error: "Empty soul payload" };
  }
  // Server-side schema validation (zod) will catch malformed payloads
  const result = await callPetClawAPI("/api/petclaw/import", {
    method: "POST",
    body: JSON.stringify(soul),
  });
  if (!result) return { success: false, error: "Network or auth failure — set your auth token in Settings" };
  if (result.error) return { success: false, error: result.error };
  return {
    success: !!result.success,
    petName: result.message?.match(/"([^"]+)"/)?.[1] || soul.pet?.name,
    petId: result.petId,
  };
}

async function fetchPetInfo() {
  const config = await getConfig();

  // Only the authenticated owner endpoint (/api/pets) can tell which pet is
  // YOURS. Without a token we must NOT adopt a random stranger from the public
  // network directory — that was the "weird/random pet" bug. Surface a pairing
  // prompt instead so the user links their own pet via an extension token.
  if (!config.authToken) {
    const updated = { ...config, petId: null, needsPairing: true };
    await saveConfig(updated);
    return updated;
  }

  const data = await callPetClawAPI(`/api/pets`);
  const pets = (data && data.pets) || [];
  // Prefer the configured petId if it's actually one the owner holds, else the
  // most recent. Never fall back to a pet the user doesn't own.
  const pet = pets.find(p => p.id === config.petId) || pets[0];

  if (!pet) {
    // Token present but no pets returned (no pet yet, or token expired/invalid).
    const updated = { ...config, petId: null, needsPairing: true };
    await saveConfig(updated);
    return updated;
  }

  const updated = {
    ...config,
    needsPairing: false,
    petId: pet.id,
    petName: pet.name,
    petEmoji: ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"][pet.species] || "🐾",
    avatarUrl: await fetchProtectedAvatar(pet.avatar_url || "", config),
    personality: pet.personality_type || "playful",
    level: pet.level || 1,
  };
  await saveConfig(updated);
  return updated;
}

// ══════════════════════════════════════
// ── HEARTBEAT ──
// ══════════════════════════════════════

// Persisted across MV3 service-worker restarts — an in-memory counter never
// reached 10 minutes because the worker is killed every ~30s idle.
let browsingMinutes = 0;
const BROWSE_KEY = "petBrowseTicks";
const ACTIVITY_KEY = "petLastTrustedActivity";
const HUNGRY_NOTIF_KEY = "petHungryNotificationAt";

async function markUserActivity(tabId) {
  if (!Number.isInteger(tabId)) return;
  await chrome.storage.local.set({ [ACTIVITY_KEY]: { tabId, at: Date.now() } });
}

async function hasRecentUserActivity(tabId) {
  const result = await chrome.storage.local.get(ACTIVITY_KEY);
  const activity = result[ACTIVITY_KEY];
  return activity?.tabId === tabId && Date.now() - Number(activity.at || 0) <= 2 * 60_000;
}

async function sendHeartbeat() {
  const config = await getConfig();
  if (!config.enabled) return;

  // Maintenance only. Browser uptime is not proof of play, so this must never
  // mint server credits/EXP or local Play Points.
  await decayEmotions();

  // Daily streak + login/streak bonus is handled in tickStreak() (also fired on
  // page load), awarded exactly once per day by whichever trigger is first — no
  // duplicate increment/bonus here.
  await tickStreak();

  // Emotion warnings
  const emotions = await getEmotions();
  if (emotions.hunger > 80 && config.preferences?.notifications !== false) {
    const stored = await chrome.storage.local.get(HUNGRY_NOTIF_KEY);
    if (Date.now() - Number(stored[HUNGRY_NOTIF_KEY] || 0) >= 6 * 60 * 60_000) {
      await chrome.storage.local.set({ [HUNGRY_NOTIF_KEY]: Date.now() });
      chrome.notifications.create("pet-hungry", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: `${config.petName} is hungry!`,
        message: "Your pet needs food! Open the extension to feed them.",
      });
    }
  }
}

async function trackBrowsing() {
  const st = await chrome.storage.local.get(BROWSE_KEY);
  const ticks = Math.max(0, Number(st[BROWSE_KEY]) || 0) + 1;
  await chrome.storage.local.set({ [BROWSE_KEY]: ticks });
  browsingMinutes = ticks;
  if (ticks % 10 === 0) {
    await addPoints("browsing", 1, "10min active browsing");
  }
  await progressQuest("browse");
}

// ══════════════════════════════════════
// ── ALARMS ──
// ══════════════════════════════════════

chrome.alarms.create("petHeartbeat", { periodInMinutes: 5 });
chrome.alarms.create("petBrowsing", { periodInMinutes: 1 });
chrome.alarms.create("petEmotionDecay", { periodInMinutes: 10 });
chrome.alarms.create("petServerSync", { periodInMinutes: 3 });

// Auto-talk cadence is user-configurable (Settings → Behavior). Re-create the
// alarm from the saved config.autoTalkInterval (clamped 30–600s) so the input
// actually drives the timer instead of a hardcoded 2-minute period.
async function applyAutoTalkAlarm() {
  const config = await getConfig();
  if (config.preferences?.autoTalk !== true) {
    await chrome.alarms.clear("petAutoTalk");
    return;
  }
  const secs = Math.max(30, Math.min(600, Number(config.autoTalkInterval) || 90));
  await chrome.alarms.create("petAutoTalk", { periodInMinutes: secs / 60 });
}
applyAutoTalkAlarm();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const config = await getConfig();
  if (!config.enabled) return;

  if (alarm.name === "petHeartbeat") {
    await sendHeartbeat();
  }

  if (alarm.name === "petAutoTalk") {
    if (config.preferences?.autoTalk !== true) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id) {
        try { chrome.tabs.sendMessage(tab.id, { type: "autoTalk" }); } catch {}
      }
    }
  }

  if (alarm.name === "petBrowsing") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id && await hasRecentUserActivity(tab.id)) await trackBrowsing();
  }

  if (alarm.name === "petEmotionDecay") {
    await decayEmotions();
    // Broadcast emotion update to content scripts
    const emotions = await getEmotions();
    const dominant = getDominantEmotion(emotions);
    await recordEmotionSeen(dominant.name);
    // Mood is shared pet state — update every tab, not just the focused one.
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, {
            type: "emotionUpdate",
            emotions,
            dominant,
          });
        } catch {}
      }
    }
  }

  if (alarm.name === "petServerSync") {
    // Pull live pet stats from app — only when user has pasted an authToken.
    // No-op (network-cost zero) when authToken is empty.
    const synced = await syncFromServer();
    if (synced) {
      const dominant = getDominantEmotion(synced);
      // Server-synced mood is shared pet state — update every tab.
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          try { chrome.tabs.sendMessage(tab.id, { type: "emotionUpdate", emotions: synced, dominant }); } catch {}
        }
      }
    }
  }
});

// ══════════════════════════════════════
// ── MESSAGE HANDLER ──
// ══════════════════════════════════════

// Single-arbiter guard for the daily "welcome back". The service worker is one
// instance, so a synchronous check+set here (no await in between) makes the
// greeting fire exactly once even when several tabs report a return at the same
// moment. Persisted so a worker restart within the same day doesn't re-fire it.
let __welcomeDate = null;
const __welcomeDateReady = chrome.storage.local.get("aipetWelcomeDate").then((r) => {
  if (r && r.aipetWelcomeDate) __welcomeDate = r.aipetWelcomeDate;
});

const PAGE_MESSAGE_TYPES = new Set([
  "chat", "summarizePage", "getSitePolicy", "pauseCurrentSite", "userActivity",
  "autonomousMessage", "fetchSkills", "exportSoul", "tickStreak", "affection",
  "treat", "welcome", "emotionAction", "getFullState", "getEmotions", "getEvolution",
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
    sendResponse({ success: false, error: "Invalid extension message" });
    return false;
  }
  const extensionPage = !sender.tab && String(sender.url || "").startsWith(chrome.runtime.getURL(""));
  if ((sender.tab && !PAGE_MESSAGE_TYPES.has(msg.type)) || (!sender.tab && !extensionPage)) {
    sendResponse({ success: false, error: "Extension page required" });
    return false;
  }
  const handlers = {
    chat: () => chatWithPet(msg.message).then((reply) => sendResponse({ reply })),

    summarizePage: () => summarizePage(msg.title, msg.text).then((result) => sendResponse(result)),

    getSitePolicy: () => {
      const descriptor = sender.tab?.id ? siteAccessDescriptor(sender.url || sender.origin) : null;
      if (!descriptor) {
        sendResponse({ enabled: false, paused: false, authorized: false });
        return;
      }
      return Promise.all([getConfig(), siteAccessInfo(sender.url || sender.origin)])
        .then(([config, access]) => sendResponse({
          enabled: config.enabled !== false && access.active === true,
          paused: Array.isArray(config.pausedHosts) && config.pausedHosts.includes(descriptor.host),
          authorized: access.active === true,
        }))
        .catch(() => sendResponse({ enabled: false, paused: false, authorized: false }));
    },

    pauseCurrentSite: () => {
      const host = normalizeSiteHost(msg.host);
      const senderDescriptor = siteAccessDescriptor(sender.url || sender.origin);
      if (!sender.tab?.id || !senderDescriptor || senderDescriptor.host !== host) {
        sendResponse({ success: false });
        return;
      }
      return getConfig().then(async (config) => {
        const pausedHosts = Array.isArray(config.pausedHosts) ? config.pausedHosts : [];
        if (!pausedHosts.includes(host)) pausedHosts.push(host);
        await saveConfig({ ...config, pausedHosts });
        await broadcastSiteDisabled(host);
        sendResponse({ success: true });
      });
    },

    resumeAllSites: () => getConfig().then(async (config) => {
      await saveConfig({ ...config, pausedHosts: [] });
      sendResponse({ success: true });
    }),

    userActivity: () => {
      if (!sender.tab?.id) return sendResponse({ success: false });
      return markUserActivity(sender.tab.id).then(() => sendResponse({ success: true }));
    },

    autonomousMessage: () =>
      generateAutonomousMessage().then((message) => sendResponse({ message })),

    getConfig: () => getConfig().then((config) => sendResponse({ config })),

    getSiteAccessInfo: () => Promise.all([siteAccessInfo(msg.url), getConfig()])
      .then(([access, config]) => sendResponse({
        ...access,
        enabled: config.enabled !== false,
        paused: Boolean(access.host && Array.isArray(config.pausedHosts) && config.pausedHosts.includes(access.host)),
      }))
      .catch(() => sendResponse({ supported: false, granted: false, active: false, error: "Website access could not be checked" })),

    registerSiteAccess: () => registerSiteAccess(msg.url, Number(msg.tabId))
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, error: "Website access could not be activated" })),

    removeSiteAccess: () => removeSiteAccess(msg.url)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, error: "Website access could not be removed" })),

    saveConfig: () => saveConfig(msg.config)
      .then(() => applyAutoTalkAlarm())
      .then(() => sendResponse({ success: true })),

    fetchPetInfo: () => fetchPetInfo().then((config) => sendResponse({
      config,
      success: Boolean(config.authToken && !config.needsPairing && config.petId),
      ...((!config.authToken || config.needsPairing) && { error: "Pairing failed or the token is no longer valid" }),
    })),

    executeSkill: () =>
      executeSkill(msg.skillId, msg.input).then((result) => sendResponse({ result })),

    fetchSkills: () => fetchSkillsList().then((data) => sendResponse({ data })),

    exportSoul: () => exportSoul().then((data) => sendResponse({ data })),
    importSoul: () => importSoul(msg.soul).then((res) => sendResponse(res)),
    tickStreak: () => tickStreak().then((res) => sendResponse(res)),

    getPoints: () => getPoints().then((points) => sendResponse({ points })),

    // Read the account's season score + how much of it came from the extension
    // today, so the popup can show that ambient care is linked to your data.
    getSeasonSync: () =>
      getConfig().then((config) => {
        if (!config.authToken) return sendResponse({ signedIn: false });
        return callPetClawAPI("/api/petclaw/engagement").then((data) =>
          sendResponse({ signedIn: true, data })
        );
      }),

    // A real drag/pat performs one care action and one server-capped engagement.
    // Previously the content script also sent emotionAction separately, granting
    // the same gesture twice.
    affection: () => Promise.all([
      applyEmotionAction("pet"),
      postEngagement("pet"),
    ]).then(([emotions, season]) => sendResponse({ emotions, season })),

    // Collected a treat the walking pet found → a small ambient-care point (local)
    // + season sync (shares the ext_care daily cap with petting, server-side).
    treat: () =>
      Promise.all([
        addPoints("care", 1, msg.reason || "collect_treat"),
        postEngagement("treat"),
      ]).then(([points, season]) => sendResponse({ points, season })),

    // Daily "welcome back" when you return to the tab. The worker is the single
    // arbiter (synchronous check+set below) so multiple tabs returning at once
    // can't double-fire. Grants a once-a-day greeting point (local) + season sync
    // (ext_welcome, also ≈once/day capped server-side). Responds welcomed:true
    // only for the first return of the day — the content script celebrates only
    // then, so no duplicate bubbles.
    welcome: () => __welcomeDateReady.then(() => {
      const today = localDayKey();
      if (__welcomeDate === today) { sendResponse({ welcomed: false }); return; }
      __welcomeDate = today;
      chrome.storage.local.set({ aipetWelcomeDate: today });
      return Promise.all([
        addPoints("care", 1, msg.reason || "welcome_back_daily"),
        postEngagement("welcome"),
      ]).then(([points, season]) => sendResponse({ welcomed: true, points, season }));
    }),

    getActivity: () =>
      Promise.all([getPoints(), getConfig(), getNotifications(), chrome.storage.local.get(BROWSE_KEY)]).then(
        ([points, config, notifications, browseState]) => {
          browsingMinutes = Math.max(0, Number(browseState[BROWSE_KEY]) || 0);
          sendResponse({
            points,
            pet: { name: config.petName, level: config.level, personality: config.personality },
            uptime: browsingMinutes,
            notifications,
          });
        }
      ),

    getEmotions: () =>
      getEmotions().then((emotions) => {
        const dominant = getDominantEmotion(emotions);
        sendResponse({ emotions, dominant });
      }),

    emotionAction: () =>
      applyEmotionAction(msg.action).then((emotions) => {
        const dominant = getDominantEmotion(emotions);
        sendResponse({ emotions, dominant });
        // Broadcast to content scripts — mood change is shared pet state, update every tab.
        chrome.tabs.query({}).then((tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              try { chrome.tabs.sendMessage(tab.id, { type: "emotionUpdate", emotions, dominant }); } catch {}
            }
          }
        });
      }),

    getEvolution: () => getEvolution().then((evolution) => sendResponse({ evolution })),

    gameComplete: () =>
      saveGameResult(msg.score, msg.game).then((stats) =>
        sendResponse({
          highScore: stats.highScore,
          highScoreMemory: stats.highScoreMemory,
          score: stats.score,
          awardedPoints: stats.awardedPoints,
        })
      ),

    getGameStats: () => getGameStats().then((stats) => sendResponse(stats)),

    resetPoints: () =>
      chrome.storage.local.remove([POINTS_KEY]).then(() =>
        sendResponse({ success: true })
      ),

    setPreference: () =>
      getConfig().then(async (config) => {
        if (msg.key === "enabled") {
          config.enabled = Boolean(msg.value);
        } else {
          if (!["notifications", "particles", "autoTalk", "pageAwareness", "sound"].includes(msg.key)) {
            sendResponse({ success: false, error: "Unsupported preference" });
            return;
          }
          if (!config.preferences) config.preferences = {};
          config.preferences[msg.key] = Boolean(msg.value);
        }
        await saveConfig(config);

        // Broadcast preference change
        if (msg.key === "enabled" && msg.value === false) {
          await broadcastSiteDisabled("", true);
        } else {
          const tabs = await chrome.tabs.query({}).catch(() => []);
          await Promise.all(tabs.map((tab) => Number.isInteger(tab.id)
            ? chrome.tabs.sendMessage(tab.id, { type: "prefChange", key: msg.key, value: msg.value }).catch(() => {})
            : Promise.resolve()));
        }
        if (msg.key === "autoTalk") await applyAutoTalkAlarm();
        sendResponse({ success: true });
      }),

    getAchievements: () =>
      checkAchievements().then((data) => sendResponse(data)),

    getDailyQuests: () =>
      getDailyQuests().then((data) => sendResponse(data)),

    claimQuest: () =>
      claimQuestReward(msg.questId).then((res) => sendResponse(res)),

    progressQuest: () =>
      progressQuest(msg.category, msg.amount).then((data) => sendResponse(data)),

    getFullState: () =>
      Promise.all([getConfig(), getPoints(), getEmotions(), getEvolution(), getGameStats(), getAchievements(), getDailyQuests()]).then(
        ([config, points, emotions, evolution, gameStats, achievements, quests]) => {
          sendResponse({
            config: contentSafeConfig(config),
            points,
            emotions,
            dominant: getDominantEmotion(emotions),
            evolution,
            gameStats,
            achievements,
            quests,
          });
        }
      ),
  };

  const runHandler = () => {
    try {
      const result = handlers[msg.type]();
      if (result && typeof result.catch === "function") {
        result.catch(() => sendResponse({ success: false, error: "Extension action failed" }));
      }
    } catch {
      sendResponse({ success: false, error: "Extension action failed" });
    }
  };

  if (handlers[msg.type]) {
    // An already-injected content script can outlive a permission change. Check
    // every page-originated action against both the current optional permission
    // and its exact dynamic registration before allowing API or local-state use.
    if (sender.tab && msg.type !== "getSitePolicy") {
      const senderUrl = sender.url || sender.origin;
      Promise.all([siteAccessInfo(senderUrl), getConfig()])
        .then(([access, config]) => {
          const descriptor = siteAccessDescriptor(senderUrl);
          const paused = Boolean(
            descriptor && Array.isArray(config.pausedHosts) && config.pausedHosts.includes(descriptor.host)
          );
          if (!access.active || config.enabled === false || paused) {
            sendResponse({ success: false, error: "Website access is not active" });
            return;
          }
          runHandler();
        })
        .catch(() => sendResponse({ success: false, error: "Website access is not active" }));
      return true;
    }
    runHandler();
    return true; // async
  }
});

// ══════════════════════════════════════
// ── INSTALL ──
// ══════════════════════════════════════

async function restrictStorageToExtensionContexts() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("[AI Pet] Could not restrict storage access:", error?.message || error);
  }
}
restrictStorageToExtensionContexts();
reconcileSiteRegistrations();
chrome.runtime.onStartup.addListener(() => {
  restrictStorageToExtensionContexts();
  reconcileSiteRegistrations();
});
chrome.permissions.onRemoved.addListener((removed) => {
  reconcileSiteRegistrations();
  deactivateRemovedOrigins(removed?.origins);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await restrictStorageToExtensionContexts();
  await reconcileSiteRegistrations();
  // Content injected by an older manifest can survive an extension update in an
  // already-open tab. Tear every old instance down; approved dynamic scripts
  // return on the next reload without broadening permission.
  if (details.reason === "update") await broadcastSiteDisabled("", true);
  const config = await getConfig();
  const migration = await chrome.storage.local.get("petSecurityDefaultsV230");
  if (details.reason === "install" || migration.petSecurityDefaultsV230 !== true) {
    await saveConfig({
      ...config,
      preferences: { ...config.preferences, autoTalk: false, pageAwareness: false },
    });
    await chrome.storage.local.set({ petSecurityDefaultsV230: true });
    await applyAutoTalkAlarm();
  }
  await fetchPetInfo();
  if (details.reason === "install") {
    await chrome.tabs.create({ url: "https://app.myaipet.ai/sovereignty#petclaw-extension" });
  }
  const version = chrome.runtime.getManifest().version;
  const installed = details.reason === "install";
  await addNotification("🎉", installed
    ? `MY AI PET v${version} installed! Open Settings to pair and approve one website.`
    : `MY AI PET updated to v${version}. Reload approved websites to show PetClaw.`);
  console.log(`[AI Pet] v${version} ${installed ? "installed" : "updated"}.`);
});
