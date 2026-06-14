/**
 * MY AI PET — Popup Controller
 * Tabs, Points, Evolution, Emotions, Mini-Game, Settings
 */

const $ = (id) => document.getElementById(id);

// Stamp the footer with the live manifest version so it never drifts stale.
try {
  const vEl = $("version-line");
  if (vEl) vEl.textContent = `MY AI PET v${chrome.runtime.getManifest().version} — PetClaw`;
} catch {}

// ══════════════════════════════════════
// ── TABS ──
// ══════════════════════════════════════
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    $("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// ══════════════════════════════════════
// ── STATUS ──
// ══════════════════════════════════════
function showStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = isError ? "error" : "";
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

// ══════════════════════════════════════
// ── TOGGLES ──
// ══════════════════════════════════════
document.querySelectorAll(".toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("on");
    const key = toggle.dataset.key;
    const val = toggle.classList.contains("on");
    chrome.runtime.sendMessage({ type: "setPreference", key, value: val });
  });
});

// ══════════════════════════════════════
// ── POINTS ──
// ══════════════════════════════════════
function loadPoints() {
  chrome.runtime.sendMessage({ type: "getActivity" }, (res) => {
    if (!res) return;
    const p = res.points || {};
    $("totalPoints").textContent = (p.totalPoints || 0).toLocaleString();
    $("chatPoints").textContent = p.chatPoints || 0;
    $("heartbeatPoints").textContent = p.heartbeatPoints || 0;
    $("skillPoints").textContent = p.skillPoints || 0;
    $("browsingPoints").textContent = p.browsingPoints || 0;
    $("gamePoints").textContent = p.gamePoints || 0;
    $("evolutionPoints").textContent = p.evolutionPoints || 0;
    $("streak").textContent = p.dailyStreak || 0;
    $("chatCount").textContent = p.chatCount || 0;
    $("uptime").textContent = res.uptime || 0;

    // Update notifications
    if (res.notifications && res.notifications.length > 0) {
      renderNotifications(res.notifications);
    }
  });
}

function renderNotifications(notifs) {
  const list = $("notifList");
  list.innerHTML = notifs
    .slice(-10)
    .reverse()
    .map((n) => `
      <div class="notif-item">
        <div class="icon">${n.icon || "📌"}</div>
        <div class="text">${n.text}</div>
        <div class="time">${n.time || ""}</div>
      </div>
    `)
    .join("");
}

loadPoints();
setInterval(loadPoints, 5000);

