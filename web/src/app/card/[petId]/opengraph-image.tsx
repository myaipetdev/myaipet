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
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f14", color: "#fff", fontSize: 48, fontWeight: 800 }}>MY AI PET</div>,
      { ...size },
    );
  }

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  const avatar = abs(card.avatarUrl);
  const stats: [string, number][] = [["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})` }}>
        <div style={{ display: "flex", flexDirection: "column", width: 404, height: 564, borderRadius: 22, overflow: "hidden", background: "#0f0f14", border: `6px solid ${rc}` }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: t.color }}>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 800, color: "#fff" }}>{card.name}</div>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "#fff" }}>{`Lv ${card.level}`}</div>
          </div>

          {/* Art */}
          <div style={{ display: "flex", width: 404, height: 228, background: t.grad[0], alignItems: "center", justifyContent: "center" }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={404} height={228} style={{ width: 404, height: 228, objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>{card.speciesName}</div>
            )}
          </div>

          {/* Element + rarity */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
            <div style={{ display: "flex", fontSize: 14, fontWeight: 700, color: "#fff", background: t.color, borderRadius: 999, padding: "4px 12px" }}>{t.label}</div>
            <div style={{ display: "flex", fontSize: 15, fontWeight: 800, color: rc }}>{card.rarity.toUpperCase()}</div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", padding: "2px 14px" }}>
            {stats.map(([lab, val]) => (
              <div key={lab} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, background: "#1a1a22", borderRadius: 10, padding: "8px 4px", marginLeft: 4, marginRight: 4 }}>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: "#fff" }}>{String(val)}</div>
                <div style={{ display: "flex", fontSize: 12, color: "#8a8a93" }}>{lab}</div>
              </div>
            ))}
          </div>

          {/* Sub-stats */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#b8b8c0" }}>{`PWR ${card.power}`}</div>
            <div style={{ display: "flex", fontSize: 13, color: "#b8b8c0" }}>{`BOND ${card.bondLevel}`}</div>
            <div style={{ display: "flex", fontSize: 13, color: "#b8b8c0" }}>{`STREAK ${card.careStreak}d`}</div>
          </div>

          {/* Moves */}
          {card.moves.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", padding: "2px 14px" }}>
              {card.moves.map((m, i) => (
                <div key={i} style={{ display: "flex", fontSize: 12, color: "#e8e8ee", background: "#222230", borderRadius: 6, padding: "4px 10px", marginLeft: 4, marginBottom: 6 }}>{m}</div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "10px 16px", background: "#000" }}>
            <div style={{ display: "flex", fontSize: 13, fontWeight: 800, color: t.color }}>MY AI PET</div>
            <div style={{ display: "flex", fontSize: 12, color: "#8a8a93" }}>{`${card.evolutionName || card.speciesName} · ${card.personality}`}</div>
          </div>

        </div>
      </div>
    ),
    { ...size },
  );
}
