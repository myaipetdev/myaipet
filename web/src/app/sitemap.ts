import type { MetadataRoute } from "next";

// public/robots.txt points crawlers here — this used to 404. Lists the public,
// indexable pages only (not authed SPA sections, not /api). APP_URL matches the
// metadataBase in layout.tsx.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, freq: "daily" },
    { path: "/studio", priority: 0.8, freq: "weekly" },
    { path: "/docs", priority: 0.6, freq: "weekly" },
    { path: "/skills", priority: 0.5, freq: "weekly" },
    { path: "/architecture", priority: 0.4, freq: "monthly" },
    { path: "/contracts", priority: 0.4, freq: "monthly" },
    { path: "/terms", priority: 0.3, freq: "yearly" },
    { path: "/privacy", priority: 0.3, freq: "yearly" },
  ];
  return routes.map((r) => ({
    url: `${APP_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
