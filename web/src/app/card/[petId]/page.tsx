import type { Metadata } from "next";
import { getCardData, elementTheme, rarityColor } from "@/lib/tcg/card";
import CardActions from "./CardActions";
import PetCard from "@/components/PetCard";

// Public, wallet-free share page for a pet's trading card. The card image is the
// opengraph-image route (Next auto-wires it as og:image + twitter summary_large
// _image), so a shared /card/<petId> unfurls the full card on X.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";

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
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "#0f0f14", color: "#fff", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🃏</div>
        <h1 style={{ fontSize: 24, margin: 0 }}>This card isn&apos;t available</h1>
        <p style={{ color: "#9a9aa3", maxWidth: 420 }}>Turn your own AI pet into a collectible trading card — raise it, battle it, share it.</p>
        <a href={APP_URL} style={{ background: "#f59e0b", color: "#1a1a22", fontWeight: 800, padding: "12px 22px", borderRadius: 999, textDecoration: "none" }}>Create your pet ▸</a>
      </main>
    );
  }

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  const imgUrl = `/card/${id}/opengraph-image`;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 20px", background: `linear-gradient(160deg, ${t.grad[0]}, #0f0f14 70%)`, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: "0.2em", color: rc, textTransform: "uppercase" }}>
        {card.rarity} · {t.label} card
      </div>

      {/* Crisp portrait card (the landscape OG PNG is only for X-unfurl/download) */}
      <PetCard card={card} maxWidth={400} />

      <CardActions petId={id} name={card.name} imgUrl={imgUrl} appUrl={APP_URL} />

      <a href={APP_URL} style={{ marginTop: 8, color: "#fff", opacity: 0.85, fontSize: 14, textDecoration: "none", fontWeight: 700 }}>
        Make your own AI pet card ▸
      </a>
    </main>
  );
}
