import SettingsWithNav from "@/components/SettingsWithNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Your Models — MY AI PET",
  description: "Bring your own model (BYOK) and run the plan-execute agent loop. Your keys, your models, your rules.",
};

export default function SettingsPage() {
  return <SettingsWithNav />;
}
