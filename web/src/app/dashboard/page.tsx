/**
 * Legacy power leaderboard.
 *
 * The launch product ranks Season Rewards points in the in-app hub. The old
 * page ranked a different "combined power" metric and linked to a removed
 * `/p/:id` profile route, so keep one canonical surface and redirect old URLs.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Season Rewards — MY AI PET",
  robots: { index: false, follow: false },
};

export default function LegacyDashboardPage() {
  redirect("/?section=airdrop");
}
