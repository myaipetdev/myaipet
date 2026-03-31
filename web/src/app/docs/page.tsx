import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MY AI PET - Documentation",
  description: "Official documentation for MY AI PET — the CompanionFi protocol.",
};

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    content: `MY AI PET is a CompanionFi protocol that combines AI-powered virtual pet companionship with Web3 economics. Users adopt, raise, and bond with unique AI pets that grow, evolve, and generate real economic value through AI content creation.

Every pet has a distinct personality shaped by user interactions. The platform uses state-of-the-art generative AI to create images and videos starring your pet — each piece of content is a unique creative asset.`,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: `**1. Connect Your Wallet**
Connect using MetaMask, Rainbow, Coinbase Wallet, or any WalletConnect-compatible wallet. We support Ethereum Mainnet, Base, and BNB Chain.

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
12 distinct personality types: Playful, Calm, Curious, Brave, Shy, Friendly, Mischievous, Gentle, Energetic, Wise, Loyal, and Creative. Personality affects how your pet responds to interactions and how AI content is generated.

**Stats & Growth**
- **Level** — Increases through experience earned from interactions and content creation
- **Happiness** — Affected by regular care and positive interactions
- **Energy** — Depleted by activities, restored over time
- **Bond Level** — Deepens through consistent companionship
- **Mood** — Dynamic state reflecting recent interactions

**Memories**
Pets form memories of significant interactions, milestones, and generated content. These memories influence future behavior and create a rich narrative history.`,
  },
  {
    id: "ai-generation",
    title: "AI Content Generation",
    content: `**Image Generation**
Create unique AI-generated images of your pet in various styles. Each image is personalized based on your pet's name, species, personality, and a custom prompt you provide.

- Cost: 1 $PET per image
- Powered by AI engine
- 5 style presets: Cinematic, Anime, Watercolor, 3D Render, Sketch

**Video Generation**
Generate animated videos of your pet with full motion and personality expression.

- Cost: 15 $PET (3s), 30 $PET (5s), 60 $PET (10s+)
- Powered by AI engine
- Async processing — videos are generated in the background and delivered when ready
- Each video starts from an AI-generated reference image for visual consistency

**How It Works**
1. Select your pet and choose image or video
2. Pick a style preset and write an optional custom prompt
3. The system builds a personalized prompt incorporating your pet's identity
4. AI generates the content
5. Content is saved and can be shared in the Community gallery`,
  },
  {
    id: "pet-economy",
    title: "$PET Point Economy",
    content: `**$PET Points**
$PET is the platform's internal point system used for all AI generation and premium features. On-chain token conversion is planned for a future phase.

**Earning $PET**
- Daily Check-in: +10 $PET/day for caring for your pet
- Content Creation: +5 $PET per shared post
- Social Engagement: +2 $PET per like, comment, or share
- Arena Wins: 1.85x payout on successful predictions
- Pet Evolution: +50 $PET per level up
- Referrals: +100 $PET per referred user

**Spending $PET**
- Image generation: 1 $PET
- Video generation: 15–60 $PET (based on duration)
- Marketplace items
- Premium features

**Purchasing $PET**
Three tiers available:
- Explorer: 500 $PET for 5 USDT
- Companion: 2,500 $PET for 20 USDT (best value)
- Breeder: 10,000 $PET for 50 USDT

**Deflationary Model**
$PET credits are burned on content creation, marketplace purchases, and premium features — creating deflationary pressure and long-term value appreciation.`,
  },
  {
    id: "community",
    title: "Community & Social",
    content: `**Social Gallery**
Browse and discover AI-generated content from all users. Like, comment, and share your favorite creations.

**Arena**
Predict which pet content will be most popular. Stake $PET credits on outcomes for a chance at 1.85x returns.

**Analytics**
View platform-wide statistics: total users, content created, $PET burned, and daily transaction counts. Track growth and community engagement in real time.`,
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
- PostgreSQL database (Neon serverless)
- Prisma ORM with Neon serverless adapter
- JWT-based session management after SIWE authentication

**AI Pipeline**
- AI image generation engine
- AI video generation engine
- Personalized prompt engineering per pet identity
- Async video processing with status polling

**On-Chain (BSC)**
- BNB Chain (BSC) for all on-chain activity
- USDT / BNB for payment settlement
- PetaGenTracker contract for activity recording
- Smart contracts verified on BscScan

**Wallet Support**
- MetaMask, Rainbow, Coinbase Wallet
- WalletConnect protocol for 300+ wallets
- Multi-chain signing (Ethereum, Base, BSC)`,
  },
  {
    id: "roadmap",
    title: "Roadmap",
    content: `**Phase 1 — Foundation (Completed)**
- Pet adoption and raising system (12 personalities)
- AI image and video generation
- Social gallery and community features
- $PET point economy with credit tiers
- Wallet authentication (SIWE)
- AI avatar generation for pets

**Phase 2 — On-Chain Activity (In Progress)**
- On-chain activity recording on BNB Chain (BSC)
- USDT / BNB payment integration for $PET purchases
- Smart contract deployment (PetaGenTracker, PETShop)
- BscScan verified contracts

**Phase 3 — Evolution & Marketplace (Next)**
- Pet evolution system with visual stage changes
- Skills and equipment system
- Cosmetic skins and accessories marketplace
- User-to-user item trading
- Achievement and badge system

**Phase 4 — Social Expansion**
- Pet-to-pet interactions and battles
- Social circles and group activities
- Memorial system for retired pets
- Community governance and proposals
- Cross-platform companion integration`,
  },
  {
    id: "partners",
    title: "Strategic Partners",
    content: `MY AI PET is backed by strategic partners who share our vision for the future of AI companionship and Web3 economics:

- **Animoca Brands** — Leading Web3 gaming and digital entertainment company
- **Web3 Labs** — Infrastructure and development support for decentralized applications
- **Arkstream** — Web3-focused venture capital
- **ICC Ventures** — Strategic investment and ecosystem development`,
  },
];

function TableOfContents() {
  return (
    <nav style={{
      position: "sticky", top: 80, alignSelf: "start",
      padding: "20px 0", minWidth: 200,
    }}>
      <div style={{
        fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14,
        fontWeight: 600,
      }}>
        Contents
      </div>
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} style={{
          display: "block", padding: "6px 0",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 500,
          color: "rgba(26,26,46,0.5)", textDecoration: "none",
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
            fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.4)",
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
          fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)",
          maxWidth: 560, margin: "0 auto", lineHeight: 1.8,
        }}>
          Everything you need to know about MY AI PET — the first CompanionFi protocol
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
          fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.35)",
        }}>
          &copy; 2026 My AI PET Protocol &middot; Raise &middot; Bond &middot; Earn
        </div>
      </footer>
    </div>
  );
}
