import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MY AI PET",
  description: "Privacy Policy for the PetClaw Protocol and MY AI PET.",
};

const LAST_UPDATED = "2026-04-30";

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <a href="/landing/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Privacy Policy
        </h1>
        <div style={{ fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 36 }}>
          Last updated: {LAST_UPDATED}
        </div>

        <Section title="1. Data We Collect">
          (a) Wallet address (public). (b) Pet metadata, interaction history, and AI-generated
          memory entries you create. (c) Uploaded pet photos. (d) Server logs (IP, user agent,
          timestamps) for security and abuse prevention. We do not collect government IDs, payment
          card numbers, or biometric data.
        </Section>

        <Section title="2. How We Use Data">
          To run the Service, generate AI responses, persist your pet&apos;s memory, render the social
          feed, and prevent abuse. We do not sell personal data. We do not use your data to train
          third-party models without explicit consent (see &quot;AI Training&quot; toggle in Sovereignty).
        </Section>

        <Section title="3. AI Processing">
          Pet conversations and image/video prompts are sent to third-party AI providers (currently
          xAI Grok and FAL) under their respective data processing terms. These providers may
          process your input transiently to produce a response. We do not authorize them to retain
          your data for model training.
        </Section>

        <Section title="4. On-Chain Data">
          On-chain records (BSC) are public and permanent. We cannot delete them. Avoid putting
          sensitive personal information into on-chain fields.
        </Section>

        <Section title="5. Cookies & Local Storage">
          We use session storage for SIWE authentication and UX preferences. We do not use
          cross-site advertising trackers.
        </Section>

        <Section title="6. Your Rights (GDPR / PIPA / CCPA)">
          You can: (a) export all your pet data via Sovereignty → Export SOUL Data; (b) delete all
          off-chain data via Sovereignty → Delete All Data, which produces a SHA-256 deletion
          proof; (c) toggle data-sharing consent toggles at any time. For requests we cannot fulfill
          via the UI, contact dev@boredbrain.app.
        </Section>

        <Section title="7. Data Retention">
          Active pets and memory: stored as long as your account is active. Server logs: 90 days.
          Deleted data: removed from primary databases within 30 days; backups rotated every 90 days.
        </Section>

        <Section title="8. International Transfers">
          The Service is hosted on AWS infrastructure. Your data may be processed outside your
          country of residence. By using the Service you consent to such transfer.
        </Section>

        <Section title="9. Children">
          The Service is not directed to children under 18. We do not knowingly collect data from
          minors.
        </Section>

        <Section title="10. Security">
          We use TLS (HTTPS) for all transport, encrypted-at-rest databases, and least-privilege
          IAM. No system is perfectly secure — please use a hardware wallet for high-value assets.
        </Section>

        <Section title="11. Changes">
          We will announce material changes via the Service. Continued use after changes is acceptance.
        </Section>

        <Section title="12. Contact">
          dev@boredbrain.app
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>{title}</h2>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: "rgba(26,26,46,0.75)" }}>{children}</p>
    </section>
  );
}
