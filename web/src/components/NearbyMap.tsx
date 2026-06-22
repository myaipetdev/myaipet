"use client";

/**
 * NearbyMap — other players' catches near you, on a Leaflet/OSM map.
 * Leaflet is bundled (CSP blocks external script CDNs) and imported lazily
 * inside the effect (it touches window, so it can't run during SSR). Markers
 * are vector circleMarkers (rarity-colored) so no image icon assets are needed.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { getAuthHeaders } from "@/lib/api";

const MUTED = "#6b6b73";

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

export default function NearbyMap() {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState("Locating you…");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive || !boxRef.current) return;

      const geo = await getGeo();
      const center: [number, number] = geo ? [geo.lat, geo.lng] : [20, 0];
      const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView(center, geo ? 13 : 2);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      if (geo) {
        L.circleMarker(center, { radius: 7, color: "#2563eb", weight: 3, fillColor: "#3b82f6", fillOpacity: 0.9 })
          .addTo(map).bindPopup("You are here");
      }

      setStatus("Loading catches…");
      try {
        const qs = geo ? `?lat=${geo.lat}&lng=${geo.lng}` : "";
        const res = await fetch(`/api/catch/nearby${qs}`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        const catches: any[] = data?.catches || [];
        if (!alive) return;
        setCount(catches.length);
        setStatus(catches.length ? "" : "No catches near you yet — be the first! 🐾");

        const pts: [number, number][] = [];
        for (const c of catches) {
          const ll: [number, number] = [c.lat, c.lng];
          pts.push(ll);
          const emoji = c.kind === "dog" ? "🐶" : "🐱";
          L.circleMarker(ll, { radius: 9, color: "#1a1a22", weight: 2, fillColor: c.rarityColor, fillOpacity: 0.92 })
            .addTo(map)
            .bindPopup(
              `<div style="text-align:center;font-family:system-ui;min-width:120px">
                 <img src="${c.photo_path}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:8px;display:block;margin:0 auto 6px"/>
                 <div style="font-weight:800">${emoji} ${escapeHtml(c.name)}</div>
                 <div style="font-size:11px;color:#666">${escapeHtml(c.breed)}</div>
                 <div style="font-size:11px;font-weight:700;color:${c.rarityColor}">${escapeHtml(c.rarityLabel)}</div>
               </div>`,
            );
        }
        if (geo && pts.length) {
          map.fitBounds(L.latLngBounds([center, ...pts]).pad(0.2), { maxZoom: 14 });
        }
      } catch {
        if (alive) setStatus("Couldn't load the map.");
      }
    })();

    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div>
      <div ref={boxRef} style={{ width: "100%", height: "60vh", minHeight: 360, borderRadius: 18, overflow: "hidden", border: "3px solid #1a1a22", boxShadow: "0 10px 0 rgba(26,26,34,0.12)" }} />
      {status && <div style={{ textAlign: "center", fontSize: 13, color: MUTED, marginTop: 10 }}>{status}</div>}
      {count != null && count > 0 && <div style={{ textAlign: "center", fontSize: 12, color: MUTED, marginTop: 6 }}>{count} catches nearby · tap a dot to see the catch</div>}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
