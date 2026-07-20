import type { Metadata } from "next";
import { resolveCardBattle, parseMatchup } from "@/lib/tcg/battle";
import PetCard from "@/components/PetCard";
import Icon from "@/components/Icon";
import ShareButtons from "./ShareButtons";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";

// Collectible Editorial "card vault" — same treatment as /card/[petId]: warm-dark
// panel, foil-gold type, gradient CTA. Explicit family fallbacks in every stack.
const VAULT = "#1E1710";
const FOIL_GOLD = "#E8C77E";
const DISP = "var(--ed-disp, 'Bricolage Grotesque'), 'Bricolage Grotesque', system-ui, sans-serif";
const BODY = "var(--ed-body, 'Hanken Grotesk'), 'Hanken Grotesk', system-ui, sans-serif";
const MONO = "var(--ed-m, 'Space Mono'), 'Space Mono', ui-monospace, monospace";
const ctaPill: React.CSSProperties = {
  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontFamily: BODY,
  fontWeight: 800, fontSize: 14.5, padding: "12px 22px", borderRadius: 999, textDecoration: "none",
  boxShadow: "0 10px 20px -12px rgba(226,125,12,.7)",
};

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
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: VAULT, color: "#FBF6EC", fontFamily: BODY, padding: 24, textAlign: "center" }}>
        <div style={{ color: FOIL_GOLD }}><Icon name="sword" size={40} /></div>
        <h1 style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: FOIL_GOLD, margin: 0 }}>This duel isn&apos;t available</h1>
        <a href={APP_URL} style={ctaPill}>Make your own pet ▸</a>
      </main>
    );
  }

  const youWin = battle.winner === "you";
  const winName = youWin ? battle.you.name : battle.opp.name;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 20px", background: `radial-gradient(120% 85% at 50% -12%, #3A2414, ${VAULT} 62%)`, fontFamily: BODY }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: DISP, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: FOIL_GOLD }}><Icon name="trophy" size={24} /> {winName} wins!</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(251,246,236,.55)" }}>{battle.result.turns} turns · card duel</div>

      <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ width: 240, opacity: youWin ? 1 : 0.7, transform: youWin ? "scale(1.04)" : "none" }}>
          <PetCard card={battle.you} maxWidth={240} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, letterSpacing: "0.1em", color: FOIL_GOLD }}>VS</div>
        <div style={{ width: 240, opacity: youWin ? 0.7 : 1, transform: youWin ? "none" : "scale(1.04)" }}>
          <PetCard card={battle.opp} maxWidth={240} />
        </div>
      </div>

      <ShareButtons matchup={`${mm!.a}-vs-${mm!.b}`} you={battle.you.name} opp={battle.opp.name} winner={winName} appUrl={APP_URL} />

      <a href={APP_URL} style={{ ...ctaPill, marginTop: 6 }}>Make your own AI pet card ▸</a>
    </main>
  );
}
