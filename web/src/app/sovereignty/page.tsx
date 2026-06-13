import SovereigntyWithNav from "@/components/SovereigntyWithNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "PetClaw — MY AI PET",
  description: "Own your pet's data. Memory ledger, SOUL export, connected platforms — all yours.",
};

export default function SovereigntyPage() {
  return <SovereigntyWithNav />;
}