// ══════════════════════════════════════
// ── DAILY QUESTS ──
// ══════════════════════════════════════
function loadQuests() {
  chrome.runtime.sendMessage({ type: "getDailyQuests" }, (res) => {
    if (!res?.quests) return;
    const list = $("questList");
    list.innerHTML = res.quests.map((q) => {
      const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
      const done = q.completed;
      const claimed = q.claimed;
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
          <div style="font-size:16px;flex-shrink:0">${q.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:${done ? "#4ade80" : "#ccc"};font-weight:600">${q.name}</div>
            <div style="font-size:9px;color:#666">${q.desc}</div>
            <div style="margin-top:3px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${done ? "#4ade80" : "#f59e0b"};border-radius:2px;transition:width 0.3s"></div>
            </div>
          </div>
          <div style="font-size:9px;color:#888;text-align:right;flex-shrink:0">
            ${claimed ? '<span style="color:#4ade80">✅</span>' :
              done ? `<button class="quest-claim" data-id="${q.id}" style="padding:3px 8px;border:none;border-radius:6px;background:#f59e0b;color:#fff;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit">+${q.reward}</button>` :
              `${q.progress}/${q.target}`}
          </div>
        </div>
      `;
    }).join("");

    // Claim buttons
    list.querySelectorAll(".quest-claim").forEach((btn) => {
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "claimQuest", questId: btn.dataset.id }, (r) => {
          if (r?.success) {
            loadQuests();
            loadPoints();
            showStatus(`✅ +${r.reward} Season Rewards points!`);
          }
        });
      });
    });
  });
}

loadQuests();
setInterval(loadQuests, 10000);

// ══════════════════════════════════════
// ── EVOLUTION ──
// ══════════════════════════════════════
const EVO_STAGES = [
  { name: "Egg", icon: "🥚", xp: 0, desc: "Your pet is just beginning its journey..." },
  { name: "Baby", icon: "🐣", xp: 100, desc: "Just hatched! So cute and curious!" },
  { name: "Junior", icon: "🐾", xp: 500, desc: "Growing fast and learning new tricks!" },
  { name: "Teen", icon: "⚡", xp: 1500, desc: "Energetic and full of personality!" },
  { name: "Adult", icon: "🔥", xp: 5000, desc: "Powerful and wise, a true companion!" },
  { name: "Legend", icon: "👑", xp: 15000, desc: "A legendary pet! The ultimate form!" },
];

const EVO_PERKS = [
  "Egg: Basic chat",
  "Baby: Emoji reactions, mood system",
  "Junior: Particle effects, mini-game access",
  "Teen: Auto-skills, selfie generation",
  "Adult: Advanced AI conversations, custom themes",
  "Legend: Exclusive aura, bonus points multiplier (2x)",
];

function loadEvolution() {
  chrome.runtime.sendMessage({ type: "getEvolution" }, (res) => {
    if (!res) return;
    const evo = res.evolution || { stage: 0, xp: 0 };
    const current = EVO_STAGES[evo.stage] || EVO_STAGES[0];
    const next = EVO_STAGES[evo.stage + 1];

    $("evoCurrentIcon").textContent = current.icon;
    $("evoCurrentName").textContent = current.name;
    $("evoCurrentDesc").textContent = current.desc;
    $("evoStage").textContent = current.name;

    if (next) {
      const progress = ((evo.xp - current.xp) / (next.xp - current.xp)) * 100;
      $("evoProgressBar").style.width = Math.min(100, Math.max(0, progress)) + "%";
      $("evoProgressText").textContent = `${evo.xp} / ${next.xp} XP to ${next.name}`;
    } else {
      $("evoProgressBar").style.width = "100%";
      $("evoProgressText").textContent = "MAX LEVEL! 🎉";
    }

    // Update stage indicators
    const stagesEl = $("evoStages");
    stagesEl.innerHTML = EVO_STAGES.map((s, i) => {
      let cls = "stage";
      if (i === evo.stage) cls += " current";
      else if (i > evo.stage) cls += " locked";
      return `<div class="${cls}"><span class="stage-icon">${s.icon}</span>${s.name}</div>`;
    }).join("");

    // Perks
    $("evoPerks").innerHTML = EVO_PERKS.map((p, i) => {
      const unlocked = i <= evo.stage;
      return `<div style="padding:4px 0;color:${unlocked ? "#4ade80" : "#555"}">${unlocked ? "✅" : "🔒"} ${p}</div>`;
    }).join("");
  });
}

loadEvolution();

// ══════════════════════════════════════
// ── EMOTIONS ──
// ══════════════════════════════════════
function loadEmotions() {
  chrome.runtime.sendMessage({ type: "getEmotions" }, (res) => {
    if (!res) return;
    const e = res.emotions || { happiness: 80, energy: 60, hunger: 40, affection: 70, curiosity: 50 };
    const dominant = res.dominant || { emoji: "😊", name: "Happy", desc: "Your pet is feeling great!" };

    $("emotionEmoji").textContent = dominant.emoji;
    $("emotionName").textContent = dominant.name;
    $("emotionDesc").textContent = dominant.desc;
    $("petMood").textContent = dominant.emoji + " " + dominant.name;

    const bars = ["happiness", "energy", "hunger", "affection", "curiosity"];
    bars.forEach((b) => {
      const val = Math.round(e[b] || 0);
      $("bar" + b.charAt(0).toUpperCase() + b.slice(1)).style.width = val + "%";
      $("val" + b.charAt(0).toUpperCase() + b.slice(1)).textContent = val;
    });
  });
}

loadEmotions();
setInterval(loadEmotions, 10000);

// Emotion action buttons
$("feedBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "emotionAction", action: "feed" }, () => {
    loadEmotions();
    showStatus("🍖 Yum! Your pet is eating...");
  });
});

$("playBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "emotionAction", action: "play" }, () => {
    loadEmotions();
    showStatus("🎾 Wheee! Playing is fun!");
  });
});

$("petBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "emotionAction", action: "pet" }, () => {
    loadEmotions();
    showStatus("💕 Purrrr... so happy!");
  });
});

