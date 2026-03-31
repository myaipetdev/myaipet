import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import Providers from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aipet-demo.vercel.app"),
  title: "MY AI PET - Your Pet, Brought to Life",
  description: "Adopt an AI pet that grows with you. AI-generated content on-chain. The first full-cycle Web3 revenue ecosystem driven by emotional AI companionship.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "MY AI PET - Your Pet, Brought to Life",
    description: "Adopt an AI pet that grows with you. AI-generated content on-chain.",
    url: "https://aipet-demo.vercel.app",
    siteName: "MY AI PET",
    images: [
      {
        url: "https://aipet-demo.vercel.app/og-image.jpg",
        width: 1024,
        height: 1024,
        alt: "MY AI PET",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MY AI PET - Your Pet, Brought to Life",
    description: "Adopt an AI pet that grows with you. AI-generated content on-chain.",
    images: ["https://aipet-demo.vercel.app/og-image.jpg"],
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
