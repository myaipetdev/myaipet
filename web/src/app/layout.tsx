import type { Metadata } from "next";
import { Space_Grotesk, Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import Providers from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

// ── Collectible Editorial type system ──
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const hanken = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const spaceMono = Space_Mono({
  variable: "--font-mono-ed",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "MY AI PET — Your AI Companion, Portable & Yours",
  description: "The first AI companion you actually own. Persistent memory, data sovereignty, and cross-platform presence — powered by PetClaw Protocol.",
  other: {
    google: "notranslate",
  },
  icons: {
    // Keep both declarations on a file that is part of this release. The old
    // The legacy favicon URL survived on the EC2 host from a previous deploy but was not
    // present in `public/`, so a clean release could silently lose its favicon.
    icon: "/apple-touch-icon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "MY AI PET — Your AI Companion, Portable & Yours",
    description: "The first AI companion you actually own. Your data, your memories, your rules.",
    url: APP_URL,
    siteName: "MY AI PET",
    images: [
      {
        url: `${APP_URL}/og-image.jpg`,
        width: 1024,
        height: 1024,
        alt: "MY AI PET — PetClaw Protocol",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MY AI PET — Your AI Companion, Portable & Yours",
    description: "The first AI companion you actually own. Powered by PetClaw Protocol.",
    images: [`${APP_URL}/og-image.jpg`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body
        className={`${spaceGrotesk.variable} ${bricolage.variable} ${hanken.variable} ${spaceMono.variable}`}
        style={{ background: "#ECE4D4" }}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