// ══════════════════════════════════════
// ── MINI-GAME: Treat Catcher ──
// ══════════════════════════════════════
let gameRunning = false;
let gameScore = 0;
let gameInterval = null;
let catcher = null;
let treats = [];

function startGame() {
  if (gameRunning) return;
  gameRunning = true;
  gameScore = 0;
  treats = [];
  $("startGameBtn").disabled = true;
  $("startGameBtn").textContent = "Playing...";

  const canvas = $("gameCanvas");
  canvas.innerHTML = "";

  // Create catcher (the pet)
  catcher = document.createElement("div");
  catcher.style.cssText = `
    position:absolute; bottom:4px; left:50%; transform:translateX(-50%);
    width:40px; height:40px; font-size:28px; text-align:center; line-height:40px;
    transition: left 0.05s linear; user-select:none;
  `;
  catcher.textContent = "🐾";
  canvas.appendChild(catcher);

  // Score display
  const scoreEl = document.createElement("div");
  scoreEl.id = "gameScoreDisplay";
  scoreEl.style.cssText = "position:absolute;top:6px;right:10px;font-size:14px;font-weight:700;color:#f59e0b";
  scoreEl.textContent = "0";
  canvas.appendChild(scoreEl);

  // Timer
  const timerEl = document.createElement("div");
  timerEl.id = "gameTimer";
  timerEl.style.cssText = "position:absolute;top:6px;left:10px;font-size:12px;color:#888";
  canvas.appendChild(timerEl);

  let timeLeft = 30;
  timerEl.textContent = "⏱ " + timeLeft + "s";

  // Mouse/touch control
  const canvasRect = canvas.getBoundingClientRect;
  canvas.addEventListener("mousemove", (e) => {
    if (!gameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    catcher.style.left = Math.max(20, Math.min(rect.width - 20, x)) + "px";
    catcher.style.transform = "translateX(-50%)";
  });

  // Spawn treats
  gameInterval = setInterval(() => {
    if (!gameRunning) return;
    const treat = document.createElement("div");
    const treatTypes = ["🍖", "🦴", "🐟", "🧀", "🍗", "⭐", "💎"];
    const type = treatTypes[Math.floor(Math.random() * treatTypes.length)];
    const isSpecial = type === "⭐" || type === "💎";

    treat.style.cssText = `
      position:absolute; top:-30px; font-size:${isSpecial ? 24 : 20}px;
      left:${Math.random() * 85 + 5}%; transition:none; user-select:none;
    `;
    treat.textContent = type;
    treat.dataset.special = isSpecial ? "1" : "0";
    treat.dataset.y = -30;
    treat.dataset.speed = 1.5 + Math.random() * 2;
    canvas.appendChild(treat);
    treats.push(treat);
  }, 600);

  // Game loop
  const gameLoop = setInterval(() => {
    if (!gameRunning) { clearInterval(gameLoop); return; }

    const catcherRect = catcher.getBoundingClientRect();

    treats.forEach((t, i) => {
      let y = parseFloat(t.dataset.y) + parseFloat(t.dataset.speed);
      t.dataset.y = y;
      t.style.top = y + "px";

      // Check catch
      const tRect = t.getBoundingClientRect();
      if (
        tRect.bottom >= catcherRect.top &&
        tRect.right >= catcherRect.left &&
        tRect.left <= catcherRect.right &&
        y > 100
      ) {
        const pts = t.dataset.special === "1" ? 10 : 3;
        gameScore += pts;
        $("gameScoreDisplay").textContent = gameScore;

        // Catch effect
        t.style.transition = "transform 0.2s, opacity 0.2s";
        t.style.transform = "scale(1.5)";
        t.style.opacity = "0";
        setTimeout(() => t.remove(), 200);
        treats.splice(i, 1);
        return;
      }

      // Miss
      if (y > 190) {
        t.remove();
        treats.splice(i, 1);
      }
    });
  }, 16);

  // Timer countdown
  const countdown = setInterval(() => {
    timeLeft--;
    timerEl.textContent = "⏱ " + timeLeft + "s";
    if (timeLeft <= 0) {
      clearInterval(countdown);
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameRunning = false;
  clearInterval(gameInterval);
  treats.forEach((t) => t.remove());
  treats = [];

  $("startGameBtn").disabled = false;
  $("startGameBtn").textContent = "▶ Play Again";

  // Award points
  const earned = Math.floor(gameScore / 5);
  chrome.runtime.sendMessage({ type: "gameComplete", score: gameScore, points: earned }, (res) => {
    if (res?.highScore) $("highScore").textContent = res.highScore;
    $("gamePointsEarned").textContent = earned;
  });

  const canvas = $("gameCanvas");
  canvas.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff">
      <div style="font-size:36px;margin-bottom:8px">🎉</div>
      <div style="font-size:18px;font-weight:700">Score: ${gameScore}</div>
      <div style="font-size:12px;color:#888;margin-top:4px">+${earned} Season Rewards points earned!</div>
    </div>
  `;
}

$("startGameBtn").addEventListener("click", startGame);

// Touch support for Treat Catcher
$("gameCanvas").addEventListener("touchmove", (e) => {
  if (!gameRunning || !catcher) return;
  e.preventDefault();
  const touch = e.touches[0];
  const rect = $("gameCanvas").getBoundingClientRect();
  const x = touch.clientX - rect.left;
  catcher.style.left = Math.max(20, Math.min(rect.width - 20, x)) + "px";
  catcher.style.transform = "translateX(-50%)";
}, { passive: false });

// Load high score
chrome.runtime.sendMessage({ type: "getGameStats" }, (res) => {
  if (res?.highScore) $("highScore").textContent = res.highScore;
  if (res?.highScoreMemory) $("memoryHighScore").textContent = res.highScoreMemory;
});

// ══════════════════════════════════════
// ── GAME SELECTOR ──
// ══════════════════════════════════════
document.querySelectorAll(".game-select").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".game-select").forEach((b) => {
      b.style.background = "rgba(255,255,255,0.03)";
      b.style.color = "#888";
      b.classList.remove("active");
    });
    btn.style.background = "rgba(251,191,36,0.15)";
    btn.style.color = "#f59e0b";
    btn.classList.add("active");

    $("game-catcher").style.display = btn.dataset.game === "catcher" ? "" : "none";
    $("game-memory").style.display = btn.dataset.game === "memory" ? "" : "none";
  });
});

// ══════════════════════════════════════
// ── MEMORY MATCH GAME ──
// ══════════════════════════════════════
const MEMORY_EMOJIS = ["🐱", "🐶", "🐰", "🦊", "🐼", "🐨", "🦁", "🐸"];
let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = 0;
let memoryMoves = 0;
let memoryRunning = false;

function startMemoryGame() {
  if (memoryRunning) return;
  memoryRunning = true;
  memoryMatched = 0;
  memoryMoves = 0;
  memoryFlipped = [];
  $("memoryMoves").textContent = "0";
  $("startMemoryBtn").disabled = true;
  $("startMemoryBtn").textContent = "Playing...";

  // Create pairs
  const pairs = MEMORY_EMOJIS.slice(0, 6);
  memoryCards = [...pairs, ...pairs];
  // Shuffle
  for (let i = memoryCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [memoryCards[i], memoryCards[j]] = [memoryCards[j], memoryCards[i]];
  }

  const grid = $("memoryGrid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(4, 1fr)";

  memoryCards.forEach((emoji, idx) => {
    const card = document.createElement("div");
    card.style.cssText = `
      width:100%;aspect-ratio:1;background:rgba(255,255,255,0.06);border-radius:8px;
      display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;
      border:1px solid rgba(255,255,255,0.08);transition:all 0.3s;user-select:none;
    `;
    card.textContent = "❓";
    card.dataset.idx = idx;
    card.dataset.emoji = emoji;
    card.dataset.state = "hidden";

    card.addEventListener("click", () => flipCard(card));
    grid.appendChild(card);
  });
}

function flipCard(card) {
  if (!memoryRunning) return;
  if (card.dataset.state !== "hidden") return;
  if (memoryFlipped.length >= 2) return;

  card.dataset.state = "flipped";
  card.textContent = card.dataset.emoji;
  card.style.background = "rgba(251,191,36,0.15)";
  card.style.borderColor = "rgba(251,191,36,0.4)";
  memoryFlipped.push(card);

  if (memoryFlipped.length === 2) {
    memoryMoves++;
    $("memoryMoves").textContent = memoryMoves;

    const [a, b] = memoryFlipped;
    if (a.dataset.emoji === b.dataset.emoji) {
      // Match!
      a.dataset.state = "matched";
      b.dataset.state = "matched";
      a.style.background = "rgba(74,222,128,0.2)";
      b.style.background = "rgba(74,222,128,0.2)";
      a.style.borderColor = "rgba(74,222,128,0.4)";
      b.style.borderColor = "rgba(74,222,128,0.4)";
      memoryFlipped = [];
      memoryMatched++;

      if (memoryMatched === 6) {
        endMemoryGame();
      }
    } else {
      // No match — flip back
      setTimeout(() => {
        a.textContent = "❓";
        b.textContent = "❓";
        a.dataset.state = "hidden";
        b.dataset.state = "hidden";
        a.style.background = "rgba(255,255,255,0.06)";
        b.style.background = "rgba(255,255,255,0.06)";
        a.style.borderColor = "rgba(255,255,255,0.08)";
        b.style.borderColor = "rgba(255,255,255,0.08)";
        memoryFlipped = [];
      }, 600);
    }
  }
}

function endMemoryGame() {
  memoryRunning = false;
  $("startMemoryBtn").disabled = false;
  $("startMemoryBtn").textContent = "▶ Play Again";

  // Score: fewer moves = higher score (max 100 for perfect 6 moves)
  const score = Math.max(10, Math.round(100 * (6 / memoryMoves)));
  const earned = Math.floor(score / 5);

  chrome.runtime.sendMessage({ type: "gameComplete", score, points: earned, game: "memory" }, (res) => {
    if (res?.highScore) $("memoryHighScore").textContent = res.highScore;
    $("memoryPointsEarned").textContent = earned;
  });

  $("memoryGrid").innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:20px;color:#fff">
      <div style="font-size:36px;margin-bottom:8px">🧠</div>
      <div style="font-size:16px;font-weight:700">Completed in ${memoryMoves} moves!</div>
      <div style="font-size:12px;color:#888;margin-top:4px">Score: ${score} | +${earned} Season Rewards points</div>
    </div>
  `;
}

$("startMemoryBtn").addEventListener("click", startMemoryGame);

// ══════════════════════════════════════
// ── ACHIEVEMENTS ──
// ══════════════════════════════════════
function loadAchievements() {
  chrome.runtime.sendMessage({ type: "getAchievements" }, (res) => {
    if (!res) return;
    const unlocked = res.achievements || {};
    const defs = res.defs || [];
    const count = Object.keys(unlocked).length;
    $("achieveCount").textContent = `${count} / ${defs.length}`;

    const list = $("achieveList");
    list.innerHTML = defs.map((d) => {
      const got = !!unlocked[d.id];
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03);${got ? "" : "opacity:0.4"}">
          <div style="font-size:22px;width:32px;text-align:center;${got ? "" : "filter:grayscale(1)"}">${d.icon}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:${got ? "#fff" : "#666"}">${d.name}</div>
            <div style="font-size:10px;color:#888">${d.desc}</div>
          </div>
          <div style="font-size:10px;color:${got ? "#4ade80" : "#555"}">${got ? "✅" : "🔒"}</div>
        </div>
      `;
    }).join("");
  });
}

loadAchievements();

// ══════════════════════════════════════
// ── CONFIG ──
// ══════════════════════════════════════
chrome.runtime.sendMessage({ type: "getConfig" }, (res) => {
  if (!res?.config) return;
  const c = res.config;

  // SCRUM-49/53/55: render petName / avatar safely — never innerHTML user data
  function safeRenderAvatar(parent, url, name) {
    parent.replaceChildren();
    if (!url) {
      parent.textContent = c.petEmoji || "🐾";
      return;
    }
    // Reject non-http(s) URLs (blocks javascript:, data:, file: etc.)
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === "https:" || u.protocol === "http:";
    } catch {}
    if (!ok) { parent.textContent = "🐾"; return; }
    const img = document.createElement("img");
    img.src = url;                // assignment via property auto-escapes
    img.alt = name || "pet";       // alt via property — no HTML interpretation
    parent.appendChild(img);
  }
  window.__safeRenderAvatar = safeRenderAvatar;

  $("apiUrl").value = c.apiUrl || "https://app.myaipet.ai";
  $("petId").value = c.petId || 1;
  $("autoInterval").value = c.autoTalkInterval || 90;
  if ($("authToken")) $("authToken").value = c.authToken || "";
  if ($("syncStatus")) {
    $("syncStatus").textContent = c.authToken
      ? "✓ Server sync on — pulls live pet stats every 3 min"
      : "Local-only mode. Paste a JWT to mirror your app pet.";
    $("syncStatus").style.color = c.authToken ? "#4ade80" : "#888";
  }
  $("petName").textContent = c.petName || "My Pet";
  $("petLevel").textContent = `Lv.${c.level || 1}`;
  $("petPersonality").textContent = c.personality || "playful";

  safeRenderAvatar($("avatar"), c.avatarUrl, c.petName);

  // Load preferences
  const prefs = c.preferences || {};
  if (prefs.notifications === false) $("toggleNotifs").classList.remove("on");
  if (prefs.particles === false) $("toggleParticles").classList.remove("on");
  if (prefs.autoTalk === false) $("toggleAutoTalk").classList.remove("on");
  if (prefs.sound === true) $("toggleSound").classList.add("on");
});

// Save
$("saveBtn").addEventListener("click", () => {
  const apiUrl = $("apiUrl").value.trim().replace(/\/$/, "");
  const petId = parseInt($("petId").value) || 1;
  const autoTalkInterval = parseInt($("autoInterval").value) || 90;
  const authToken = $("authToken") ? $("authToken").value.trim() : "";

  chrome.runtime.sendMessage({
    type: "saveConfig",
    config: { apiUrl, petId, autoTalkInterval, authToken, enabled: true },
  }, () => {
    chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
      if (res?.config) {
        $("petName").textContent = res.config.petName;
        $("petLevel").textContent = `Lv.${res.config.level}`;
        $("petPersonality").textContent = res.config.personality;
        if (res.config.avatarUrl) {
          window.__safeRenderAvatar?.($("avatar"), res.config.avatarUrl, res.config.petName);
        } else {
          $("avatar").textContent = res.config.petEmoji || "🐾";
        }
        showStatus("✅ Connected! Pet info loaded.");
      } else {
        showStatus("⚠️ Saved, but couldn't reach API", true);
      }
    });
  });
});

// Export
$("exportBtn").addEventListener("click", () => {
  showStatus("Exporting SOUL data...");
  chrome.runtime.sendMessage({ type: "exportSoul" }, (res) => {
    if (res?.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${$("petName").textContent}_SOUL.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus("✅ SOUL exported!");
    } else {
      showStatus("❌ Export failed", true);
    }
  });
});

// SCRUM-20: Import SOUL JSON
$("importBtn")?.addEventListener("click", () => {
  $("importFile").click();
});

$("importFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 1500000) {
    showStatus("❌ File too large (>1.5MB)", true);
    return;
  }
  showStatus("Importing SOUL data...");
  try {
    const text = await file.text();
    let soul;
    try { soul = JSON.parse(text); } catch {
      showStatus("❌ Not a valid JSON file", true);
      return;
    }
    chrome.runtime.sendMessage({ type: "importSoul", soul }, (res) => {
      if (res?.success) {
        showStatus(`✅ Imported "${res.petName || "pet"}"`);
        // Refresh pet info so the new pet shows up
        setTimeout(() => chrome.runtime.sendMessage({ type: "fetchPetInfo" }), 500);
      } else {
        showStatus("❌ " + (res?.error || "Import failed — server rejected payload"), true);
      }
    });
  } catch (err) {
    showStatus("❌ Import error: " + (err.message || "unknown"), true);
  }
  e.target.value = ""; // reset for next pick
});

// Refresh
$("refreshBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
    if (res?.config) {
      $("petName").textContent = res.config.petName;
      $("petLevel").textContent = `Lv.${res.config.level}`;
      $("petPersonality").textContent = res.config.personality;
      if (res.config.avatarUrl) {
        window.__safeRenderAvatar?.($("avatar"), res.config.avatarUrl, res.config.petName);
      }
      showStatus("✅ Refreshed!");
      loadEvolution();
      loadEmotions();
    } else {
      showStatus("❌ Couldn't reach API", true);
    }
  });
});

// Reset
$("resetBtn").addEventListener("click", () => {
  if (confirm("Reset all points? This cannot be undone!")) {
    chrome.runtime.sendMessage({ type: "resetPoints" }, () => {
      showStatus("🗑️ Points reset.");
      loadPoints();
      loadEvolution();
    });
  }
});
