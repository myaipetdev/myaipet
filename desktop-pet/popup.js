/**
 * MY AI PET — Popup Controller
 * Tabs, Points, Evolution, Emotions, Mini-Game, Settings
 */

const $ = (id) => document.getElementById(id);
const EXTENSION_TOKEN_PATTERN = /^pex_[A-Za-z0-9_-]{32,128}$/;
let latestConfig = null;

// popup.html can be opened outside an installed extension (packaging preview / QA
// in a plain browser tab). There chrome.* is undefined, so every top-level
// initializer that messages the service worker would throw on load. Guard on this
// flag and render a calm placeholder instead. Inside a real installed extension
// chrome.* exists and everything behaves as before.
const EXT_VERSION = "2.3.3"; // build-time fallback; keep in sync with manifest version
const HAS_CHROME =
  typeof chrome !== "undefined" &&
  !!chrome.runtime &&
  typeof chrome.runtime.sendMessage === "function";

function safeRenderAvatar(parent, url, name, fallback = "🐾") {
  parent.replaceChildren();
  if (!url) {
    parent.textContent = fallback;
    return;
  }
  let ok = false;
  if (/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    ok = true;
  } else {
    try {
      const parsed = new URL(url);
      ok = parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {}
  }
  if (!ok) { parent.textContent = fallback; return; }
  const img = document.createElement("img");
  img.src = url;
  img.alt = name || "pet";
  parent.appendChild(img);
}

function renderPetConfig(c) {
  latestConfig = c;
  $("petName").textContent = c.petName || "Demo Pet";
  $("petLevel").textContent = `Lv.${c.level || 1}`;
  $("petPersonality").textContent = c.personality || "playful";
  $("petId").value = c.petId || "";
  safeRenderAvatar($("avatar"), c.avatarUrl, c.petName, c.petEmoji || "🐾");
  const demoBadge = $("demoBadge");
  const hasToken = EXTENSION_TOKEN_PATTERN.test(String(c.authToken || ""));
  const paired = Boolean(hasToken && c.petId && !c.needsPairing);
  if (demoBadge) demoBadge.style.display = paired ? "none" : "inline-block";
  if ($("syncStatus")) {
    $("syncStatus").textContent = hasToken
      ? (paired
          ? "✓ Linked — shows your pet and refreshes live stats every 3 minutes."
          : "Token saved, but pairing is unavailable. Check your connection or create a new token.")
      : "Not linked yet. Generate a limited extension token (pex_…) in the PetClaw dashboard.";
    $("syncStatus").style.color = paired ? "var(--terracotta)" : "var(--muted)";
  }
  if (!$("saveBtn").hasAttribute("aria-busy")) $("saveBtn").textContent = paired ? "Update Pairing" : "Pair Extension";
  $("exportBtn").disabled = !paired;
  $("importBtn").disabled = !hasToken;
  $("refreshBtn").disabled = !hasToken;
  $("disconnectBtn").disabled = !hasToken;
  $("resumeSitesBtn").disabled = !Array.isArray(c.pausedHosts) || c.pausedHosts.length === 0;
}

// Stamp the footer with the live manifest version so it never drifts stale.
// Falls back to the build-time constant when getManifest() is unavailable so the
// footer never goes blank outside an installed extension.
try {
  const vEl = $("version-line");
  const version =
    (HAS_CHROME && typeof chrome.runtime.getManifest === "function"
      ? chrome.runtime.getManifest().version
      : null) || EXT_VERSION;
  if (vEl) vEl.textContent = `MY AI PET v${version} — PetClaw`;
} catch {
  const vEl = $("version-line");
  if (vEl) vEl.textContent = `MY AI PET v${EXT_VERSION} — PetClaw`;
}

// ══════════════════════════════════════
// ── TABS ──
// ══════════════════════════════════════
const popupTabs = Array.from(document.querySelectorAll(".tab"));

function activateTab(tab, moveFocus = false) {
  popupTabs.forEach((candidate) => {
    const selected = candidate === tab;
    candidate.classList.toggle("active", selected);
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = $("tab-" + candidate.dataset.tab);
    panel?.classList.toggle("active", selected);
    if (panel) panel.hidden = !selected;
  });
  if (moveFocus) tab.focus();
}

popupTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % popupTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + popupTabs.length) % popupTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = popupTabs.length - 1;
    else return;
    event.preventDefault();
    activateTab(popupTabs[nextIndex], true);
  });
});

// ══════════════════════════════════════
// ── STATUS ──
// ══════════════════════════════════════
let statusTimer = null;

function showStatus(msg, isError = false) {
  const el = $("status");
  if (statusTimer) clearTimeout(statusTimer);
  el.textContent = msg;
  el.className = isError ? "error" : "";
  el.setAttribute("aria-live", isError ? "assertive" : "polite");
  el.style.display = "block";
  statusTimer = setTimeout(() => { el.style.display = "none"; }, 3000);
}

