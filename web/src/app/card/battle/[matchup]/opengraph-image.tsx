import { ImageResponse } from "next/og";
import { resolveCardBattle, parseMatchup } from "@/lib/tcg/battle";
import { elementTheme } from "@/lib/tcg/theme";
import type { CardData } from "@/lib/tcg/card";

export const runtime = "nodejs";
export const alt = "MY AI PET — card duel result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";
function abs(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${APP_URL}${p.startsWith("/") ? "" : "/"}${p}`;
}

function Fighter({ c, win }: { c: CardData; win: boolean }) {
  const t = elementTheme(c.element);
  const avatar = abs(c.avatarUrl);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320, opacity: win ? 1 : 0.55 }}>
      <div style={{ display: "flex", width: 240, height: 240, borderRadius: 24, overflow: "hidden", border: `8px solid ${win ? "#f59e0b" : "#374151"}`, background: t.grad[0] }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} width={240} height={240} style={{ width: 240, height: 240, objectFit: "cover" }} alt="" />
        ) : (
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 80, fontWeight: 800, color: "#fff" }}>{c.name.slice(0, 1)}</div>
        )}
      </div>
      <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#fff", marginTop: 16 }}>{c.name}</div>
      <div style={{ display: "flex", fontSize: 18, color: t.color, marginTop: 2 }}>{`${t.label} · Lv ${c.level}`}</div>
      {win && <div style={{ display: "flex", fontSize: 18, fontWeight: 900, color: "#f59e0b", marginTop: 8, letterSpacing: 1 }}>WINNER</div>}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ matchup: string }> }) {
  const { matchup } = await params;
  const mm = parseMatchup(matchup);
  const battle = mm ? await resolveCardBattle(mm.a, mm.b) : null;

  if (!battle) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f14", color: "#fff", fontSize: 48, fontWeight: 800 }}>MY AI PET — card duel</div>,
      { ...size },
    );
  }

  const youWin = battle.winner === "you";
  const winName = youWin ? battle.you.name : battle.opp.name;
  const r = battle.result;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, #0f0f14, #1e293b)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Fighter c={battle.you} win={youWin} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 200 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 900, color: "#94a3b8" }}>VS</div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#f59e0b", marginTop: 8 }}>{`${winName} wins!`}</div>
            <div style={{ display: "flex", fontSize: 15, color: "#94a3b8", marginTop: 6 }}>{`${r.turns} turns`}</div>
          </div>
          <Fighter c={battle.opp} win={!youWin} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 34 }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>MY AI PET</div>
          <div style={{ display: "flex", fontSize: 18, color: "#94a3b8", marginLeft: 12 }}>· card duel</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
