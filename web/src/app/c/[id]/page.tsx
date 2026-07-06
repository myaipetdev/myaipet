import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { isPrivateAutoGen } from "@/lib/publicFeed";

// Public, wallet-gate-free share page for a single community creation.
// Shares from the Community gallery deep-link here (app.myaipet.ai/c/<id>) so a
// recipient lands on the actual creation — with a per-item social-card unfurl —
// instead of the generic homepage. Mirrors the social-feed exposure model:
// only `completed` generations that have media are publicly visible (same rule
// the community feed already applies), so nothing private is revealed here.
//
// Styling: Collectible Editorial. This page renders for signed-out strangers,
// so font stacks are written out explicitly (with the next/font variables from
// the root layout as the first choice, real family names as fallback).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";
const LANDING_URL = "https://myaipet.ai";

// ── Collectible Editorial tokens (explicit — no dependence on globals.css) ──
const ED = {
  field: "#ECE4D4",
  paper: "#FBF6EC",
  inset: "#F5EFE2",
  ink: "#211A12",
  muted: "#7A6E5A",
  mono: "#9A7B4E",
  hair: "rgba(33,26,18,.13)",
  keyline: "inset 0 0 0 1.5px rgba(184,130,44,.5)",
  shadowCard: "0 20px 40px -26px rgba(80,55,20,.5)",
  disp: "var(--font-display), 'Bricolage Grotesque', system-ui, sans-serif",
  body: "var(--font-body), 'Hanken Grotesk', system-ui, sans-serif",
  m: "var(--font-mono-ed), 'Space Mono', ui-monospace, monospace",
};

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
    // Privacy: daydream auto-gens carry the pet's private insight in the
    // prompt — not publicly shareable (see lib/publicFeed.ts).
    if (await isPrivateAutoGen(g.id)) return null;
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
      description: "Raise an AI pet that grows, evolves, and remembers you. Create your own in 30 seconds.",
    };
  }
  const title = g.prompt
    ? `“${truncate(g.prompt, 70)}” — MY AI PET`
    : "An AI pet creation — MY AI PET";
  const description =
    "Made on MY AI PET — raise an AI pet that grows, evolves, and remembers you. Create your own in 30 seconds.";
  const image = abs(g.photo_path) || `${APP_URL}/og-image.jpg`;
  const url = `${APP_URL}/c/${g.id}`;
  return {
    title,
    description,
    openGraph: { title, description, url, type: "article", images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

function PawMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-2px" }}>
      <ellipse cx="6" cy="9.5" rx="1.8" ry="2.4" />
      <ellipse cx="10.3" cy="6.6" rx="1.8" ry="2.5" />
      <ellipse cx="13.7" cy="6.6" rx="1.8" ry="2.5" />
      <ellipse cx="18" cy="9.5" rx="1.8" ry="2.4" />
      <path d="M12 11.5c-2.7 0-5 2.1-5 4.4 0 1.7 1.4 2.6 3 2.6.9 0 1.4-.4 2-.4s1.1.4 2 .4c1.6 0 3-.9 3-2.6 0-2.3-2.3-4.4-5-4.4Z" />
    </svg>
  );
}

export default async function CreationPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await getCreation(id);

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: ED.field,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 18px 56px",
    fontFamily: ED.body,
    color: ED.ink,
  };
  const wordmark: React.CSSProperties = {
    textDecoration: "none",
    color: ED.ink,
    fontFamily: ED.disp,
    fontWeight: 800,
    fontSize: 19,
    letterSpacing: "-0.01em",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
  const eyebrow: React.CSSProperties = {
    fontFamily: ED.m,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: ED.mono,
  };
  const cta: React.CSSProperties = {
    display: "inline-block",
    padding: "15px 34px",
    borderRadius: 14,
    background: "linear-gradient(180deg, #F49B2A, #E27D0C)",
    color: "#FFF8EE",
    fontFamily: ED.disp,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.01em",
    textDecoration: "none",
    boxShadow: "0 10px 20px -12px rgba(226,125,12,.7)",
  };

  // Soft fallback: a dead/old link still pitches the product instead of 404-ing.
  if (!g) {
    return (
      <main style={wrap}>
        <a href={LANDING_URL} style={{ ...wordmark, marginBottom: 40 }}>
          MY AI PET <PawMark />
        </a>
        <div style={{ ...eyebrow, marginBottom: 14 }}>ARCHIVE · NOT ON FILE</div>
        <h1 style={{ fontFamily: ED.disp, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", textAlign: "center" }}>
          This creation isn’t available
        </h1>
        <p style={{ fontSize: 16, color: ED.muted, margin: "0 0 28px", textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
          It may have been removed — but you can make your own AI pet in about 30 seconds.
        </p>
        <a href={LANDING_URL} style={cta}>Create your own AI pet →</a>
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
      <a href={LANDING_URL} style={{ ...wordmark, marginBottom: 22 }}>
        MY AI PET <PawMark />
      </a>

      <div style={{ width: "100%", maxWidth: 460, ...eyebrow, marginBottom: 8 }}>
        COMMUNITY CREATION · NO. {g.id}
      </div>

      {/* Paper mount — the creation sits on a cream mat with a gold keyline,
          like a collectible print pulled from the album. */}
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: ED.paper,
          borderRadius: 18,
          padding: 13,
          boxShadow: ED.shadowCard,
          border: `1px solid ${ED.hair}`,
        }}
      >
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: ED.inset, borderRadius: 10, overflow: "hidden", boxShadow: ED.keyline }}>
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

        <div style={{ padding: "16px 8px 8px" }}>
          {g.prompt ? (
            <p style={{ fontFamily: ED.disp, fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.45, margin: "0 0 8px", color: ED.ink }}>
              “{g.prompt}”
            </p>
          ) : null}
          <p style={{ fontFamily: ED.m, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: ED.muted, margin: 0 }}>
            {likes > 0 ? `${likes} ${likes === 1 ? "like" : "likes"} · ` : ""}{creator ? `by ${creator} · ` : ""}made on MY AI PET · {isVideo ? "film" : "print"}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 30, textAlign: "center" }}>
        <a href={LANDING_URL} style={cta}>Create your own AI pet →</a>
        <p style={{ fontSize: 13, color: ED.muted, marginTop: 14 }}>
          Raise an AI pet that grows, evolves, and remembers you.
        </p>
      </div>

      {more.length > 0 && (
        <div style={{ width: "100%", maxWidth: 460, marginTop: 42 }}>
          <p style={{ ...eyebrow, textAlign: "center", margin: "0 0 14px" }}>
            MORE FROM MY AI PET
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {more.map((m) => (
              <a
                key={m.id}
                href={`/c/${m.id}`}
                title={m.prompt || "AI pet creation"}
                style={{
                  display: "block",
                  padding: 4,
                  borderRadius: 12,
                  background: ED.paper,
                  border: `1px solid ${ED.hair}`,
                  boxShadow: ED.shadowCard,
                }}
              >
                <span style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: ED.inset, boxShadow: ED.keyline }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={abs(m.photo_path) || undefined} alt={m.prompt || "AI pet creation"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
