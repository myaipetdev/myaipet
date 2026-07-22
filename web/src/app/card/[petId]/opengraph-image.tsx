import { ImageResponse } from "next/og";
import { getCardData, elementTheme, rarityColor } from "@/lib/tcg/card";

// Node runtime — we read the pet from prisma (edge can't). ImageResponse works
// on nodejs in App Router. Next auto-wires this as the route's og:image +
// twitter:image (summary_large_image), so a shared /card/[petId] unfurls it.
//
// satori (the engine behind ImageResponse) requires EVERY div with >1 child to
// have display:flex, supports flexbox/abs-pos only, and no `gap`. So this tree
// keeps display:flex on every container, single text children, and margins
// instead of gap.
export const runtime = "nodejs";
export const alt = "MY AI PET — trading card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";
function abs(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${APP_URL}${p.startsWith("/") ? "" : "/"}${p}`;
}

export default async function Image({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const card = await getCardData(parseInt(petId, 10));

  if (!card) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1E1710", color: "#E8C77E", fontSize: 48, fontWeight: 800 }}>MY AI PET</div>,
      { ...size },
    );
  }

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  // Prefer the Codex sticker illustration for the shareable card; else the photo.
  const avatar = abs(card.codexUrl || card.avatarUrl);
  const stats: [string, number][] = [["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]];

  // Collectible Editorial literals (ImageResponse can't read CSS vars):
  // cream paper card, warm ink, gold-foil footer accent on warm-dark ink.
  const PAPER = "#FBF6EC", INSET = "#F5EFE2", INK = "#211A12", MUTED = "#7A6E5A", MUTED2 = "#5C5140", FOIL = "#E8C77E";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})` }}>
        <div style={{ display: "flex", flexDirection: "column", width: 404, height: 564, borderRadius: 22, overflow: "hidden", background: PAPER, border: `6px solid ${rc}` }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: t.color }}>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 800, color: "#FFF8EE" }}>{card.name}</div>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "#FFF8EE" }}>{`Lv ${card.level}`}</div>
          </div>

          {/* Art */}
          <div style={{ display: "flex", width: 404, height: 228, background: t.grad[0], alignItems: "center", justifyContent: "center" }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={404} height={228} style={{ width: 404, height: 228, objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "rgba(251,246,236,0.9)" }}>{card.speciesName}</div>
            )}
          </div>

          {/* Element + rarity (top-N% only when it actually flatters — never "TOP 100%") */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
            <div style={{ display: "flex", fontSize: 14, fontWeight: 700, color: "#FFF8EE", background: t.color, borderRadius: 999, padding: "4px 12px" }}>{t.label}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 15, fontWeight: 800, color: rc }}>{card.rarity.toUpperCase()}</div>
              {card.topPercent != null && card.topPercent <= 50 && (
                <div style={{ display: "flex", fontSize: 13, color: MUTED }}>{`TOP ${card.topPercent}%`}</div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", padding: "2px 14px" }}>
            {stats.map(([lab, val]) => (
              <div key={lab} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, background: INSET, borderRadius: 10, padding: "8px 4px", marginLeft: 4, marginRight: 4 }}>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: INK }}>{String(val)}</div>
                <div style={{ display: "flex", fontSize: 13, color: MUTED }}>{lab}</div>
              </div>
            ))}
          </div>

          {/* Sub-stats */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px" }}>
            <div style={{ display: "flex", fontSize: 13, color: MUTED2 }}>{`PWR ${card.power}`}</div>
            <div style={{ display: "flex", fontSize: 13, color: MUTED2 }}>{`BOND ${card.bondLevel}`}</div>
            <div style={{ display: "flex", fontSize: 13, color: MUTED2 }}>{`STREAK ${card.careStreak}d`}</div>
          </div>

          {/* Moves */}
          {card.moves.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", padding: "2px 14px" }}>
              {card.moves.map((m, i) => (
                <div key={i} style={{ display: "flex", fontSize: 13, color: "#3A3024", background: INSET, borderRadius: 6, padding: "4px 10px", marginLeft: 4, marginBottom: 6 }}>{m}</div>
              ))}
            </div>
          )}

          {/* Footer — warm ink bar with foil-gold brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "10px 16px", background: INK }}>
            <div style={{ display: "flex", fontSize: 13, fontWeight: 800, color: FOIL }}>MY AI PET</div>
            <div style={{ display: "flex", fontSize: 13, color: "rgba(251,246,236,0.65)" }}>{`${card.evolutionName || card.speciesName} · ${card.personality}`}</div>
          </div>

        </div>
      </div>
    ),
    { ...size },
  );
}
