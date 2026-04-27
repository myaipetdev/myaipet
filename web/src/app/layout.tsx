import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import Providers from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://3.34.197.230";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "MY AI PET — Your AI Companion, On-Chain",
  description: "The first AI companion you actually own. Persistent memory, data sovereignty, and cross-platform presence — powered by PetClaw Protocol.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "MY AI PET — Your AI Companion, On-Chain",
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
    title: "MY AI PET — Your AI Companion, On-Chain",
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
    <html lang="en">
      <body
        className={spaceGrotesk.variable}
        style={{ background: "#faf7f2" }}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
