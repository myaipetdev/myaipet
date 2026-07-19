/**
 * /season — canonical clean URL for the Season Rewards hub.
 *
 * The hub itself lives inside the home SPA at /?section=season; this route just
 * gives it a shareable top-level path (and replaces the old 404) by redirecting
 * into the SPA with the section pre-selected.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Season Rewards — MY AI PET",
};

export default function SeasonPage() {
  redirect("/?section=season");
}
