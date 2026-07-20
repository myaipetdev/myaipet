import type { NextConfig } from "next";

// Security headers applied to every response by Next.js.
// nginx layer can add more, but these are the baseline.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // CSP: allow self + inline (Next.js needs it), Grok/FAL endpoints, BSC RPC, WalletConnect
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // RainbowKit's runtime locale switch creates a chunk for every supported
  // language even though this release pins RainbowKitProvider to English.
  // Replace the locked dependency's unreachable Korean locale module before
  // Turbopack emits public/server chunks. The shim preserves the module shape
  // without shipping Korean copy that the product can never select.
  turbopack: {
    resolveAlias: {
      "./ko_KR-FR54RFUG.js": "./src/lib/rainbowkitEnglishLocale.ts",
    },
  },
  // Compile the public, non-secret browser kill-switch from the authoritative
  // server flag so direct wallet-write UI cannot drift from relayer policy.
  env: {
    NEXT_PUBLIC_BLOCKCHAIN_ENABLED:
      process.env.BLOCKCHAIN_ENABLED === "true" ? "true" : "false",
  },
  // Server-side storage uses runtime paths. Without narrow trace exclusions,
  // @vercel/nft can conservatively pull the whole workspace (including .env)
  // into a route artifact. Runtime code is compiled under .next/server; raw
  // project sources, build inputs and secrets are never needed there.
  outputFileTracingExcludes: {
    "/*": [
      ".env",
      ".env.*",
      ".next/dev/**/*",
      ".next/cache/**/*",
      ".next/standalone/**/*",
      "Dockerfile*",
      "SETUP.md",
      "README.md",
      "next.config.*",
      "prisma.config.*",
      "eslint.config.*",
      "tsconfig*.json",
      "tsconfig*.tsbuildinfo",
      "ds-*",
      "render-village.cjs",
      "prisma/**/*",
      "public/**/*",
      "scripts/**/*",
      "src/**/*",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
    ],
  },
  poweredByHeader: false, // SCRUM-40: drop x-powered-by header
  serverExternalPackages: ["ws", "pg", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/adapter-pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.vercel-storage.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "imgen.x.ai" },
    ],
  },
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: "/api/media/:path*" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