function setButtonBusy(id, busy, busyLabel) {
  const button = $(id);
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    if (button.dataset.wasDisabled == null) button.dataset.wasDisabled = String(button.disabled);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (busyLabel) button.textContent = busyLabel;
  } else {
    button.disabled = button.dataset.wasDisabled === "true";
    button.removeAttribute("aria-busy");
    if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
    delete button.dataset.wasDisabled;
  }
}

// ══════════════════════════════════════
// ── TOGGLES ──
// ══════════════════════════════════════
document.querySelectorAll(".toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    if (toggle.disabled) return;
    const previous = toggle.classList.contains("on");
    const key = toggle.dataset.key;
    // Revert the optimistic visual flip and re-enable the control.
    const revert = () => {
      toggle.classList.toggle("on", previous);
      toggle.setAttribute("aria-pressed", String(previous));
      toggle.disabled = false;
      toggle.removeAttribute("aria-busy");
    };
    toggle.classList.toggle("on");
    const val = toggle.classList.contains("on");
    toggle.setAttribute("aria-pressed", String(val));
    toggle.disabled = true;
    toggle.setAttribute("aria-busy", "true");
    if (!HAS_CHROME) {
      revert();
      showStatus("Preferences are only available inside the installed extension", true);
      return;
    }
    // A synchronous throw from sendMessage (worker gone, invalidated context)
    // must not leave the toggle stuck disabled + aria-busy.
    try {
      chrome.runtime.sendMessage({ type: "setPreference", key, value: val }, (res) => {
        const runtimeError = chrome.runtime.lastError;
        toggle.disabled = false;
        toggle.removeAttribute("aria-busy");
        if (runtimeError || !res?.success) {
          toggle.classList.toggle("on", previous);
          toggle.setAttribute("aria-pressed", String(previous));
          showStatus(res?.error || "Preference could not be saved", true);
          return;
        }
        if (key === "enabled") {
          showStatus(val ? "Companion enabled — reload open tabs to show it." : "Companion disabled on open tabs.");
          refreshSiteAccess();
        }
      });
    } catch (error) {
      revert();
      showStatus(error?.message || "Preference could not be saved", true);
    }
  });
});

// ══════════════════════════════════════
// ── POINTS ──
// ══════════════════════════════════════
function loadPoints() {
  if (!HAS_CHROME) return;
  chrome.runtime.sendMessage({ type: "getActivity" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    const p = res.points || {};
    $("totalPoints").textContent = (p.totalPoints || 0).toLocaleString();
    $("chatPoints").textContent = p.chatPoints || 0;
    $("heartbeatPoints").textContent = p.heartbeatPoints || 0;
    $("skillPoints").textContent = p.skillPoints || 0;
    $("browsingPoints").textContent = p.browsingPoints || 0;
    $("gamePoints").textContent = p.gamePoints || 0;
    $("evolutionPoints").textContent = p.evolutionPoints || 0;
    $("carePoints").textContent = p.carePoints || 0;
    $("streak").textContent = p.dailyStreak || 0;
    $("chatCount").textContent = p.chatCount || 0;
    $("uptime").textContent = res.uptime || 0;

    // Update notifications
    if (res.notifications && res.notifications.length > 0) {
      renderNotifications(res.notifications);
    }
  });
}

