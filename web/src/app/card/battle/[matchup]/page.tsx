import type { Metadata } from "next";
import { resolveCardBattle, parseMatchup } from "@/lib/tcg/battle";
import PetCard from "@/components/PetCard";
import ShareButtons from "./ShareButtons";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";

export async function generateMetadata({ params }: { params: Promise<{ matchup: string }> }): Promise<Metadata> {
  const { matchup } = await params;
  const mm = parseMatchup(matchup);
  const battle = mm ? await resolveCardBattle(mm.a, mm.b) : null;
  if (!battle) return { title: "Card duel — MY AI PET" };
  const winName = battle.winner === "you" ? battle.you.name : battle.opp.name;
  const title = `${battle.you.name} vs ${battle.opp.name} — ${winName} wins · MY AI PET`;
  return { title, description: `A card duel on MY AI PET. Raise & battle your own AI pet card.` };
}

export default async function BattleResultPage({ params }: { params: Promise<{ matchup: string }> }) {
  const { matchup } = await params;
  const mm = parseMatchup(matchup);
  const battle = mm ? await resolveCardBattle(mm.a, mm.b) : null;

  if (!battle) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "#0f0f14", color: "#fff", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>⚔️</div>
        <h1 style={{ fontSize: 24, margin: 0 }}>This duel isn&apos;t available</h1>
        <a href={APP_URL} style={{ background: "#f59e0b", color: "#1a1a22", fontWeight: 800, padding: "12px 22px", borderRadius: 999, textDecoration: "none" }}>Make your own pet ▸</a>
      </main>
    );
  }

  const youWin = battle.winner === "you";
  const winName = youWin ? battle.you.name : battle.opp.name;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 20px", background: "linear-gradient(160deg, #1e293b, #0f0f14 70%)", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b", letterSpacing: 0.5 }}>🏆 {winName} wins!</div>
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>{battle.result.turns} turns · card duel</div>

      <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ width: 240, opacity: youWin ? 1 : 0.7, transform: youWin ? "scale(1.04)" : "none" }}>
          <PetCard card={battle.you} maxWidth={240} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, color: "#94a3b8" }}>VS</div>
        <div style={{ width: 240, opacity: youWin ? 0.7 : 1, transform: youWin ? "none" : "scale(1.04)" }}>
          <PetCard card={battle.opp} maxWidth={240} />
        </div>
      </div>

      <ShareButtons matchup={`${mm!.a}-vs-${mm!.b}`} you={battle.you.name} opp={battle.opp.name} winner={winName} appUrl={APP_URL} />

      <a href={APP_URL} style={{ marginTop: 6, color: "#fff", opacity: 0.85, fontSize: 14, textDecoration: "none", fontWeight: 700 }}>Make your own AI pet card ▸</a>
    </main>
  );
}
