import type { Metadata } from "next";
import { RELEASE_STATUS } from "@/lib/releaseStatus";

export const metadata: Metadata = {
  title: "MY AI PET - Documentation",
  description: "Official documentation for MY AI PET — the Companion Protocol.",
};

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    content: `MY AI PET is a companion product built on an owner-controlled identity, retained-memory, and consent layer. Users adopt, raise, and bond with AI pets that can use selected retained context, progress through in-app stages, and create shareable AI content.

Each pet has a configurable personality and owner-scoped history. The platform uses routed generative models to create images and videos starring your pet; outputs are creative media, not automatically on-chain assets.`,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: `**1. Connect Your Wallet**
Connect using MetaMask, Rainbow, Coinbase Wallet, or any WalletConnect-compatible wallet. Sign-in (SIWE) works with any EVM wallet — no gas, identity only. Production on-chain integration is disabled. Two legacy BSC contracts returned paused() = false with zero activity/supply counters at the 2026-07-18 launch review; a future Base deployment is planned but has no launch date. The off-chain loyalty system uses non-transferable Credits and Season Rewards points — no token.

**2. Sign In**
Sign a message to verify wallet ownership (SIWE — Sign-In with Ethereum). No gas fees for signing.

**3. Adopt Your Pet**
Choose a name, select a species (Cat, Dog, Parrot, Turtle, Hamster, Rabbit, Fox, Pomeranian), and pick from 12 unique personalities. Your pet's AI avatar is generated on-the-fly.

**4. Start Raising**
Interact with your pet — feed, play, talk, pet, walk, and train. Each interaction shapes your pet's personality, mood, and bond level.`,
  },
  {
    id: "pets",
    title: "Pet System",
    content: `**Species**
8 species available at launch: Cat, Dog, Parrot, Turtle, Hamster, Rabbit, Fox, and Pomeranian. Each species has unique visual traits and base characteristics.

**Personalities**
12 distinct personality types: Friendly, Playful, Shy, Brave, Lazy, Curious, Mischievous, Gentle, Adventurous, Dramatic, Wise, and Sassy. Personality affects how your pet responds to interactions and how AI content is generated.

**Stats & Growth**
- **Level** — Increases through experience earned from interactions and content creation
- **Happiness** — Affected by regular care and positive interactions
- **Energy** — Depleted by activities, restored over time
- **Bond Level** — Deepens through consistent companionship
- **Mood** — Dynamic state reflecting recent interactions
- **Evolution** — 5 stages (Baby → Young → Adult → Elder → Legendary) at levels 1, 5, 10, 20, and 35. Each completed evolution records a milestone and grants 50 credits; skills are learned separately.

**Memories**
Pets form memories of significant interactions, milestones, and generated content. These memories influence future behavior and create a rich narrative history.`,
  },
  {
    id: "ai-generation",
    title: "AI Content Generation",
    content: `**Current model catalog**
Studio reads availability and per-run credit cost from the live /api/studio/providers catalog. The picker is the source of truth: unavailable membership models and roadmap models are visibly locked and cannot be submitted.

- Default image: Grok Imagine — 5 credits
- Default video: Grok Imagine Video — 25 credits
- Additional xAI- and FAL-backed engines appear only with their current price and availability state
- Provider availability can change; a listed but locked model is not a shipped generation option

**How It Works**
1. Select your pet and choose image or video
2. Pick a style preset and write an optional custom prompt
3. The system builds a personalized prompt incorporating your pet's identity
4. AI generates the content
5. Content is saved and can be shared in the Community gallery`,
  },
  {
    id: "pet-economy",
    title: "Credits & Season Points",
    content: `**Two currencies — keep them straight**
- **Season Rewards points** — non-financial recognition gained through gameplay (free). Drives the Season 1 leaderboard. Not a token, security, or transferable claim — no redemption path.
- **Credits** — the balance spent on AI generation and selected features. New accounts receive a staged starter grant; the purchase rail is currently paused.

The current system is loyalty-only — no token mint, no buyback-and-burn.

**Gaining points (free)**
- Daily check-in: +5 up to +50/day (grows with your streak, day 1–7)
- AI creation: +10 per image · +20 per video
- Daily interactions (feed, play, talk): +5 each (daily-capped)
- Level up: +50
- Chat with your pet: +2 · community likes/comments: +1–3

**Spending credits**
- Image generation: from 5 credits per styled image
- Video generation: 25–120 credits (based on model)
- Selected in-app features

**Purchasing credits (currently paused)**
USDT checkout is unavailable and no reopening date is announced. The configured packs, if purchasing is re-enabled after review, are:
- Starter: 100 credits for 5 USDT
- Creator: 500 credits for 20 USDT (most popular)
- Pro: 2,000 credits for 50 USDT

**Note**
Credits are a non-financial loyalty mechanism. They are not a token, security, or transferable claim.`,
  },
  {
    id: "community",
    title: "Community & Social",
    content: `**Social Gallery**
Browse and discover AI-generated content from all users. Like, comment, and share your favorite creations.

**Analytics**
Operational metrics (DAU, generations, revenue) are available to verified team members and backers in the admin dashboard.`,
  },
  {
    id: "technical",
    title: "Technical Architecture",
    content: `**Frontend**
- Next.js (App Router) with React
- RainbowKit + wagmi for wallet connectivity
- WalletConnect protocol for mobile wallet support
- Server-side rendering with SSR-safe hydration

**Backend**
- Next.js App Router API routes on AWS EC2 behind nginx and PM2
- PostgreSQL database (self-hosted)
- Prisma ORM
- JWT-based session management after SIWE authentication

**AI Pipeline**
- AI image generation engine
- AI video generation engine
- Personalized prompt engineering per pet identity
- Async video processing with status polling

**On-Chain (planned · not live)**
- On-chain anchoring and minting are disabled
- Credits and Season Rewards points are separate, non-transferable off-chain balances — no token or on-chain settlement of value
- USDT credit purchases are currently paused with no announced reopening date
- Two legacy BSC contracts returned paused() = false with zero activity/supply counters at the 2026-07-18 launch review; the production integration remains disabled
- A future Base deployment and external audit are planned; no activation date is committed — see /contracts for current status

**Wallet Support**
- MetaMask, Rainbow, Coinbase Wallet
- WalletConnect protocol for 300+ wallets
- SIWE wallet sign-in; the configured BSC USDT checkout is currently disabled`,
  },
  {
    id: "agent-infra",
    title: "Agent Infrastructure",
    content: `PetClaw is the owner-controlled companion identity, memory, and consent layer. It includes a paid typed-task runner, but it is not a general-purpose coding-agent runtime or an autonomous operating system.

**VIGIL — bounded memory and adaptation**
- Canonical chat can retain selected durable facts and normalized session messages; retention is best-effort and owner-editable
- Feedback needs a later reaction, periodic bond reflection can no-op, and learned patterns are not executable skills
- CHORUS (best-of-N candidate selection) is optional and disabled by default

**Typed paid tasks — one tool, one deliverable**
- Every new task requires Recall, Summarize, Review, or Draft and at most 2,000 characters of owner input
- The server binds the selection to one approved read-only tool; deprecated maxSteps compatibility is normalized to 1
- Recall returns retrieved owner-private facts plus a grounded answer; Summarize returns a structured decision brief; Review returns a primary issue plus revision; Draft returns reviewable text without sending or publishing it
- The required tool does not write pet memory or self-learning data. Owner-private task input, result, trace, and billing history are stored for reconciliation
- The response includes the exact server receipt. Failures, refusals, tool mismatches, empty recall, and non-contract outputs are refunded

**Agent Workbench**
- Choose Recall, Summarize, Review, or Draft and inspect the one required read-only tool result
- Owner-private run history and server receipts remain available in Account; an unsettled paid run can be reconciled by its saved run ID
- Reachable from the home page or at ?section=workbench

**Recall — memory retrieval**
- Relevant selected context is ranked with TF-IDF/recency/importance signals; reciprocal-rank fusion combines available retrieval channels
- Semantic recall is conditional on an embedding-capable model connection; not every turn has vectors or injects the full history

**PACK — pet-to-pet (A2A)**
- Public pet discovery is live; remote skill invocation is disabled until it has dedicated consent, public-only context, and caller-funded execution

**Build on it — the open SDK**
- SDK ${RELEASE_STATUS.sdkVersion} release contract: taskKind is mandatory; verify npm's reported version before relying on it
- CLI flow: petclaw-sdk init, then install a skill, then models connect for your own model (BYOK)
- MCP: SDK ${RELEASE_STATUS.sdkVersion} defines 7 owner-authenticated stdio tools; supported clients can run petclaw-sdk mcp after owner authentication
- 18 built-in skill manifests, a 19-connector registry (3 live today; messaging delivery launch-paused), and bounded data-sovereignty export/import — see /api-docs for the exact contract`,
  },
  {
    id: "roadmap",
    title: "Roadmap",
    content: `**Phase 1 — Foundation (Completed)**
- Pet adoption and raising system (12 personalities)
- AI image and video generation
- Social gallery and community features
- Points + credits economy with credit tiers
- Wallet authentication (SIWE)
- AI avatar generation for pets

**Phase 2 — On-Chain Activity (Planned · disabled today)**
- On-chain anchoring and minting are not active
- USDT credit purchases are paused with no announced reopening date
- Two legacy BSC contracts returned paused() = false with zero counters at the 2026-07-18 launch review; production integration remains disabled
- Base deployment, verification, and external audit are future milestones with no committed date

**Phase 3 — Evolution & Marketplace (Partially shipped)**
- Live: pet evolution and My Pet achievement milestones
- Live: built-in PetClaw skill registry
- Not in the launch navigation: Adventure, battle arena, cosmetic marketplace, equipment trading, and user-to-user item trading
- Dormant modules remain in the codebase but are not advertised as available product surfaces

**Phase 4 — Social Expansion**
- Social circles and group activities
- Memorial system for retired pets
- Community governance and proposals
- Cross-platform companion integration`,
  },
];