// Account season sync — shows that the extension's ambient care is linked to the
// signed-in account (real, non-financial season score), plus today's share.
function loadSeasonSync() {
  if (!HAS_CHROME) return;
  chrome.runtime.sendMessage({ type: "getSeasonSync" }, (res) => {
    const panel = $("seasonSync");
    const out = $("seasonSyncSignedOut");
    if (!res || !res.signedIn || !res.data) {
      if (panel) panel.style.display = "none";
      if (out) out.style.display = "block";
      return;
    }
    if (out) out.style.display = "none";
    if (panel) panel.style.display = "block";
    const d = res.data;
    if ($("seasonTotal")) $("seasonTotal").textContent = (d.seasonTotal || 0).toLocaleString();
    const today = d.today && d.today.total ? d.today.total : 0;
    if ($("seasonToday")) {
      $("seasonToday").textContent = today > 0
        ? `+${today} today from your pet`
        : "your pet's care adds here";
    }
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderNotifications(notifs) {
  const list = $("notifList");
  list.innerHTML = notifs
    .slice(-10)
    .reverse()
    .map((n) => `
      <div class="notif-item">
        <div class="icon">${escapeHtml(n.icon || "📌")}</div>
        <div class="text">${escapeHtml(n.text)}</div>
        <div class="time">${escapeHtml(n.time || "")}</div>
      </div>
    `)
    .join("");
}

loadPoints();
loadSeasonSync();
if (HAS_CHROME) {
  setInterval(loadPoints, 5000);
  setInterval(loadSeasonSync, 30000);
}

// ══════════════════════════════════════
// ── DAILY QUESTS ──
// ══════════════════════════════════════
function loadQuests() {
  if (!HAS_CHROME) {
    const list = $("questList");
    if (list) list.innerHTML = '<div class="empty-note">Daily quests appear inside the installed extension.</div>';
    return;
  }
  chrome.runtime.sendMessage({ type: "getDailyQuests" }, (res) => {
    if (!res?.quests) return;
    const list = $("questList");
    list.innerHTML = res.quests.map((q) => {
      const progress = Math.max(0, Number(q.progress) || 0);
      const target = Math.max(1, Number(q.target) || 1);
      const reward = Math.max(0, Number(q.reward) || 0);
      const pct = Math.min(100, Math.round((progress / target) * 100));
      const done = q.completed;
      const claimed = q.claimed;
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line-soft)">
          <div style="font-size:16px;flex-shrink:0">${escapeHtml(q.icon)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:${done ? "var(--terracotta)" : "var(--ink)"};font-weight:700">${escapeHtml(q.name)}</div>
            <div style="font-size:9px;color:var(--muted)">${escapeHtml(q.desc)}</div>
            <div style="margin-top:3px;height:5px;background:var(--field);border:1px solid var(--line);border-radius:2px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${done ? "var(--terracotta)" : "var(--foil-deep)"};transition:width 0.3s"></div>
            </div>
          </div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted);text-align:right;flex-shrink:0">
            ${claimed ? '<span style="color:var(--terracotta)">✅</span>' :
              done ? `<button type="button" class="quest-claim" data-id="${escapeHtml(q.id)}" style="padding:3px 8px;border:1px solid var(--terracotta-ink);border-radius:6px;background:var(--terracotta);color:var(--paper);font-family:var(--mono);font-size:9px;font-weight:700;cursor:pointer">+${reward}</button>` :
              `${progress}/${target}`}
          </div>
        </div>
      `;
    }).join("");

    // Claim buttons
    list.querySelectorAll(".quest-claim").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idleLabel = btn.textContent;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.textContent = "…";
        chrome.runtime.sendMessage({ type: "claimQuest", questId: btn.dataset.id }, (r) => {
          const runtimeError = chrome.runtime.lastError;
          if (r?.success) {
            loadQuests();
            loadPoints();
            loadEvolution();
            loadAchievements();
            showStatus(`✅ +${r.reward} Play Points!`);
          } else {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.textContent = idleLabel;
            showStatus(runtimeError ? "Quest claim is unavailable" : "Quest was already claimed or is not complete", true);
          }
        });
      });
    });
  });
}

loadQuests();
if (HAS_CHROME) setInterval(loadQuests, 10000);

// ══════════════════════════════════════
// ── EVOLUTION ──
// ══════════════════════════════════════
const EVO_STAGES = [
  { name: "Egg", icon: "🥚", xp: 0, desc: "Your pet is just beginning its journey..." },
  { name: "Baby", icon: "🐣", xp: 100, desc: "Just hatched! So cute and curious!" },
  { name: "Young", icon: "🐾", xp: 500, desc: "Growing fast and learning new tricks!" },
  { name: "Adult", icon: "⚡", xp: 1500, desc: "Energetic and full of personality!" },
  { name: "Elder", icon: "🔥", xp: 5000, desc: "Powerful and wise, a true companion!" },
  { name: "Legendary", icon: "👑", xp: 15000, desc: "A legendary pet! The ultimate form!" },
];

const EVO_PERKS = [
  "Egg: Base local companion",
  "Baby: Subtle aura and sparkle accents",
  "Young: Stronger aura and leaf particles",
  "Adult: Pulsing aura and lightning accents",
  "Elder: Layered fire and foil aura",
  "Legendary: Crown aura and 2× local Play Points",
];

function loadEvolution() {
  if (!HAS_CHROME) return;
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
      const clampedProgress = Math.min(100, Math.max(0, progress));
      $("evoProgressBar").style.width = clampedProgress + "%";
      $("evoProgress").setAttribute("aria-valuenow", String(Math.round(clampedProgress)));
      $("evoProgressText").textContent = `${evo.xp} / ${next.xp} XP to ${next.name}`;
    } else {
      $("evoProgressBar").style.width = "100%";
      $("evoProgress").setAttribute("aria-valuenow", "100");
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
      return `<div style="padding:4px 0;color:${unlocked ? "var(--terracotta)" : "var(--muted-soft)"}">${unlocked ? "✅" : "🔒"} ${p}</div>`;
    }).join("");
  });
}

loadEvolution();

// ══════════════════════════════════════
// ── EMOTIONS ──
// ══════════════════════════════════════
function loadEmotions() {
  if (!HAS_CHROME) return;
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
if (HAS_CHROME) setInterval(loadEmotions, 10000);

// Emotion action buttons
function runEmotionAction(buttonId, action, successMessage) {
  if (!HAS_CHROME) {
    showStatus("Pet care is only available inside the installed extension", true);
    return;
  }
  setButtonBusy(buttonId, true, "Working…");
  chrome.runtime.sendMessage({ type: "emotionAction", action }, (res) => {
    const runtimeError = chrome.runtime.lastError;
    setButtonBusy(buttonId, false);
    if (runtimeError || !res?.emotions) {
      showStatus(res?.error || "PetClaw is unavailable right now", true);
      return;
    }
    loadEmotions();
    loadPoints();
    loadEvolution();
    loadAchievements();
    showStatus(successMessage);
  });
}

$("feedBtn").addEventListener("click", () => runEmotionAction("feedBtn", "feed", "🍖 Yum! Your pet is eating..."));
$("playBtn").addEventListener("click", () => runEmotionAction("playBtn", "play", "🎾 Wheee! Playing is fun!"));
$("petBtn").addEventListener("click", () => runEmotionAction("petBtn", "pet", "💕 Purrrr... so happy!"));

// ══════════════════════════════════════
// ── MINI-GAME: Treat Catcher ──
// ══════════════════════════════════════
let gameRunning = false;
let gameScore = 0;
let gameInterval = null;
let catcher = null;
let treats = [];
let gameMouseHandler = null;

function startGame() {
  if (gameRunning) return;
  gameRunning = true;
  gameScore = 0;
  treats = [];
  $("startGameBtn").disabled = true;
  $("startGameBtn").textContent = "Playing...";

  const canvas = $("gameCanvas");
  canvas.innerHTML = "";
  canvas.focus();

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
  scoreEl.style.cssText = "position:absolute;top:6px;right:10px;font-family:var(--mono);font-size:14px;font-weight:700;color:var(--terracotta)";
  scoreEl.textContent = "0";
  canvas.appendChild(scoreEl);

  // Timer
  const timerEl = document.createElement("div");
  timerEl.id = "gameTimer";
  timerEl.style.cssText = "position:absolute;top:6px;left:10px;font-family:var(--mono);font-size:12px;color:var(--muted)";
  canvas.appendChild(timerEl);

  let timeLeft = 30;
  timerEl.textContent = "⏱ " + timeLeft + "s";

  // Mouse/touch control — remove any handler from a previous round so listeners
  // don't stack on the persistent canvas node across "Play Again".
  if (gameMouseHandler) canvas.removeEventListener("mousemove", gameMouseHandler);
  gameMouseHandler = (e) => {
    if (!gameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    catcher.style.left = Math.max(20, Math.min(rect.width - 20, x)) + "px";
    catcher.style.transform = "translateX(-50%)";
  };
  canvas.addEventListener("mousemove", gameMouseHandler);

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

    // Iterate backwards so splice() doesn't skip the next treat mid-loop.
    for (let i = treats.length - 1; i >= 0; i--) {
      const t = treats[i];
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
        continue;
      }

      // Miss
      if (y > 190) {
        t.remove();
        treats.splice(i, 1);
      }
    }
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
  if (gameMouseHandler) {
    $("gameCanvas").removeEventListener("mousemove", gameMouseHandler);
    gameMouseHandler = null;
  }
  treats.forEach((t) => t.remove());
  treats = [];

  $("startGameBtn").disabled = false;
  $("startGameBtn").textContent = "▶ Play Again";

  // Award points
  const earned = Math.floor(gameScore / 5);
  if (HAS_CHROME) {
    chrome.runtime.sendMessage({ type: "gameComplete", score: gameScore, points: earned }, (res) => {
      if (res?.highScore != null) $("highScore").textContent = res.highScore;
      $("gamePointsEarned").textContent = res?.awardedPoints ?? 0;
      if (!chrome.runtime.lastError && res) {
        loadPoints();
        loadEvolution();
        loadAchievements();
      }
    });
  }

  const canvas = $("gameCanvas");
  canvas.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--ink)">
      <div style="font-size:36px;margin-bottom:8px">🎉</div>
      <div style="font-family:var(--mono);font-size:18px;font-weight:700">Score: ${gameScore}</div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px">+${earned} Play Points earned!</div>
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

$("gameCanvas").addEventListener("keydown", (event) => {
  if (!gameRunning || !catcher || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const canvasRect = $("gameCanvas").getBoundingClientRect();
  const catcherRect = catcher.getBoundingClientRect();
  const current = catcherRect.left - canvasRect.left + catcherRect.width / 2;
  const delta = event.key === "ArrowLeft" ? -24 : 24;
  catcher.style.left = Math.max(20, Math.min(canvasRect.width - 20, current + delta)) + "px";
  catcher.style.transform = "translateX(-50%)";
});

// Load high score
if (HAS_CHROME) {
  chrome.runtime.sendMessage({ type: "getGameStats" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    if (res.highScore) $("highScore").textContent = res.highScore;
    if (res.highScoreMemory) $("memoryHighScore").textContent = res.highScoreMemory;
  });
}

// ══════════════════════════════════════
// ── GAME SELECTOR ──
// ══════════════════════════════════════
document.querySelectorAll(".game-select").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".game-select").forEach((b) => {
      b.style.background = "var(--paper)";
      b.style.color = "var(--muted)";
      b.style.borderColor = "var(--line)";
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.style.background = "var(--terracotta)";
    btn.style.color = "var(--paper)";
    btn.style.borderColor = "var(--terracotta-ink)";
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");

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
    const card = document.createElement("button");
    card.type = "button";
    card.setAttribute("aria-label", `Hidden memory card ${idx + 1}`);
    card.style.cssText = `
      width:100%;aspect-ratio:1;background:var(--paper);border-radius:8px;
      display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;
      border:1px solid var(--line);padding:0;font-family:inherit;box-shadow:2px 2px 0 rgba(33,26,18,0.10);transition:all 0.3s;user-select:none;
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
  card.setAttribute("aria-label", `Card ${Number(card.dataset.idx) + 1}: ${card.dataset.emoji}`);
  card.style.background = "var(--field)";
  card.style.borderColor = "var(--foil-deep)";
  memoryFlipped.push(card);

  if (memoryFlipped.length === 2) {
    memoryMoves++;
    $("memoryMoves").textContent = memoryMoves;

    const [a, b] = memoryFlipped;
    if (a.dataset.emoji === b.dataset.emoji) {
      // Match!
      a.dataset.state = "matched";
      b.dataset.state = "matched";
      a.disabled = true;
      b.disabled = true;
      a.setAttribute("aria-label", `Matched ${a.dataset.emoji}`);
      b.setAttribute("aria-label", `Matched ${b.dataset.emoji}`);
      a.style.background = "rgba(190,79,40,0.16)";
      b.style.background = "rgba(190,79,40,0.16)";
      a.style.borderColor = "var(--terracotta)";
      b.style.borderColor = "var(--terracotta)";
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
        a.setAttribute("aria-label", `Hidden memory card ${Number(a.dataset.idx) + 1}`);
        b.setAttribute("aria-label", `Hidden memory card ${Number(b.dataset.idx) + 1}`);
        a.style.background = "var(--paper)";
        b.style.background = "var(--paper)";
        a.style.borderColor = "var(--line)";
        b.style.borderColor = "var(--line)";
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

  if (HAS_CHROME) {
    chrome.runtime.sendMessage({ type: "gameComplete", score, points: earned, game: "memory" }, (res) => {
      if (res?.highScoreMemory != null) $("memoryHighScore").textContent = res.highScoreMemory;
      $("memoryPointsEarned").textContent = res?.awardedPoints ?? 0;
      if (!chrome.runtime.lastError && res) {
        loadPoints();
        loadEvolution();
        loadAchievements();
      }
    });
  }

  $("memoryGrid").innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--ink)">
      <div style="font-size:36px;margin-bottom:8px">🧠</div>
      <div style="font-family:var(--mono);font-size:16px;font-weight:700">Completed in ${memoryMoves} moves!</div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px">Score: ${score} | +${earned} Play Points</div>
    </div>
  `;
}

$("startMemoryBtn").addEventListener("click", startMemoryGame);

// ══════════════════════════════════════
// ── ACHIEVEMENTS ──
// ══════════════════════════════════════
const ACHIEVE_EMPTY = '<div class="empty-note">Care for your pet to earn badges.</div>';

function loadAchievements() {
  const list = $("achieveList");
  if (!HAS_CHROME) {
    if ($("achieveCount")) $("achieveCount").textContent = "0 / 0";
    if (list) list.innerHTML = ACHIEVE_EMPTY;
    return;
  }
  chrome.runtime.sendMessage({ type: "getAchievements" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      if (list) list.innerHTML = ACHIEVE_EMPTY;
      return;
    }
    const unlocked = res.achievements || {};
    const defs = res.defs || [];
    const count = Object.keys(unlocked).length;
    $("achieveCount").textContent = `${count} / ${defs.length}`;

    if (defs.length === 0) {
      if (list) list.innerHTML = ACHIEVE_EMPTY;
      return;
    }

    list.innerHTML = defs.map((d) => {
      const got = !!unlocked[d.id];
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft);${got ? "" : "opacity:0.45"}">
          <div style="font-size:22px;width:32px;text-align:center;${got ? "" : "filter:grayscale(1)"}">${d.icon}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;color:${got ? "var(--ink)" : "var(--muted)"}">${d.name}</div>
            <div style="font-size:10px;color:var(--muted)">${d.desc}</div>
          </div>
          <div style="font-size:10px;color:${got ? "var(--terracotta)" : "var(--muted-soft)"}">${got ? "✅" : "🔒"}</div>
        </div>
      `;
    }).join("");
  });
}

loadAchievements();

// ══════════════════════════════════════
// ── EXPLICIT PER-SITE ACCESS ──
// ══════════════════════════════════════
let currentSiteAccess = null;

async function refreshSiteAccess() {
  const button = $("siteAccessBtn");
  const status = $("siteAccessStatus");
  if (!HAS_CHROME || !chrome.tabs) {
    if (status) status.textContent = "Website access is managed inside the installed extension.";
    if (button) {
      button.textContent = "Website access unavailable";
      button.disabled = true;
    }
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error("Open a regular website first");
    const info = await chrome.runtime.sendMessage({ type: "getSiteAccessInfo", url: tab.url });
    currentSiteAccess = { ...info, tabId: tab.id, url: tab.url };
    if (!info?.supported) {
      let unavailableReason = info?.error || "PetClaw cannot run on this browser page.";
      try {
        const currentHost = new URL(tab.url).hostname.toLowerCase().replace(/\.+$/, "");
        if (!info?.error && (currentHost === "myaipet.ai" || currentHost.endsWith(".myaipet.ai"))) {
          unavailableReason = "MY AI PET already has its own companion. Open a regular, non-sensitive website and reopen this popup to grant access there.";
        } else if (!info?.error && /^https?:/.test(tab.url)) {
          unavailableReason = "PetClaw blocks access on this sensitive website. Keep it off here and open a regular website instead.";
        }
      } catch {}
      status.textContent = unavailableReason;
      button.textContent = "Website access unavailable";
      button.disabled = true;
      return;
    }
    if (info.active && info.enabled === false) {
      status.textContent = `Access is granted on ${info.host}, but the companion is disabled globally below.`;
      button.textContent = `Remove access to ${info.host}`;
    } else if (info.active && info.paused) {
      status.textContent = `Paused on ${info.host}. Access remains granted; resume below, then reload the tab.`;
      button.textContent = `Remove access to ${info.host}`;
    } else if (info.active) {
      status.textContent = `Active on ${info.host}. No other site was granted by this action.`;
      button.textContent = `Remove access to ${info.host}`;
    } else if (info.granted) {
      status.textContent = `Permission exists for ${info.host}, but PetClaw is not active there.`;
      button.textContent = `Remove inactive access to ${info.host}`;
    } else {
      status.textContent = `Not allowed on ${info.host}. Nothing from this page is accessible yet.`;
      button.textContent = `Allow on ${info.host}`;
    }
    delete button.dataset.idleLabel;
    button.classList.toggle("btn-danger", info.granted === true);
    button.classList.toggle("btn-secondary", info.granted !== true);
    button.disabled = false;
  } catch (error) {
    currentSiteAccess = null;
    status.textContent = error?.message || "Website access could not be checked.";
    button.textContent = "Website access unavailable";
    button.disabled = true;
  }
}

$("siteAccessBtn").addEventListener("click", () => {
  const state = currentSiteAccess;
  if (!state?.supported || !state.pattern) return;
  setButtonBusy("siteAccessBtn", true, state.granted ? "Removing access…" : "Requesting access…");

  if (state.granted) {
    chrome.runtime.sendMessage({ type: "removeSiteAccess", url: state.url, tabId: state.tabId }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      setButtonBusy("siteAccessBtn", false);
      if (runtimeError || !result?.success) {
        showStatus(result?.error || "Could not remove website access", true);
        refreshSiteAccess();
        return;
      }
      showStatus(`Access removed from ${state.host}`);
      refreshSiteAccess();
    });
    return;
  }

  const activate = () => {
    chrome.runtime.sendMessage({ type: "registerSiteAccess", url: state.url, tabId: state.tabId }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      setButtonBusy("siteAccessBtn", false);
      if (runtimeError || !result?.success) {
        showStatus(result?.error || "Website access could not be activated", true);
        // Avoid retaining host permission when registration or tab validation
        // fails. Chrome can re-grant a previously removed optional permission.
        chrome.permissions.remove({ origins: [state.pattern] }, () => refreshSiteAccess());
        return;
      } else if (state.enabled === false) {
        showStatus(`Access enabled for ${state.host}. Enable the companion below, then reload this tab.`);
      } else if (state.paused) {
        showStatus(`Access enabled for ${state.host}. Resume paused sites below, then reload this tab.`);
      } else if (result.reloadRequired) {
        showStatus(`Access enabled for ${state.host}. Reload this tab to show PetClaw.`);
      } else {
        showStatus(`PetClaw is now enabled on ${state.host}`);
      }
      refreshSiteAccess();
    });
  };

  // Permission prompts are issued only inside this direct user click handler.
  chrome.permissions.request({ origins: [state.pattern] }, (granted) => {
    const permissionError = chrome.runtime.lastError;
    if (permissionError || !granted) {
      setButtonBusy("siteAccessBtn", false);
      showStatus("Website access was not granted", true);
      refreshSiteAccess();
      return;
    }
    activate();
  });
});

refreshSiteAccess();

// ══════════════════════════════════════
// ── CONFIG ──
// ══════════════════════════════════════
if (HAS_CHROME) chrome.runtime.sendMessage({ type: "getConfig" }, (res) => {
  if (chrome.runtime.lastError || !res?.config) return;
  const c = res.config;

  $("apiUrl").value = c.apiUrl || "https://app.myaipet.ai";
  $("petId").value = c.petId || "";
  $("autoInterval").value = c.autoTalkInterval || 90;
  if ($("authToken")) $("authToken").value = c.authToken || "";
  if ($("syncStatus")) {
    $("syncStatus").textContent = c.authToken
      ? (c.needsPairing
          ? "Token saved, but no pet found — create a new extension token and try again."
          : "✓ Linked — shows your pet, pulls live stats every 3 min")
      : "Not linked yet. Generate a limited extension token (pex_…) in the PetClaw dashboard.";
    $("syncStatus").style.color = (c.authToken && !c.needsPairing) ? "var(--terracotta)" : "var(--muted)";
  }
  renderPetConfig(c);

  // Load preferences
  const prefs = c.preferences || {};
  if (c.enabled === false) $("toggleEnabled").classList.remove("on");
  if (prefs.notifications === false) $("toggleNotifs").classList.remove("on");
  if (prefs.particles === false) $("toggleParticles").classList.remove("on");
  if (prefs.autoTalk !== true) $("toggleAutoTalk").classList.remove("on");
  if (prefs.pageAwareness !== true) $("togglePageAwareness").classList.remove("on");
  document.querySelectorAll(".toggle").forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(toggle.classList.contains("on")));
  });
});

