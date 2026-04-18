/**
 * MY AI PET — Popup Settings Panel
 */

const $ = (id) => document.getElementById(id);

function showStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

// Load points
function loadPoints() {
  chrome.runtime.sendMessage({ type: "getActivity" }, (res) => {
    if (!res) return;
    const p = res.points || {};
    $("totalPoints").textContent = (p.totalPoints || 0).toLocaleString();
    $("chatPoints").textContent = p.chatPoints || 0;
    $("heartbeatPoints").textContent = p.heartbeatPoints || 0;
    $("skillPoints").textContent = p.skillPoints || 0;
    $("browsingPoints").textContent = p.browsingPoints || 0;
    $("streak").textContent = p.dailyStreak || 0;
    $("chatCount").textContent = p.chatCount || 0;
    $("uptime").textContent = res.uptime || 0;
  });
}
loadPoints();
setInterval(loadPoints, 5000); // refresh every 5s while popup open

// Load config
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
    // Fetch fresh pet info
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

// Export SOUL
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
    } else {
      showStatus("❌ Couldn't reach API", true);
    }
  });
});
