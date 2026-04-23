/**
 * MY AI PET v2.0 — Background Service Worker
 * Handles API, emotions, evolution, points, notifications, mini-game
 */

// ══════════════════════════════════════
// ── CONFIG ──
// ══════════════════════════════════════

const DEFAULT_CONFIG = {
  apiUrl: "http://3.34.197.230",
  petId: 1,
  petName: "My Pet",
  petEmoji: "\uD83D\uDC3E",
  avatarUrl: "",
  personality: "playful",
  level: 1,
  autoTalkInterval: 90,
  enabled: true,
  preferences: {
    notifications: true,
    particles: true,
    autoTalk: true,
    sound: false,
  },
};

async function getConfig() {
  const result = await chrome.storage.local.get("petConfig");
  return { ...DEFAULT_CONFIG, ...(result.petConfig || {}) };
}

async function saveConfig(config) {
  const current = await getConfig();
  const merged = { ...current, ...config };
  await chrome.storage.local.set({ petConfig: merged });
}

// ══════════════════════════════════════
// ── API ──
// ══════════════════════════════════════

async function callPetClawAPI(endpoint, options = {}) {
  const config = await getConfig();
  const url = `${config.apiUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("[AI Pet] API error:", e.message);
    return null;
  }
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
  return e;
}

// ══════════════════════════════════════
// ── EVOLUTION SYSTEM ──
// ══════════════════════════════════════

const EVOLUTION_KEY = "petEvolution";

const EVO_THRESHOLDS = [0, 100, 500, 1500, 5000, 15000];

async function getEvolution() {
  const result = await chrome.storage.local.get(EVOLUTION_KEY);
  return { stage: 0, xp: 0, ...(result[EVOLUTION_KEY] || {}) };
}

async function saveEvolution(evo) {
  await chrome.storage.local.set({ [EVOLUTION_KEY]: evo });
}

async function addEvolutionXP(amount, reason) {
  const evo = await getEvolution();
  evo.xp += amount;

  // Check stage up
  let evolved = false;
  while (evo.stage < EVO_THRESHOLDS.length - 1 && evo.xp >= EVO_THRESHOLDS[evo.stage + 1]) {
    evo.stage++;
    evolved = true;
  }

  await saveEvolution(evo);

  if (evolved) {
    const stageNames = ["Egg", "Baby", "Junior", "Teen", "Adult", "Legend"];
    const stageIcons = ["🥚", "🐣", "🐾", "⚡", "🔥", "👑"];
    await addNotification(
      stageIcons[evo.stage],
      `Evolved to ${stageNames[evo.stage]}! 🎉`
    );
    await addPoints("evolution", 50, `evolved to ${stageNames[evo.stage]}`);

    // Notify content scripts
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
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
  const evo = await getEvolution();

  // Legend bonus: 2x multiplier
  if (evo.stage >= 5) amount *= 2;

  points.totalPoints += amount;
  points[category + "Points"] = (points[category + "Points"] || 0) + amount;

  if (category === "chat") points.chatCount = (points.chatCount || 0) + 1;
  if (category === "skill") points.skillCount = (points.skillCount || 0) + 1;
  if (category === "heartbeat") points.heartbeatCount = (points.heartbeatCount || 0) + 1;

  await chrome.storage.local.set({ [POINTS_KEY]: points });

  // XP from points
  await addEvolutionXP(Math.ceil(amount * 0.5), reason);

  console.log(`[AI Pet] +${amount} ${category} pts (${reason}). Total: ${points.totalPoints}`);
  return points;
}

// ══════════════════════════════════════
// ── GAME STATS ──
// ══════════════════════════════════════

const GAME_KEY = "petGameStats";

async function getGameStats() {
  const result = await chrome.storage.local.get(GAME_KEY);
  return { highScore: 0, gamesPlayed: 0, ...(result[GAME_KEY] || {}) };
}

async function saveGameResult(score, points) {
  const stats = await getGameStats();
  stats.gamesPlayed++;
  if (score > stats.highScore) stats.highScore = score;
  await chrome.storage.local.set({ [GAME_KEY]: stats });

  if (points > 0) {
    await addPoints("game", points, `mini-game score ${score}`);
    await addNotification("🎮", `Game finished! Score: ${score}, +${points} pts`);
  }

  return stats;
}

// ══════════════════════════════════════
// ── CHAT ──
// ══════════════════════════════════════

async function chatWithPet(message) {
  const config = await getConfig();
  const emotions = await getEmotions();
  const dominant = getDominantEmotion(emotions);

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
  const pFallbacks = fallbacks[config.personality] || fallbacks.playful;
  return pFallbacks[Math.floor(Math.random() * pFallbacks.length)];
}

// ══════════════════════════════════════
// ── AUTONOMOUS BEHAVIOR ──
// ══════════════════════════════════════

async function generateAutonomousMessage() {
  const config = await getConfig();
  const emotions = await getEmotions();
  const dominant = getDominantEmotion(emotions);

  // Emotion-aware topics
  let topic;
  if (emotions.hunger > 70) {
    topic = "You're really hungry. Mention food or ask for a treat.";
  } else if (emotions.energy < 20) {
    topic = "You're very sleepy. Say something drowsy.";
  } else if (emotions.affection < 25) {
    topic = "You miss your owner. Say something to get their attention.";
  } else {
    const topics = [
      "Share a random fun thought",
      "Comment on something interesting",
      "Say something cute to cheer up your owner",
      "Express how you're feeling right now",
      "Ask your owner a fun question",
      "Share a fun fact",
      "React to the current time of day",
    ];
    topic = topics[Math.floor(Math.random() * topics.length)];
  }

  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId: "companion-chat",
      input: { message: topic, mood: dominant.name.toLowerCase() },
    }),
  });

  if (result?.success && result.output?.reply) {
    return result.output.reply;
  }

  // Emotion-aware fallbacks
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
  const result = await callPetClawAPI("/api/petclaw/skills", {
    method: "POST",
    body: JSON.stringify({
      action: "execute",
      petId: config.petId,
      skillId,
      input,
    }),
  });
  if (result) await addPoints("skill", 5, `skill: ${skillId}`);
  return result;
}

async function fetchSkillsList() {
  const config = await getConfig();
  return await callPetClawAPI(`/api/petclaw/skills?petId=${config.petId}`);
}

async function exportSoul() {
  const config = await getConfig();
  return callPetClawAPI(`/api/petclaw/export?petId=${config.petId}`);
}

async function fetchPetInfo() {
  const config = await getConfig();

  // Try authenticated /api/pets first
  let pet = null;
  const data = await callPetClawAPI(`/api/pets`);
  if (data?.pets?.length > 0) {
    pet = data.pets[0];
  }

  // Fallback: try PetClaw network discover (no auth needed)
  if (!pet) {
    const discover = await callPetClawAPI(`/api/petclaw/network/discover?limit=1`);
    if (discover?.nodes?.length > 0) {
      const node = discover.nodes.find(n => n.petId === config.petId) || discover.nodes[0];
      pet = {
        id: node.petId,
        name: node.name,
        species: 0,
        avatar_url: node.avatarUrl || "",
        personality_type: node.personality,
        level: node.level,
        element: node.element,
      };
    }
  }

  if (pet) {
    const updated = {
      ...config,
      petId: pet.id,
      petName: pet.name,
      petEmoji: ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"][pet.species] || "🐾",
      avatarUrl: pet.avatar_url || "",
      personality: pet.personality_type || "playful",
      level: pet.level || 1,
    };
    await saveConfig(updated);
    return updated;
  }
  return config;
}

// ══════════════════════════════════════
// ── HEARTBEAT ──
// ══════════════════════════════════════

let browsingMinutes = 0;

async function sendHeartbeat() {
  const config = await getConfig();
  if (!config.enabled) return;

  await callPetClawAPI("/api/playtime", {
    method: "POST",
    body: JSON.stringify({ minutes: 5, pet_id: config.petId }),
  });

  await addPoints("heartbeat", 1, "5min heartbeat");
  await decayEmotions();

  // Daily streak check
  const points = await getPoints();
  const today = new Date().toISOString().split("T")[0];
  if (points.lastDaily !== today) {
    await addPoints("heartbeat", 10, "daily login bonus");
    await addNotification("📅", "Daily login bonus! +10 pts");

    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (points.lastDaily === yesterday) {
      points.dailyStreak = (points.dailyStreak || 0) + 1;
      const streakBonus = Math.min(points.dailyStreak * 2, 20);
      await addPoints("heartbeat", streakBonus, `${points.dailyStreak}-day streak bonus`);
      await addNotification("🔥", `${points.dailyStreak}-day streak! +${streakBonus} bonus`);
    } else {
      points.dailyStreak = 1;
    }

    points.lastDaily = today;
    await chrome.storage.local.set({ [POINTS_KEY]: points });
  }

  // Emotion warnings
  const emotions = await getEmotions();
  if (emotions.hunger > 80 && config.preferences?.notifications !== false) {
    chrome.notifications.create("pet-hungry", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `${config.petName} is hungry!`,
      message: "Your pet needs food! Open the extension to feed them.",
    });
  }

  return points;
}

async function trackBrowsing() {
  browsingMinutes++;
  if (browsingMinutes % 10 === 0) {
    await addPoints("browsing", 1, "10min active browsing");
  }
}

// ══════════════════════════════════════
// ── ALARMS ──
// ══════════════════════════════════════

chrome.alarms.create("petHeartbeat", { periodInMinutes: 5 });
chrome.alarms.create("petAutoTalk", { periodInMinutes: 2 });
chrome.alarms.create("petBrowsing", { periodInMinutes: 1 });
chrome.alarms.create("petEmotionDecay", { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const config = await getConfig();
  if (!config.enabled) return;

  if (alarm.name === "petHeartbeat") {
    await sendHeartbeat();
  }

  if (alarm.name === "petAutoTalk") {
    if (config.preferences?.autoTalk === false) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id) {
        try { chrome.tabs.sendMessage(tab.id, { type: "autoTalk" }); } catch {}
      }
    }
  }

  if (alarm.name === "petBrowsing") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) await trackBrowsing();
  }

  if (alarm.name === "petEmotionDecay") {
    await decayEmotions();
    // Broadcast emotion update to content scripts
    const emotions = await getEmotions();
    const dominant = getDominantEmotion(emotions);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
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
});

// ══════════════════════════════════════
// ── MESSAGE HANDLER ──
// ══════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    chat: () => chatWithPet(msg.message).then((reply) => sendResponse({ reply })),

    autonomousMessage: () =>
      generateAutonomousMessage().then((message) => sendResponse({ message })),

    getConfig: () => getConfig().then((config) => sendResponse({ config })),

    saveConfig: () => saveConfig(msg.config).then(() => sendResponse({ success: true })),

    fetchPetInfo: () => fetchPetInfo().then((config) => sendResponse({ config })),

    executeSkill: () =>
      executeSkill(msg.skillId, msg.input).then((result) => sendResponse({ result })),

    fetchSkills: () => fetchSkillsList().then((data) => sendResponse({ data })),

    exportSoul: () => exportSoul().then((data) => sendResponse({ data })),

    getPoints: () => getPoints().then((points) => sendResponse({ points })),

    getActivity: () =>
      Promise.all([getPoints(), getConfig(), getNotifications()]).then(
        ([points, config, notifications]) => {
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
        // Broadcast to content scripts
        chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              try { chrome.tabs.sendMessage(tab.id, { type: "emotionUpdate", emotions, dominant }); } catch {}
            }
          }
        });
      }),

    getEvolution: () => getEvolution().then((evolution) => sendResponse({ evolution })),

    gameComplete: () =>
      saveGameResult(msg.score, msg.points).then((stats) =>
        sendResponse({ highScore: stats.highScore })
      ),

    getGameStats: () => getGameStats().then((stats) => sendResponse(stats)),

    resetPoints: () =>
      chrome.storage.local.remove([POINTS_KEY, EVOLUTION_KEY]).then(() =>
        sendResponse({ success: true })
      ),

    setPreference: () =>
      getConfig().then(async (config) => {
        if (!config.preferences) config.preferences = {};
        config.preferences[msg.key] = msg.value;
        await saveConfig(config);
        sendResponse({ success: true });

        // Broadcast preference change
        if (msg.key === "particles") {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              try { chrome.tabs.sendMessage(tab.id, { type: "prefChange", key: msg.key, value: msg.value }); } catch {}
            }
          }
        }
      }),

    getFullState: () =>
      Promise.all([getConfig(), getPoints(), getEmotions(), getEvolution(), getGameStats()]).then(
        ([config, points, emotions, evolution, gameStats]) => {
          sendResponse({
            config,
            points,
            emotions,
            dominant: getDominantEmotion(emotions),
            evolution,
            gameStats,
          });
        }
      ),
  };

  if (handlers[msg.type]) {
    handlers[msg.type]();
    return true; // async
  }
});

// ══════════════════════════════════════
// ── INSTALL ──
// ══════════════════════════════════════

chrome.runtime.onInstalled.addListener(async () => {
  await fetchPetInfo();
  await sendHeartbeat();
  await addNotification("🎉", "MY AI PET v2.0 installed! Welcome!");
  console.log("[AI Pet] v2.0 installed! Emotions, evolution, and mini-games active.");
});
