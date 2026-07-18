import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MY AI PET - Documentation",
  description: "Official documentation for MY AI PET — the Companion Protocol.",
};

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    content: `MY AI PET is a Companion Protocol that combines AI-powered virtual pet companionship with a sovereign, portable identity. Users adopt, raise, and bond with unique AI pets that remember them, grow, evolve, and create shareable AI content.

Every pet has a distinct personality shaped by user interactions. The platform uses state-of-the-art generative AI to create images and videos starring your pet — each piece of content is a unique creative asset.`,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: `**1. Connect Your Wallet**
Connect using MetaMask, Rainbow, Coinbase Wallet, or any WalletConnect-compatible wallet. Sign-in (SIWE) works with any EVM wallet — no gas, identity only. On-chain anchoring is disabled. Two legacy contracts remain paused on BSC; a future Base deployment is planned but has no launch date. The off-chain loyalty system uses non-transferable Credits and Season Rewards points — no token.

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
- Next.js API Routes (serverless)
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
- Two legacy contracts are deployed and paused on BSC
- A future Base deployment and external audit are planned; no activation date is committed — see /contracts for current status

**Wallet Support**
- MetaMask, Rainbow, Coinbase Wallet
- WalletConnect protocol for 300+ wallets
- SIWE wallet sign-in; the configured BSC USDT checkout is currently disabled`,
  },
  {
    id: "agent-infra",
    title: "Agent Infrastructure",
    content: `Under the consumer experience is a real, coordinated agent loop — not a single stateless prompt. Every piece below maps to running code.

**VIGIL — always-on self-improvement**
- Runs on every chat turn: a memory ledger (fact extraction), implicit feedback estimation, and self-learning pattern promotion
- A bond / self-reflect pass runs periodically and reshapes future replies — self-evolution, not a frozen prompt
- CHORUS (best-of-N candidate selection) is opt-in

**Plan to Act — the agent loop**
- A reasoning model plans each step, a real skill is invoked, the result is observed, and it iterates until done — then a chat model synthesizes the answer
- Owner-authenticated and credit-metered: it runs real skills, not just text

**Agent Workbench**
- Give your pet a goal and watch the loop run as work packages: a preflight check, plan/act/observe per step, a final report, retry/recover on failure, and the session persists across reloads
- Reachable from the home page or at ?section=workbench

**Recall — memory retrieval**
- Every turn pulls the most relevant memories via reciprocal-rank fusion over keyword (full-text) + recency + importance
- Semantic (vector) recall activates when you connect an embedding-capable model key (OpenAI / Google) via BYOK

**PACK — pet-to-pet (A2A)**
- Public pet discovery is live; remote skill invocation is disabled until it has dedicated consent, public-only context, and caller-funded execution

**Build on it — the open SDK**
- Published on npm: npm i @myaipet/petclaw-sdk
- CLI flow: petclaw-sdk init, then install a skill, then models connect for your own model (BYOK), then mcp
- MCP-native: expose your pet to Claude Desktop or Cursor as an MCP server (6 tools)
- 18 skills, a 19-connector registry (6 live today), and data-sovereignty exports — see /api-docs for the reference`,
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
- Two legacy contracts remain paused on BSC
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

function TableOfContents() {
  return (
    <nav style={{
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
    </nav>
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
      {/* Header */}
      <header style={{
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
      <div style={{
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
          where AI companionship creates real value.
        </p>
      </div>

      {/* Content */}
      <div style={{
        display: "flex", gap: 48, maxWidth: 1060,
        margin: "0 auto", padding: "40px 40px 80px",
        alignItems: "flex-start",
      }}>
        <TableOfContents />
        <main style={{ flex: 1, minWidth: 0 }}>
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
