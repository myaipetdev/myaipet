"use client";

/**
 * NearbyMap — the Catch map hub. Location-FIRST: we don't show a zoomed-out
 * world map. We ask for location consent, and once granted we center on the
 * user and surface what's around them:
 *   1. Your real camera catches near you (rarity-colored dots).
 *   2. Wild Encounters — tap-to-catch GAME SPAWNS (clearly labelled as game
 *      content, not real animals). Deterministic per ~1km cell + hour,
 *      validated server-side (see /api/catch/spawns).
 *
 * Leaflet is bundled (CSP blocks external script CDNs) and imported lazily once
 * the user opts in (it touches window, so no SSR).
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { getAuthHeaders } from "@/lib/api";
import { kindIcon } from "@/lib/catch/game";

const MUTED = "#7A6E5A";
const INK = "#211A12";
const CREAM = "#fbf6ec";

type Spawn = { id: string; kind: string; species: string; name: string; rarity: string; rarityLabel: string; rarityColor: string; lat: number; lng: number; caught: boolean };

function getGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

type Phase = "ask" | "loading" | "ready" | "denied";

export default function NearbyMap({ onCaught }: { onCaught?: (cat: any) => void } = {}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [phase, setPhase] = useState<Phase>("ask");
  const [count, setCount] = useState<number | null>(null);
  const [spawnCount, setSpawnCount] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Build the map only after the user opts into location (phase === "loading"),
  // centered on them — never a zoomed-out world view.
  useEffect(() => {
    if (phase !== "loading") return;
    let alive = true;
    (async () => {
      const geo = await getGeo();
      if (!alive) return;
      if (!geo) { setPhase("denied"); return; }
      setPhase("ready");
      // wait one tick for the map container to mount
      await new Promise((r) => setTimeout(r, 30));
      const L = (await import("leaflet")).default;
      if (!alive || !boxRef.current || mapRef.current) return;

      const center: [number, number] = [geo.lat, geo.lng];
      const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView(center, 16);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      L.circleMarker(center, { radius: 7, color: "#211A12", weight: 3, fillColor: "#3E8FE0", fillOpacity: 0.9 }).addTo(map).bindPopup("You are here");

      const pts: [number, number][] = [];

      // ── Layer 1: your real camera catches ──
      try {
        const res = await fetch(`/api/catch/nearby?lat=${geo.lat}&lng=${geo.lng}`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        const catches: any[] = data?.catches || [];
        if (!alive) return;
        setCount(catches.length);
        for (const c of catches) {
          const ll: [number, number] = [c.lat, c.lng];
          pts.push(ll);
          L.circleMarker(ll, { radius: 9, color: INK, weight: 2, fillColor: c.rarityColor, fillOpacity: 0.92 })
            .addTo(map)
            .bindPopup(
              `<div style="text-align:center;font-family:system-ui;min-width:120px">
                 <img src="${c.photo_path}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:8px;display:block;margin:0 auto 6px"/>
                 <div style="font-weight:800">${escapeHtml(c.name)}</div>
                 <div style="font-size: 13px;color:#7A6E5A">${escapeHtml(c.breed)}</div>
                 <div style="font-size: 13px;font-weight:700;color:${c.rarityColor}">${escapeHtml(c.rarityLabel)}</div>
               </div>`,
            );
        }
      } catch { /* non-fatal */ }

      // ── Layer 2: Wild Encounters (game spawns) ──
      try {
        const res = await fetch(`/api/catch/spawns?lat=${geo.lat}&lng=${geo.lng}`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        const spawns: Spawn[] = data?.spawns || [];
        if (!alive) return;
        setSpawnCount(spawns.length);

        const spawnIconHtml = (s: Spawn, caught: boolean) =>
          `<div style="width:40px;height:40px;border-radius:50%;border:3px solid ${caught ? "#7A6E5A" : s.rarityColor};background:#FBF6EC;box-shadow:0 0 0 4px ${caught ? "rgba(122,110,90,0.25)" : s.rarityColor + "40"},0 2px 7px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;${caught ? "opacity:0.45" : ""}">
             <img src="/icons/${kindIcon(s.kind)}.png" style="width:27px;height:27px;object-fit:contain"/>
           </div>`;

        for (const s of spawns) {
          pts.push([s.lat, s.lng]);
          const marker = L.marker([s.lat, s.lng], {
            icon: L.divIcon({ className: "wild-spawn", html: spawnIconHtml(s, s.caught), iconSize: [40, 40], iconAnchor: [20, 20] }),
          }).addTo(map);

          const popupFor = (title: string, sub: string) =>
            `<div style="text-align:center;font-family:system-ui;min-width:140px">
               <div style="font-size: 13px;letter-spacing:.08em;color:#9A4E1E;font-weight:800">WILD ENCOUNTER</div>
               <div style="font-weight:800;margin-top:2px">${title}</div>
               <div style="font-size: 13px;color:#7A6E5A">${sub}</div>
             </div>`;

          if (s.caught) {
            marker.bindPopup(popupFor(`${cap(s.kind)} · caught ✓`, `${escapeHtml(s.species)} · ${escapeHtml(s.rarityLabel)}`));
            continue;
          }

          marker.bindPopup(popupFor(`Tap to catch — ${escapeHtml(s.name)}`, `${escapeHtml(s.species)} · <b style="color:${s.rarityColor}">${escapeHtml(s.rarityLabel)}</b>`));
          marker.on("click", async () => {
            marker.bindPopup(popupFor("Catching…", "")).openPopup();
            try {
              const r = await fetch("/api/catch/spawns", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify({ id: s.id, lat: geo.lat, lng: geo.lng }),
              });
              const d = await r.json().catch(() => ({}));
              if (d?.caught && d.cat) {
                marker.setIcon(L.divIcon({ className: "wild-spawn", html: spawnIconHtml(s, true), iconSize: [40, 40], iconAnchor: [20, 20] }));
                marker.off("click");
                marker.bindPopup(popupFor(`Caught ${escapeHtml(d.cat.name)}! 🎉`, `${escapeHtml(d.cat.rarityLabel)}${d.pointsAwarded ? ` · +${d.pointsAwarded} season pts` : ""}`)).openPopup();
                if (alive && d.pointsAwarded) { setToast(`Caught a ${d.cat.rarityLabel} ${s.kind}! +${d.pointsAwarded} season points`); setTimeout(() => alive && setToast(null), 3500); }
                onCaught?.(d.cat);
              } else {
                marker.bindPopup(popupFor("Couldn't catch", escapeHtml(d?.reason || "Try refreshing the map."))).openPopup();
              }
            } catch {
              marker.bindPopup(popupFor("Network error", "Try again.")).openPopup();
            }
          });
        }
      } catch { /* non-fatal */ }

      if (alive && pts.length) map.fitBounds(L.latLngBounds([center, ...pts]).pad(0.25), { maxZoom: 17 });
    })();

    return () => { alive = false; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Consent-first states ──
  if (phase === "ask" || phase === "denied") {
    const denied = phase === "denied";
    return (
      <div style={{ textAlign: "center", padding: "30px 18px 10px" }}>
        <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: 18, background: CREAM, border: `3px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📍</div>
        <h3 style={{ fontSize: 19, fontWeight: 900, color: INK, margin: 0 }}>{denied ? "Location needed" : "Wild Encounters near you"}</h3>
        <p style={{ fontSize: 13.5, color: MUTED, margin: "8px auto 16px", maxWidth: 340, lineHeight: 1.55 }}>
          {denied
            ? "We couldn't get your location. Allow location access (and try again) to see the Wild Encounters and catches around you."
            : "Enable location and we'll drop game spawns right around you to catch — plus any real catches nearby. We only use it to place the map; nothing is shared."}
        </p>
        <button onClick={() => setPhase("loading")} style={{ padding: "12px 24px", borderRadius: 999, border: `3px solid ${INK}`, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 0 rgba(33,26,18,0.25)" }}>
          {denied ? "Try again" : "Enable location"}
        </button>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>Wild Encounters are game spawns (not real animals); they refresh hourly.</div>
      </div>
    );
  }

  return (
    <div>
      {phase === "loading" && <div style={{ textAlign: "center", fontSize: 13, color: MUTED, marginBottom: 10 }}>Finding what&apos;s around you…</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 12, fontSize: 13, color: MUTED }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#9E72E8", border: `2px solid ${INK}` }} /> Real camera catches
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#FBF6EC", border: "2px solid #BE4F28", boxShadow: "0 0 0 3px rgba(190,79,40,0.25)" }} /> Wild Encounters — tap to catch
        </span>
      </div>
      <div ref={boxRef} style={{ width: "100%", height: "60vh", minHeight: 360, borderRadius: 18, overflow: "hidden", border: `3px solid ${INK}`, boxShadow: "0 10px 0 rgba(33,26,18,0.12)", background: CREAM }} />
      {toast && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <span style={{ display: "inline-block", background: "#BE4F28", color: "#FFF8EE", fontWeight: 800, fontSize: 13, padding: "7px 16px", borderRadius: 999, border: `2.5px solid ${INK}`, boxShadow: "0 3px 0 rgba(33,26,18,0.25)" }}>{toast}</span>
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        {count != null && <span>{count} real catches nearby. </span>}
        {spawnCount != null && <span>{spawnCount} wild encounters this hour — tap one to catch it (no camera needed).</span>}
        <br />
        <span style={{ opacity: 0.8 }}>Wild Encounters are game spawns (not real animals); they refresh hourly.</span>
      </div>
    </div>
  );
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
