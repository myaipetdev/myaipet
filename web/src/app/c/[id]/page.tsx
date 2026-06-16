import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

// Public, wallet-gate-free share page for a single community creation.
// Shares from the Community gallery deep-link here (app.myaipet.ai/c/<id>) so a
// recipient lands on the actual creation — with a per-item social-card unfurl —
// instead of the generic homepage. Mirrors the social-feed exposure model:
// only `completed` generations that have media are publicly visible (same rule
// the community feed already applies), so nothing private is revealed here.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";
const LANDING_URL = "https://myaipet.ai";

function abs(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${APP_URL}${p.startsWith("/") ? "" : "/"}${p}`;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

async function getCreation(idRaw: string) {
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const g = await prisma.generation.findUnique({
      where: { id },
      include: {
        user: { select: { profile: { select: { display_name: true } } } },
        _count: { select: { likes: true } },
      },
    });
    if (!g || g.status !== "completed") return null;
    if (!g.photo_path && !g.video_path) return null;
    return g;
  } catch {
    return null;
  }
}

async function getMoreCreations(excludeId: number) {
  try {
    return await prisma.generation.findMany({
      where: {
        status: "completed",
        id: { not: excludeId },
        OR: [{ photo_path: { not: "" } }, { video_path: { not: "" } }],
      },
      orderBy: { created_at: "desc" },
      take: 6,
      select: { id: true, photo_path: true, prompt: true },
    });
  } catch {
    return [];
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const g = await getCreation(id);
  if (!g) {
    return {
      title: "Create your own AI pet — MY AI PET",
      description: "Raise an AI pet that grows, evolves, and earns. Create your own in 30 seconds.",
    };
  }
  const title = g.prompt
    ? `“${truncate(g.prompt, 70)}” — MY AI PET`
    : "An AI pet creation — MY AI PET";
  const description =
    "Made on MY AI PET — raise an AI pet that grows, evolves, and earns. Create your own in 30 seconds.";
  const image = abs(g.photo_path) || `${APP_URL}/og-image.jpg`;
  const url = `${APP_URL}/c/${g.id}`;
  return {
    title,
    description,
    openGraph: { title, description, url, type: "article", images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function CreationPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await getCreation(id);

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#faf7f2",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 18px 56px",
    fontFamily: "'Space Grotesk', sans-serif",
    color: "#1a1a2e",
  };
  const cta: React.CSSProperties = {
    display: "inline-block",
    padding: "15px 34px",
    borderRadius: 14,
    background: "linear-gradient(135deg, #f59e0b, #d97706)",
    color: "#fff",
    fontSize: 17,
    fontWeight: 700,
    textDecoration: "none",
    boxShadow: "0 8px 24px rgba(217,119,6,0.28)",
  };

  // Soft fallback: a dead/old link still pitches the product instead of 404-ing.
  if (!g) {
    return (
      <main style={wrap}>
        <a href={LANDING_URL} style={{ textDecoration: "none", color: "#1a1a2e", fontWeight: 800, fontSize: 20, letterSpacing: 0.5, marginBottom: 40 }}>
          MY AI PET <span aria-hidden>🐾</span>
        </a>
        <div style={{ fontSize: 56, marginBottom: 16 }} aria-hidden>🐾</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 10px", textAlign: "center" }}>
          This creation isn’t available
        </h1>
        <p style={{ fontSize: 16, color: "rgba(26,26,46,0.55)", margin: "0 0 28px", textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
          It may have been removed — but you can make your own AI pet in about 30 seconds.
        </p>
        <a href={LANDING_URL} style={cta}>✨ Create your own AI pet →</a>
      </main>
    );
  }

  const isVideo = !!g.video_path;
  const mediaSrc = abs(g.video_path) || abs(g.photo_path) || undefined;
  const poster = abs(g.photo_path) || undefined;
  const creator = g.user?.profile?.display_name || null;
  const likes = g._count?.likes || 0;
  const more = await getMoreCreations(g.id);

  return (
    <main style={wrap}>
      <a href={LANDING_URL} style={{ textDecoration: "none", color: "#1a1a2e", fontWeight: 800, fontSize: 20, letterSpacing: 0.5, marginBottom: 22 }}>
        MY AI PET <span aria-hidden>🐾</span>
      </a>

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 18px 50px rgba(26,26,46,0.14)",
          border: "1px solid rgba(26,26,46,0.06)",
        }}
      >
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#f0ece4" }}>
          {isVideo ? (
            <video
              src={mediaSrc}
              poster={poster}
              autoPlay
              loop
              muted
              playsInline
              controls
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc} alt={g.prompt || "AI pet creation"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>

        <div style={{ padding: "18px 20px 22px" }}>
          {g.prompt ? (
            <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, margin: "0 0 8px" }}>
              “{g.prompt}”
            </p>
          ) : null}
          <p style={{ fontSize: 13, color: "rgba(26,26,46,0.5)", margin: 0 }}>
            {likes > 0 ? `❤️ ${likes} · ` : ""}{creator ? `Created by ${creator} · ` : ""}Made on MY AI PET {isVideo ? "🎬" : "🎨"}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 30, textAlign: "center" }}>
        <a href={LANDING_URL} style={cta}>✨ Create your own AI pet →</a>
        <p style={{ fontSize: 13, color: "rgba(26,26,46,0.4)", marginTop: 14 }}>
          Raise an AI pet that grows, evolves, and earns.
        </p>
      </div>

      {more.length > 0 && (
        <div style={{ width: "100%", maxWidth: 460, marginTop: 42 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(26,26,46,0.55)", textAlign: "center", margin: "0 0 14px", letterSpacing: 0.3 }}>
            More from MY AI PET
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {more.map((m) => (
              <a key={m.id} href={`/c/${m.id}`} title={m.prompt || "AI pet creation"} style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "#f0ece4" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={abs(m.photo_path) || undefined} alt={m.prompt || "AI pet creation"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