function TocLinks() {
  return (
    <>
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} style={{
          display: "block", padding: "6px 0",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 500,
          color: "rgba(26,26,46,0.65)", textDecoration: "none",
          borderLeft: "2px solid rgba(0,0,0,0.06)", paddingLeft: 14,
          transition: "all 0.2s",
        }}>
          {s.title}
        </a>
      ))}
    </>
  );
}

// Desktop: sticky left rail. Hidden ≤768px (see the media query in DocsPage) —
// the fixed 200px rail crushed the body to ~47px at 375px viewports.
function TableOfContents() {
  return (
    <nav className="docs-toc-desktop" aria-label="Contents" style={{
      position: "sticky", top: 80, alignSelf: "start",
      padding: "20px 0", minWidth: 200,
    }}>
      <div style={{
        fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.35)",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14,
        fontWeight: 600,
      }}>
        Contents
      </div>
      <TocLinks />
    </nav>
  );
}

// Mobile (≤768px): collapsible TOC — native details/summary, no JS needed in
// this server component. Hidden on desktop.
function MobileTableOfContents() {
  return (
    <details className="docs-toc-mobile" style={{
      margin: "0 0 24px",
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12,
      background: "rgba(0,0,0,0.02)",
      padding: "12px 16px",
    }}>
      <summary style={{
        cursor: "pointer",
        fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.55)",
        textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
        listStyle: "none",
      }}>
        Contents ▾
      </summary>
      <nav aria-label="Contents" style={{ paddingTop: 12 }}>
        <TocLinks />
      </nav>
    </details>
  );
}

