/**
 * MY AI PET v2.0 — Popup Controller
 * Tabs, Points, Evolution, Emotions, Mini-Game, Settings
 */

const $ = (id) => document.getElementById(id);

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
      <div style="font-size:12px;color:#888;margin-top:4px">+${earned} airdrop points earned!</div>
    </div>
  `;
}

$("startGameBtn").addEventListener("click", startGame);

// Load high score
chrome.runtime.sendMessage({ type: "getGameStats" }, (res) => {
  if (res?.highScore) $("highScore").textContent = res.highScore;
});

// ══════════════════════════════════════
// ── CONFIG ──
// ══════════════════════════════════════
chrome.runtime.sendMessage({ type: "getConfig" }, (res) => {
  if (!res?.config) return;
  const c = res.config;

  $("apiUrl").value = c.apiUrl || "http://localhost:3000";
  $("petId").value = c.petId || 1;
  $("autoInterval").value = c.autoTalkInterval || 90;
  $("petName").textContent = c.petName || "My Pet";
  $("petLevel").textContent = `Lv.${c.level || 1}`;
  $("petPersonality").textContent = c.personality || "playful";

  if (c.avatarUrl) {
    $("avatar").innerHTML = `<img src="${c.avatarUrl}" alt="${c.petName}" />`;
  } else {
    $("avatar").textContent = c.petEmoji || "🐾";
  }

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

  chrome.runtime.sendMessage({
    type: "saveConfig",
    config: { apiUrl, petId, autoTalkInterval, enabled: true },
  }, () => {
    chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
      if (res?.config) {
        $("petName").textContent = res.config.petName;
        $("petLevel").textContent = `Lv.${res.config.level}`;
        $("petPersonality").textContent = res.config.personality;
        if (res.config.avatarUrl) {
          $("avatar").innerHTML = `<img src="${res.config.avatarUrl}" alt="${res.config.petName}" />`;
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

// Refresh
$("refreshBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
    if (res?.config) {
      $("petName").textContent = res.config.petName;
      $("petLevel").textContent = `Lv.${res.config.level}`;
      $("petPersonality").textContent = res.config.personality;
      if (res.config.avatarUrl) {
        $("avatar").innerHTML = `<img src="${res.config.avatarUrl}" alt="${res.config.petName}" />`;
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
