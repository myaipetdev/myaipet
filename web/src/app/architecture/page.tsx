import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Memory Architecture — MY AI PET",
  description: "Technical overview of how PetClaw stores and recalls pet memory.",
};

export default function ArchitecturePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href="/landing/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Memory Architecture
        </h1>
        <p style={{ fontSize: 15, color: "rgba(26,26,46,0.65)", marginBottom: 36, lineHeight: 1.6 }}>
          PetClaw memory is not a single vector store. It&apos;s a 5-layer system inspired by how
          Anthropic&apos;s Hermes Agent and Claude Code organize context — agent-curated, human-readable,
          and exportable.
        </p>

        <Layer
          n={1}
          title="MEMORY.md — Curated Facts"
          tag="~2.2 KB ceiling · agent-managed"
          desc="A markdown ledger of facts the pet has decided are worth keeping: skills learned,
                relationships, preferences, important events. Capped at 20 entries; the agent
                consolidates and trims based on importance × recency. Always injected into the
                system prompt."
        />
        <Layer
          n={2}
          title="USER.md — Owner Profile"
          tag="~1.4 KB ceiling · agent-managed"
          desc="What the pet has learned about you across sessions: preferences, communication
                style, recurring topics, relevant context. Identity-class entries (e.g. names) are
                deliberately excluded from the prompt to prevent identity bleed across users on
                shared devices."
        />
        <Layer
          n={3}
          title="Session Log — Cross-Platform Trail"
          tag="every message · platform-tagged"
          desc="The complete conversation transcript stored in the petMemory table, tagged by
                platform (web, chrome-ext, telegram, discord). Recent N messages flow into the
                system prompt; older ones are retrievable via the SDK. Same memory across every
                surface."
        />
        <Layer
          n={4}
          title="Pre-turn Prefetch — Lexical Match"
          tag="keyword scoring · top-5 inject"
          desc="Before each turn, the user&apos;s message is scanned against the MEMORY.md entries
                using a lexical-overlap scoring function (word matches × 2, plus importance).
                Top 5 relevant memories are injected as a &apos;Relevant to this conversation&apos;
                block. Cheap, deterministic, no embeddings required."
        />
        <Layer
          n={5}
          title="Post-turn Retention — LLM Extract"
          tag="grok-3-mini-fast · structured JSON"
          desc="After each pet response, a small Grok call extracts (a) durable facts and (b)
                user-profile updates as structured JSON. Importance-rated 1-5. Updates are merged
                into MEMORY.md / USER.md, then the consolidator caps the totals."
        />

        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 40, marginBottom: 14 }}>
          Why Not a Single Vector Store?
        </h2>
        <ul style={{ fontSize: 14, lineHeight: 1.85, color: "rgba(26,26,46,0.75)", paddingLeft: 18 }}>
          <li><strong>Auditability.</strong> The owner can read MEMORY.md and see exactly what the pet remembers. Vector blobs are opaque.</li>
          <li><strong>Portability.</strong> SOUL Export ships the memory as a single JSON file the next runtime can load — no embedding format lock-in.</li>
          <li><strong>Sovereignty.</strong> &quot;Delete with proof&quot; means a SHA-256 of the deleted contents — that requires a deterministic textual representation.</li>
          <li><strong>Cross-platform consistency.</strong> The same MEMORY.md serves Chrome ext, Telegram, web — without re-embedding per surface.</li>
        </ul>
        <p style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", marginTop: 14, lineHeight: 1.65 }}>
          Embedding-based recall is on the roadmap as an <em>optional</em> layer 6 for very long
          histories — but never as the primary memory. The primary memory will always be readable
          markdown the owner can inspect.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 36, marginBottom: 14 }}>
          Sovereignty Operations
        </h2>
        <Op title="Export"
            desc="Sovereignty → Export SOUL Data downloads {memories, userProfile, sessions, stats} as ${petName}_SOUL.json. The same payload is produced by petclaw-sdk export." />
        <Op title="Delete"
            desc="Sovereignty → Delete All Data wipes MEMORY.md, USER.md, and the session log, then returns a deletion proof = SHA-256 over the deleted entries' content hashes." />
        <Op title="Consent toggles"
            desc="Public Profile · Data Sharing · AI Training · Pet Interactions — each gates a different downstream pipeline. Toggling AI Training off prevents your data from feeding any model fine-tune we may run." />
        <Op title="Inheritance"
            desc="A successor wallet can be designated. After N days of inactivity (default 180), the successor can claim the pet's SOUL — the memory and skills carry over." />

        <div style={{
          marginTop: 32, padding: "16px 20px", borderRadius: 14,
          background: "rgba(26,26,46,0.04)", border: "1px solid rgba(26,26,46,0.08)",
          fontSize: 13, color: "rgba(26,26,46,0.6)", lineHeight: 1.65,
        }}>
          Source: <code style={{ fontSize: 12 }}>web/src/lib/petclaw/memory/persistent-memory.ts</code>
          {" · "}<code style={{ fontSize: 12 }}>web/src/app/api/petclaw/sovereignty/*</code>
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
      background: "white", border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, fontWeight: 800,
      }}>{n}</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{
          display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 6,
          background: "rgba(245,158,11,0.1)", color: "#92400e",
          fontFamily: "monospace", marginBottom: 8,
        }}>{tag}</div>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(26,26,46,0.7)" }}>{desc}</div>
      </div>
    </div>
  );
}

function Op({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 10, padding: "12px 16px", borderRadius: 10, background: "white", border: "1px solid rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#b45309", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(26,26,46,0.65)", lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}
