"use client";

/**
 * NearbyMap — the Catch map hub, two layers:
 *   1. Your real camera catches near you (rarity-colored dots).
 *   2. Wild Encounters — tap-to-catch GAME SPAWNS (clearly labelled as game
 *      content, not real animals / not real user data). Deterministic per
 *      ~1km cell + hour, validated server-side (see /api/catch/spawns).
 *
 * Leaflet is bundled (CSP blocks external script CDNs) and imported lazily in
 * the effect (it touches window, so no SSR). Spawn markers are divIcons with
 * the 3D creature icon; real catches stay vector circleMarkers.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { getAuthHeaders } from "@/lib/api";
import { kindIcon } from "@/lib/catch/game";

const MUTED = "#6b6b73";
const INK = "#1a1a22";

type Spawn = { id: string; kind: string; species: string; name: string; rarity: string; rarityLabel: string; rarityColor: string; lat: number; lng: number; caught: boolean };

function getGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export default function NearbyMap({ onCaught }: { onCaught?: (cat: any) => void } = {}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState("Locating you…");
  const [count, setCount] = useState<number | null>(null);
  const [spawnCount, setSpawnCount] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive || !boxRef.current) return;

      const geo = await getGeo();
      const center: [number, number] = geo ? [geo.lat, geo.lng] : [20, 0];
      const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView(center, geo ? 15 : 2);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

      if (geo) {
        L.circleMarker(center, { radius: 7, color: "#2563eb", weight: 3, fillColor: "#3b82f6", fillOpacity: 0.9 })
          .addTo(map).bindPopup("You are here");
      }

      // ── Layer 1: your real camera catches ──
      setStatus("Loading catches…");
      const pts: [number, number][] = [];
      try {
        const qs = geo ? `?lat=${geo.lat}&lng=${geo.lng}` : "";
        const res = await fetch(`/api/catch/nearby${qs}`, { headers: getAuthHeaders() });
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
                 <div style="font-size:11px;color:#666">${escapeHtml(c.breed)}</div>
                 <div style="font-size:11px;font-weight:700;color:${c.rarityColor}">${escapeHtml(c.rarityLabel)}</div>
               </div>`,
            );
        }
      } catch { /* non-fatal — spawns can still load */ }

      // ── Layer 2: Wild Encounters (game spawns) ──
      if (geo) {
        try {
          const res = await fetch(`/api/catch/spawns?lat=${geo.lat}&lng=${geo.lng}`, { headers: getAuthHeaders() });
          const data = await res.json().catch(() => ({}));
          const spawns: Spawn[] = data?.spawns || [];
          if (!alive) return;
          setSpawnCount(spawns.length);

          const spawnIconHtml = (s: Spawn, caught: boolean) =>
            `<div style="width:40px;height:40px;border-radius:50%;border:3px solid ${caught ? "#9ca3af" : s.rarityColor};background:#fff;box-shadow:0 0 0 4px ${caught ? "rgba(156,163,175,0.25)" : s.rarityColor + "40"},0 2px 7px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;${caught ? "opacity:0.45" : ""}">
               <img src="/icons/${kindIcon(s.kind)}.png" style="width:27px;height:27px;object-fit:contain"/>
             </div>`;

          for (const s of spawns) {
            pts.push([s.lat, s.lng]);
            const marker = L.marker([s.lat, s.lng], {
              icon: L.divIcon({ className: "wild-spawn", html: spawnIconHtml(s, s.caught), iconSize: [40, 40], iconAnchor: [20, 20] }),
            }).addTo(map);

            const popupFor = (title: string, sub: string) =>
              `<div style="text-align:center;font-family:system-ui;min-width:140px">
                 <div style="font-size:10px;letter-spacing:.08em;color:#b45309;font-weight:800">WILD ENCOUNTER</div>
                 <div style="font-weight:800;margin-top:2px">${title}</div>
                 <div style="font-size:11px;color:#666">${sub}</div>
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
      }

      if (!alive) return;
      const total = (count || 0);
      setStatus(pts.length ? "" : (geo ? "No catches or spawns near you yet." : "Enable location to see Wild Encounters near you."));
      void total;
      if (geo && pts.length) {
        map.fitBounds(L.latLngBounds([center, ...pts]).pad(0.2), { maxZoom: 16 });
      }
    })();

    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Two-track legend — honest framing */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 12, fontSize: 11.5, color: MUTED }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#a855f7", border: `2px solid ${INK}` }} /> Real camera catches
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", border: "2px solid #f59e0b", boxShadow: "0 0 0 3px rgba(245,158,11,0.25)" }} /> Wild Encounters — tap to catch
        </span>
      </div>
      <div ref={boxRef} style={{ width: "100%", height: "60vh", minHeight: 360, borderRadius: 18, overflow: "hidden", border: `3px solid ${INK}`, boxShadow: "0 10px 0 rgba(26,26,34,0.12)" }} />
      {toast && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <span style={{ display: "inline-block", background: "#f59e0b", color: INK, fontWeight: 800, fontSize: 13, padding: "7px 16px", borderRadius: 999, border: `2.5px solid ${INK}`, boxShadow: "0 3px 0 rgba(26,26,34,0.25)" }}>{toast}</span>
        </div>
      )}
      {status && <div style={{ textAlign: "center", fontSize: 13, color: MUTED, marginTop: 10 }}>{status}</div>}
      <div style={{ textAlign: "center", fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        {count != null && <span>{count} real catches nearby. </span>}
        {spawnCount != null && spawnCount > 0 && <span>{spawnCount} wild encounters this hour — tap one to catch it (no camera needed).</span>}
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