// Save
$("saveBtn").addEventListener("click", () => {
  if (!HAS_CHROME) {
    showStatus("Pairing is only available inside the installed extension", true);
    return;
  }
  const apiUrl = "https://app.myaipet.ai";
  const petId = parseInt($("petId").value) || null;
  const autoTalkInterval = Number($("autoInterval").value);
  const authToken = $("authToken") ? $("authToken").value.trim() : "";
  if (!EXTENSION_TOKEN_PATTERN.test(authToken)) {
    showStatus("⚠️ Paste a valid extension token (pex_…)", true);
    return;
  }
  if (!Number.isInteger(autoTalkInterval) || autoTalkInterval < 30 || autoTalkInterval > 600) {
    showStatus("⚠️ Auto-talk interval must be 30–600 seconds", true);
    return;
  }

  setButtonBusy("saveBtn", true, "Pairing…");

  chrome.runtime.sendMessage({
    type: "saveConfig",
    config: { apiUrl, petId, autoTalkInterval, authToken },
  }, (saved) => {
    if (chrome.runtime.lastError || !saved?.success) {
      setButtonBusy("saveBtn", false);
      showStatus(saved?.error || "⚠️ Extension service is unavailable", true);
      return;
    }
    chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
      const fetchError = chrome.runtime.lastError;
      setButtonBusy("saveBtn", false);
      if (fetchError) {
        showStatus("⚠️ Extension service is unavailable", true);
        return;
      }
      if (res?.success && res.config) {
        renderPetConfig(res.config);
        showStatus("✅ Linked! Your pet is loaded.");
      } else if (res?.config?.needsPairing) {
        renderPetConfig(res.config);
        showStatus("⚠️ Couldn't pair — create a new extension token (pex_…)", true);
      } else {
        showStatus("⚠️ Saved, but couldn't reach the server", true);
      }
    });
  });
});

