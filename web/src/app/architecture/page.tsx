import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Memory Architecture — MY AI PET",
  description: "Technical overview of how PetClaw stores and recalls pet memory.",
};

export default function ArchitecturePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ECE4D4",
      fontFamily: "var(--ed-body, sans-serif)",
      color: "#211A12",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(33,26,18,0.55)", textDecoration: "none",
          fontFamily: "var(--ed-m, ui-monospace, monospace)",
          letterSpacing: "0.12em", fontWeight: 700,
        }}>← MY AI PET</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Memory Architecture
        </h1>
        <p style={{ fontSize: 15, color: "rgba(33,26,18,0.65)", marginBottom: 36, lineHeight: 1.6 }}>
          PetClaw provides owner-controlled identity, retained memory, and consent for a companion.
          Its memory path combines readable capped ledgers, normalized session rows, and conditional
          retrieval; it does not promise that every layer runs on every turn.
        </p>

        <Layer
          n={1}
          title="MEMORY.md — Curated Facts"
          tag="~4 KB ceiling · 40 entries · owner-editable"
          desc="A markdown ledger of facts the pet has decided are worth keeping: skills learned,
                relationships, preferences, important events. Capped at 40 entries; the agent
                consolidates and trims based on importance × recency. A bounded subset can be
                included in the system prompt."
        />
        <Layer
          n={2}
          title="USER.md — Owner Profile"
          tag="~2.4 KB ceiling · 25 entries · agent-managed"
          desc="What the pet has learned about you across sessions: preferences, communication
                style, recurring topics, relevant context. A provider receives at most four entries,
                only when they directly match the request and pass the language/secret filter.
                Identity-class entries (e.g. names) are deliberately excluded from prompts."
        />
        <Layer
          n={3}
          title="Session Log — Lineaged Turn Store"
          tag="canonical chat rows · session + platform metadata"
          desc="Successful canonical chat stores normalized owner and pet rows with session,
                platform, role, and speaker metadata. Web and approved Chrome sites are supported
                today; CLI, SDK, and the 1.6.2 MCP candidate can name their own sessions. Messaging
                channels are launch-paused. Raw recent context is limited to six safe turns from
                the exact requested surface and session; no session means no raw-turn injection."
        />
        <Layer
          n={4}
          title="Pre-turn Prefetch — Lexical Match"
          tag="direct token/bigram overlap · max 6 facts"
          desc="Before each turn, the user&apos;s message is scanned against the MEMORY.md entries
                using direct token and bigram overlap. Up to six provider-safe matches are injected;
                importance and recency break ties but cannot make an unrelated entry relevant.
                Cheap, deterministic, no embeddings required."
        />
        <Layer
          n={5}
          title="Post-turn Retention — LLM Extract"
          tag="task-routed small model · structured JSON"
          desc="After a successful canonical response, a small model call can extract durable facts
                and user-profile updates as structured JSON. Retention is best-effort, importance-rated,
                owner-editable, and discarded if a concurrent owner clear changed the memory epoch."
        />

        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 40, marginBottom: 14 }}>
          Why Not a Single Vector Store?
        </h2>
        <ul style={{ fontSize: 14, lineHeight: 1.85, color: "rgba(33,26,18,0.75)", paddingLeft: 18 }}>
          <li><strong>Auditability.</strong> The owner can read MEMORY.md and see exactly what the pet remembers. Vector blobs are opaque.</li>
          <li><strong>Bounded portability.</strong> SOUL Export packages documented supported fields as checksummed JSON; compatible imports report restored and skipped fields.</li>
          <li><strong>Owner control.</strong> Owners can inspect, edit, and clear recall-bearing data. A deletion receipt identifies the server request; it is not a signature or a hash of deleted content.</li>
          <li><strong>Supported continuity.</strong> One owner-scoped pet identity and selected retained context can be used by supported web, Chrome, CLI, SDK, and candidate MCP clients.</li>
        </ul>
        <p style={{ fontSize: 13, color: "rgba(33,26,18,0.55)", marginTop: 14, lineHeight: 1.65 }}>
          Conditional embedding recall is available when an embedding-capable provider is connected.
          Readable owner-editable ledgers remain the primary inspection surface; vectors are an
          optional retrieval aid, not a replacement for owner controls.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 36, marginBottom: 14 }}>
          Sovereignty Operations
        </h2>
        <Op title="Export"
            desc="Sovereignty → Export SOUL Data downloads documented supported identity, persona, memory, skill, consent, and history fields as checksummed JSON. Media, competitive state, external connections, and other server-authoritative state are not a byte-for-byte transfer." />
        <Op title="Delete"
            desc="Sovereignty → Delete Pet Data is blocked while a paid run is reserved or running. After the run settles, deletion removes pet-scoped records and owned media, scrubs the paid run's private name/goal/answer/steps, and retains only its owner-scoped financial receipt. Backup copies follow the published retention schedule; public on-chain records cannot be erased." />
        <Op title="Consent toggles"
            desc="Public profile and pet-discovery consent are enforced today for supported in-app discovery/social activities. Remote agent invocation stays disabled. Data Sharing and AI Training are future-program preferences." />
        <Op title="Inheritance"
            desc="A successor-wallet preference can be stored off-chain. Automatic transfer after inactivity and on-chain inheritance are planned designs, not active features." />

        <div style={{
          marginTop: 32, padding: "16px 20px", borderRadius: 14,
          background: "rgba(33,26,18,0.04)", border: "1px solid rgba(33,26,18,0.08)",
          fontSize: 13, color: "rgba(33,26,18,0.6)", lineHeight: 1.65,
        }}>
          Public API: <code style={{ fontSize: 13 }}>/api/petclaw/export</code>{" · "}
          <code style={{ fontSize: 13 }}>/api/petclaw/import</code>{" · "}
          <code style={{ fontSize: 13 }}>/api/petclaw/delete</code>{" · "}
          <code style={{ fontSize: 13 }}>/api/petclaw/consent</code>{" · "}
          full reference at <a href="/api-docs" style={{ color: "#9A4E1E" }}>/api-docs</a>.
        </div>
      </div>
    </div>
  );
}

function Layer({ n, title, tag, desc }: { n: number; title: string; tag: string; desc: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "44px 1fr", gap: 18,
      padding: 18, borderRadius: 14, marginBottom: 12,
      background: "#FBF6EC", border: "1px solid rgba(33,26,18,0.13)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: "linear-gradient(135deg, #BE4F28, #9A4E1E)", color: "#FFF8EE",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, fontWeight: 800,
      }}>{n}</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{
          display: "inline-block", fontSize: 13, padding: "2px 8px", borderRadius: 6,
          background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
          fontFamily: "var(--ed-m, ui-monospace, monospace)", marginBottom: 8,
        }}>{tag}</div>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(33,26,18,0.7)" }}>{desc}</div>
      </div>
    </div>
  );
}

function Op({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 10, padding: "12px 16px", borderRadius: 10, background: "#FBF6EC", border: "1px solid rgba(33,26,18,0.13)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#9A4E1E", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(33,26,18,0.65)", lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}
