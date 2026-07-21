import AccountWithNav from "./AccountWithNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Account — MY AI PET",
  description: "Your plan, credits, usage, and billing ledger — real data, owner-only.",
};

export default function AccountPage() {
  return <AccountWithNav />;
}