function DocSection({ id, title, content }: { id: string; title: string; content: string }) {
  const paragraphs = content.split("\n\n");
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 100 }}>
      <h2 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700,
        color: "#1a1a2e", marginBottom: 16,
        paddingBottom: 10, borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        {title}
      </h2>
      <div style={{
        fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.65)",
        lineHeight: 1.9,
      }}>
        {paragraphs.map((p, i) => {
          if (p.startsWith("- **")) {
            const items = p.split("\n");
            return (
              <ul key={i} style={{ paddingLeft: 20, margin: "12px 0" }}>
                {items.map((item, j) => {
                  const cleaned = item.replace(/^- /, "");
                  return (
                    <li key={j} style={{ marginBottom: 6 }}
                      dangerouslySetInnerHTML={{
                        __html: cleaned
                          .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a1a2e">$1</strong>')
                      }}
                    />
                  );
                })}
              </ul>
            );
          }
          if (p.startsWith("**") && p.includes("\n")) {
            const lines = p.split("\n");
            const heading = lines[0].replace(/\*\*/g, "");
            const rest = lines.slice(1).join("\n");
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <h3 style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600,
                  color: "#1a1a2e", marginBottom: 6, marginTop: 20,
                }}>
                  {heading}
                </h3>
                <div dangerouslySetInnerHTML={{
                  __html: rest
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a1a2e">$1</strong>')
                    .replace(/\n- /g, '<br/>• ')
                    .replace(/\n/g, '<br/>')
                }} />
              </div>
            );
          }
          return (
            <p key={i} style={{ marginBottom: 14 }}
              dangerouslySetInnerHTML={{
                __html: p
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a1a2e">$1</strong>')
                  .replace(/\n- /g, '<br/>• ')
                  .replace(/\n/g, '<br/>')
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2", color: "#1a1a2e",
    }}>
      <style>{`
        /* ≤768px: single column — the sticky 200px rail + 48px gap + 40px
           page padding crushed the body column (451px scroll width at 375px).
           Mobile gets a collapsible details TOC instead; no horizontal scroll. */
        .docs-toc-mobile { display: none; }
        .docs-toc-mobile > summary::-webkit-details-marker { display: none; }
        @media (max-width: 768px) {
          .docs-layout {
            display: block !important;
            padding: 24px 16px 60px !important;
            max-width: 100% !important;
          }
          .docs-toc-desktop { display: none !important; }
          .docs-toc-mobile { display: block; }
          .docs-header { padding: 14px 16px !important; }
          .docs-hero { padding: 40px 16px 28px !important; }
          .docs-hero h1 { font-size: 30px !important; }
          .docs-main { max-width: 100%; overflow-wrap: break-word; }
        }
      `}</style>
      {/* Header */}
      <header className="docs-header" style={{
        padding: "20px 40px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(250,247,242,0.95)",
        backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/mascot.jpg" alt="MY AI PET" style={{
              width: 34, height: 34, borderRadius: 10, objectFit: "cover",
              border: "2px solid rgba(251,191,36,0.25)",
            }} />
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16,
              color: "#1a1a2e",
            }}>
              MY AI PET
            </span>
          </a>
          <span style={{
            fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.4)",
            padding: "3px 10px", borderRadius: 6,
            background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
          }}>
            Documentation
          </span>
        </div>
        <a href="/" style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
          color: "#b45309", textDecoration: "none",
          padding: "8px 20px", borderRadius: 10,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)",
        }}>
          Launch App
        </a>
      </header>

      {/* Hero */}
      <div className="docs-hero" style={{
        textAlign: "center", padding: "60px 40px 40px",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
      }}>
        <h1 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700,
          color: "#1a1a2e", marginBottom: 12,
        }}>
          Documentation
        </h1>
        <p style={{
          fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.65)",
          maxWidth: 560, margin: "0 auto", lineHeight: 1.8,
        }}>
          Everything you need to know about MY AI PET — the Companion Protocol
          for portable AI companionship, creative tools, and non-financial progression.
        </p>
      </div>

      {/* Content */}
      <div className="docs-layout" style={{
        display: "flex", gap: 48, maxWidth: 1060,
        margin: "0 auto", padding: "40px 40px 80px",
        alignItems: "flex-start",
      }}>
        <TableOfContents />
        <main className="docs-main" style={{ flex: 1, minWidth: 0 }}>
          <MobileTableOfContents />
          {SECTIONS.map((s) => (
            <DocSection key={s.id} {...s} />
          ))}
        </main>
      </div>

      {/* Footer */}
      <footer style={{
        padding: "30px 40px", textAlign: "center",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{
          fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.35)",
        }}>
          &copy; 2026 My AI PET Protocol &middot; Raise &middot; Bond &middot; Earn
        </div>
      </footer>
    </div>
  );
}