$("disconnectBtn").addEventListener("click", () => {
  if (!confirm("Disconnect this browser from your pet? This clears the local token only. Revoke the token in the dashboard if it may be exposed.")) return;
  setButtonBusy("disconnectBtn", true, "Disconnecting…");
  const disconnected = {
    ...(latestConfig || {}),
    authToken: "",
    petId: null,
    needsPairing: true,
    petName: "Demo Pet",
    petEmoji: "🐾",
    avatarUrl: "",
    personality: "playful",
    level: 1,
  };
  chrome.runtime.sendMessage({ type: "saveConfig", config: disconnected }, (res) => {
    const runtimeError = chrome.runtime.lastError;
    setButtonBusy("disconnectBtn", false);
    if (runtimeError || !res?.success) {
      showStatus(res?.error || "Couldn't clear the local pairing", true);
      return;
    }
    $("authToken").value = "";
    renderPetConfig(disconnected);
    showStatus("Disconnected locally. Revoke the token in the dashboard if needed.");
  });
});

// Export
$("exportBtn").addEventListener("click", () => {
  setButtonBusy("exportBtn", true, "Exporting…");
  showStatus("Exporting SOUL data...");
  chrome.runtime.sendMessage({ type: "exportSoul" }, (res) => {
    const runtimeError = chrome.runtime.lastError;
    setButtonBusy("exportBtn", false);
    if (runtimeError) {
      showStatus("❌ Extension service is unavailable", true);
      return;
    }
    if (res?.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = String($("petName").textContent || "pet").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "pet";
      a.download = `${safeName}_SOUL.json`;
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
  // Reset immediately so choosing the same invalid/cancelled file again still
  // fires `change` and gives the user a real retry path.
  e.target.value = "";
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
    const importName = soul?.pet?.name || soul?.name || "this pet";
    if (!confirm(`Import "${importName}" into your account? Review the file source before continuing.`)) {
      showStatus("Import cancelled.");
      return;
    }
    setButtonBusy("importBtn", true, "Importing…");
    chrome.runtime.sendMessage({ type: "importSoul", soul }, (res) => {
      const runtimeError = chrome.runtime.lastError;
      setButtonBusy("importBtn", false);
      if (runtimeError) {
        showStatus("❌ Extension service is unavailable", true);
        return;
      }
      if (res?.success) {
        showStatus(`✅ Imported "${res.petName || "pet"}"`);
        const selectImportedPet = res.petId
          ? new Promise((resolve) => chrome.runtime.sendMessage({ type: "saveConfig", config: { petId: res.petId } }, resolve))
          : Promise.resolve();
        selectImportedPet.then(() => {
          setTimeout(() => chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (fresh) => {
            if (fresh?.success && fresh.config) renderPetConfig(fresh.config);
          }), 500);
        });
      } else {
        showStatus("❌ " + (res?.error || "Import failed — server rejected payload"), true);
      }
    });
  } catch (err) {
    setButtonBusy("importBtn", false);
    showStatus("❌ Import error: " + (err.message || "unknown"), true);
  }
});

// Refresh
$("refreshBtn").addEventListener("click", () => {
  setButtonBusy("refreshBtn", true, "Refreshing…");
  chrome.runtime.sendMessage({ type: "fetchPetInfo" }, (res) => {
    const runtimeError = chrome.runtime.lastError;
    setButtonBusy("refreshBtn", false);
    if (runtimeError) {
      showStatus("❌ Extension service is unavailable", true);
      return;
    }
    if (res?.success && res.config) {
      renderPetConfig(res.config);
      showStatus("✅ Refreshed!");
      loadEvolution();
      loadEmotions();
    } else {
      showStatus("❌ Couldn't reach API", true);
    }
  });
});

$("resumeSitesBtn").addEventListener("click", () => {
  setButtonBusy("resumeSitesBtn", true, "Resuming…");
  chrome.runtime.sendMessage({ type: "resumeAllSites" }, (res) => {
    const runtimeError = chrome.runtime.lastError;
    setButtonBusy("resumeSitesBtn", false);
    if (runtimeError) {
      showStatus("Couldn't clear paused sites", true);
      return;
    }
    showStatus(res?.success ? "Paused sites cleared — reload those tabs." : "Couldn't clear paused sites", !res?.success);
    if (res?.success) {
      if (latestConfig) renderPetConfig({ ...latestConfig, pausedHosts: [] });
      refreshSiteAccess();
    }
  });
});

// Reset
$("resetBtn").addEventListener("click", () => {
  if (!HAS_CHROME) {
    showStatus("Local Play Points live inside the installed extension", true);
    return;
  }
  if (confirm("Reset local Play Points? Evolution, quests, achievements, your pet, and server data will be kept.")) {
    setButtonBusy("resetBtn", true, "Resetting…");
    chrome.runtime.sendMessage({ type: "resetPoints" }, (res) => {
      const runtimeError = chrome.runtime.lastError;
      setButtonBusy("resetBtn", false);
      if (runtimeError || !res?.success) {
        showStatus("Couldn't reset local Play Points", true);
        return;
      }
      showStatus("🗑️ Local Play Points reset.");
      loadPoints();
    });
  }
});
