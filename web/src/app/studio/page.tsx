import StudioWithNav from "@/components/StudioWithNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Studio — MY AI PET",
  description: "Pro AI video generation for your pet — multi-model, pet anchor, audio.",
};

export default function StudioPage() {
  return <StudioWithNav />;
}
