import type { Metadata } from "next";
import { getCardData, elementTheme, rarityColor } from "@/lib/tcg/card";
import CardActions from "./CardActions";
import PetCard from "@/components/PetCard";
import Icon from "@/components/Icon";

// Public, wallet-free share page for a pet's trading card. The card image is the
// opengraph-image route (Next auto-wires it as og:image + twitter summary_large
// _image), so a shared /card/<petId> unfurls the full card on X.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";

// Collectible Editorial "card vault" — warm-dark panel with foil-gold type
// (the sanctioned dark tile for share surfaces). Root layout loads the next/font
// vars, but every stack carries the explicit family as fallback.
const VAULT = "#1E1710";
const FOIL_GOLD = "#E8C77E";
const CREAM = "rgba(251,246,236,.72)";
const DISP = "var(--ed-disp, 'Bricolage Grotesque'), 'Bricolage Grotesque', system-ui, sans-serif";
const BODY = "var(--ed-body, 'Hanken Grotesk'), 'Hanken Grotesk', system-ui, sans-serif";
const MONO = "var(--ed-m, 'Space Mono'), 'Space Mono', ui-monospace, monospace";
const ctaPill: React.CSSProperties = {
  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontFamily: BODY,
  fontWeight: 800, fontSize: 14.5, padding: "12px 22px", borderRadius: 999, textDecoration: "none",
  boxShadow: "0 10px 20px -12px rgba(226,125,12,.7)",
};

export async function generateMetadata(
  { params }: { params: Promise<{ petId: string }> },
): Promise<Metadata> {
  const { petId } = await params;
  const card = await getCardData(parseInt(petId, 10));
  if (!card) {
    return {
      title: "Trading cards — MY AI PET",
      description: "Turn your AI pet into a collectible trading card. Create your own in 30 seconds.",
    };
  }
  const title = `${card.name} — ${card.rarity} ${elementTheme(card.element).label} card · MY AI PET`;
  const description = `Lv ${card.level} · ATK ${card.atk} / DEF ${card.def} / SPD ${card.spd} · Power ${card.power}. Collect and battle your own AI pet on MY AI PET.`;
  return { title, description };
}

export default async function CardPage(
  { params }: { params: Promise<{ petId: string }> },
) {
  const { petId } = await params;
  const id = parseInt(petId, 10);
  const card = await getCardData(id);

  if (!card) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: VAULT, color: "#FBF6EC", fontFamily: BODY, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, lineHeight: 0, color: FOIL_GOLD }}><Icon name="trophy" size={40} /></div>
        <h1 style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: FOIL_GOLD, margin: 0 }}>This card isn&apos;t available</h1>
        <p style={{ color: CREAM, maxWidth: 420, fontSize: 14.5, lineHeight: 1.55 }}>Turn your own AI pet into a collectible trading card — raise it, battle it, share it.</p>
        <a href={APP_URL} style={ctaPill}>Create your pet ▸</a>
      </main>
    );
  }

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  const imgUrl = `/card/${id}/opengraph-image`;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "40px 20px", background: `radial-gradient(120% 85% at 50% -12%, ${t.grad[0]}, ${VAULT} 62%)`, fontFamily: BODY }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", color: rc, textTransform: "uppercase" }}>
        {card.rarity} · {t.label} card
      </div>
      <h1 style={{ fontFamily: DISP, fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", color: FOIL_GOLD, margin: 0, textAlign: "center" }}>{card.name}</h1>

      {/* Crisp portrait card (the landscape OG PNG is only for X-unfurl/download).
          PetCard carries the in-app pointer holo-tilt, so the share page card
          reacts the same way the album card does. */}
      <PetCard card={card} maxWidth={400} />

      <CardActions petId={id} name={card.name} imgUrl={imgUrl} appUrl={APP_URL} />

      <a href={APP_URL} style={{ ...ctaPill, marginTop: 8 }}>
        Make your own AI pet card ▸
      </a>
    </main>
  );
}
