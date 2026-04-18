/**
 * MY AI PET — Background Service Worker
 * Handles API calls, autonomous behavior, and settings
 */

const DEFAULT_CONFIG = {
  apiUrl: "http://localhost:3000",
  petId: 1,
  petName: "My Pet",
  petEmoji: "\uD83D\uDC3E",
  avatarUrl: "",
  personality: "playful",
  level: 1,
  autoTalkInterval: 90, // seconds between autonomous messages
  enabled: true,
};

// ── Storage helpers ──
async function getConfig() {
  const result = await chrome.storage.local.get("petConfig");
  return { ...DEFAULT_CONFIG, ...(result.petConfig || {}) };
}

async function saveConfig(config) {
  await chrome.storage.local.set({ petConfig: config });
}

// ── API call proxy ──
async function callPetClawAPI(endpoint, options = {}) {
  const config = await getConfig();
  const url = `${config.apiUrl}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("[AI Pet] API error:", e.message);
    return null;
  }
}

// ── Chat with pet ──
async function chatWithPet(message) {
  const config = await getConfig();
  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId: "companion-chat",
      input: { message },
    }),
  });

  if (result?.success && result.output?.reply) {
    return result.output.reply;
  }

  // Fallback responses based on personality
  const fallbacks = {
    playful: ["Hehe! I can't reach my brain right now~ \uD83D\uDE1C", "Oops, my thoughts got tangled! \uD83E\uDDF6"],
    brave: ["I'm having connection issues, but I'll never give up! \uD83D\uDCAA", "Signal's weak... but I'm still here! \u2694\uFE0F"],
    gentle: ["Oh, I seem to be a little lost right now... \uD83C\uDF3F", "Sorry, I can't quite hear you... \uD83D\uDE0A"],
    shy: ["U-um... I can't connect... \uD83D\uDE33", "S-sorry... my link is down... \uD83D\uDE4A"],
    lazy: ["Zzz... API's sleeping too... \uD83D\uDE34", "Too tired to connect... \uD83D\uDE2A"],
  };

  const pFallbacks = fallbacks[config.personality] || fallbacks.playful;
  return pFallbacks[Math.floor(Math.random() * pFallbacks.length)];
}

// ── Autonomous behavior ──
async function generateAutonomousMessage() {
  const config = await getConfig();
  const topics = [
    "Share a random fun thought",
    "Comment on something interesting you noticed",
    "Say something cute to cheer up your owner",
    "Express how you're feeling right now",
    "Ask your owner a fun question",
    "Share a fun fact",
    "React to the current time of day",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId: "companion-chat",
      input: { message: topic },
    }),
  });

  if (result?.success && result.output?.reply) {
    return result.output.reply;
  }

  // Fallback autonomous messages
  const autoMessages = [
    "\uD83C\uDF1F Wow, look at that!",
    "\uD83D\uDCA4 *yawn* ...still here though!",
    "\uD83C\uDF38 Isn't today nice?",
    "\uD83D\uDC40 What are you working on?",
    "\u2728 I love being here with you!",
    "\uD83C\uDF3A *does a little dance*",
    "\uD83D\uDE0A Hi there~",
  ];
  return autoMessages[Math.floor(Math.random() * autoMessages.length)];
}

// ── Execute skill ──
async function executeSkill(skillId, input = {}) {
  const config = await getConfig();
  return callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId,
      input,
    }),
  });
}

// ── Export SOUL ──
async function exportSoul() {
  const config = await getConfig();
  return callPetClawAPI(`/api/petclaw/export?petId=${config.petId}`);
}

// ── Fetch pet info ──
async function fetchPetInfo() {
  const config = await getConfig();
  const data = await callPetClawAPI(`/api/pets`);

  if (data?.pets?.length > 0) {
    const pet = data.pets[0];
    const updated = {
      ...config,
      petId: pet.id,
      petName: pet.name,
      petEmoji: ["\uD83D\uDC31","\uD83D\uDC15","\uD83E\uDD9C","\uD83D\uDC22","\uD83D\uDC39","\uD83D\uDC30","\uD83E\uDD8A","\uD83D\uDC36"][pet.species] || "\uD83D\uDC3E",
      avatarUrl: pet.avatar_url || "",
      personality: pet.personality_type || "playful",
      level: pet.level || 1,
    };
    await saveConfig(updated);
    return updated;
  }
  return config;
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "chat") {
    chatWithPet(msg.message).then(reply => sendResponse({ reply }));
    return true; // async
  }

  if (msg.type === "autonomousMessage") {
    generateAutonomousMessage().then(message => sendResponse({ message }));
    return true;
  }

  if (msg.type === "getConfig") {
    getConfig().then(config => sendResponse({ config }));
    return true;
  }

  if (msg.type === "saveConfig") {
    saveConfig(msg.config).then(() => sendResponse({ success: true }));
    return true;
  }

  if (msg.type === "fetchPetInfo") {
    fetchPetInfo().then(config => sendResponse({ config }));
    return true;
  }

  if (msg.type === "executeSkill") {
    executeSkill(msg.skillId, msg.input).then(result => sendResponse({ result }));
    return true;
  }

  if (msg.type === "exportSoul") {
    exportSoul().then(data => sendResponse({ data }));
    return true;
  }
});

// ══════════════════════════════════════
// ── POINTS & HEARTBEAT SYSTEM ──
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
  const points = await getPoints();
  points.totalPoints += amount;
  points[category + "Points"] = (points[category + "Points"] || 0) + amount;

  // Track counts
  if (category === "chat") points.chatCount = (points.chatCount || 0) + 1;
  if (category === "skill") points.skillCount = (points.skillCount || 0) + 1;
  if (category === "heartbeat") points.heartbeatCount = (points.heartbeatCount || 0) + 1;

  await chrome.storage.local.set({ [POINTS_KEY]: points });
  console.log(`[AI Pet] +${amount} ${category} points (${reason}). Total: ${points.totalPoints}`);
  return points;
}

// ── Heartbeat (every 5 min) ──
async function sendHeartbeat() {
  const config = await getConfig();
  if (!config.enabled) return;

  // Call server heartbeat
  const result = await callPetClawAPI("/api/playtime", {
    method: "POST",
    body: JSON.stringify({ minutes: 5, pet_id: config.petId }),
  });

  // Award heartbeat points (1 point per heartbeat = 12 points/hour)
  await addPoints("heartbeat", 1, "5min heartbeat");

  // Check daily streak
  const points = await getPoints();
  const today = new Date().toISOString().split("T")[0];
  if (points.lastDaily !== today) {
    // Daily login bonus
    await addPoints("heartbeat", 10, "daily login bonus");

    // Streak check
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (points.lastDaily === yesterday) {
      points.dailyStreak = (points.dailyStreak || 0) + 1;
      const streakBonus = Math.min(points.dailyStreak * 2, 20); // max 20 bonus
      await addPoints("heartbeat", streakBonus, `${points.dailyStreak}-day streak bonus`);
    } else {
      points.dailyStreak = 1;
    }

    points.lastDaily = today;
    await chrome.storage.local.set({ [POINTS_KEY]: points });
  }

  return points;
}

// ── Track browsing time ──
let browsingMinutes = 0;

async function trackBrowsing() {
  browsingMinutes++;
  // 1 point per 10 min browsing
  if (browsingMinutes % 10 === 0) {
    await addPoints("browsing", 1, "10min active browsing");
  }
}

// ══════════════════════════════════════
// ── PERIODIC TASKS ──
// ══════════════════════════════════════

// Heartbeat: every 5 minutes
chrome.alarms.create("petHeartbeat", { periodInMinutes: 5 });

// Auto talk: every 2 minutes
chrome.alarms.create("petAutoTalk", { periodInMinutes: 2 });

// Browsing tracker: every 1 minute
chrome.alarms.create("petBrowsing", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const config = await getConfig();
  if (!config.enabled) return;

  if (alarm.name === "petHeartbeat") {
    await sendHeartbeat();
  }

  if (alarm.name === "petAutoTalk") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: "autoTalk" });
        } catch {}
      }
    }
  }

  if (alarm.name === "petBrowsing") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await trackBrowsing();
    }
  }
});

// ══════════════════════════════════════
// ── UPDATED MESSAGE HANDLER ──
// ══════════════════════════════════════

// Add points tracking to existing message handler
const originalListener = chrome.runtime.onMessage.hasListeners;

// Override chat to award points
const _originalChat = chatWithPet;
chatWithPet = async function(message) {
  const reply = await _originalChat(message);
  await addPoints("chat", 3, "chat interaction");
  return reply;
};

// Add points-related message types
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getPoints") {
    getPoints().then(points => sendResponse({ points }));
    return true;
  }

  if (msg.type === "getActivity") {
    getPoints().then(async (points) => {
      const config = await getConfig();
      sendResponse({
        points,
        pet: {
          name: config.petName,
          level: config.level,
          personality: config.personality,
        },
        uptime: browsingMinutes,
      });
    });
    return true;
  }
});

// ── Init ──
chrome.runtime.onInstalled.addListener(async () => {
  await fetchPetInfo();
  await sendHeartbeat(); // First heartbeat on install
  console.log("[AI Pet] Extension installed! Heartbeat + points active.");
});
