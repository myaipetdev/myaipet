import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — MY AI PET",
  description: "Privacy Policy for the PetClaw Protocol and MY AI PET.",
};

const LAST_UPDATED = "2026-07-24";

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ECE4D4",
      fontFamily: "var(--ed-body, sans-serif)",
      color: "#211A12",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(33,26,18,0.55)", textDecoration: "none",
        }}>← MY AI PET</Link>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Privacy Policy
        </h1>
        <div style={{ fontSize: 13, color: "rgba(33,26,18,0.65)", marginBottom: 36 }}>
          Last updated: {LAST_UPDATED}
        </div>

        <Section title="1. Data We Collect">
          (a) Wallet address (public). (b) Pet metadata, interaction history, and AI-generated
          memory entries you create. (c) Uploaded pet photos. (d) Paid agent-run records, including
          the pet name, client run ID, selected task kind and server execution contract,
          owner-entered goal, bounded step budget, processing state,
          generated answer, stop reason, execution-step trace (including tool or skill inputs and
          outputs), credit reservation or charge/refund outcome, and timestamps. (e) Server logs
          (IP, user agent, timestamps) for security and abuse prevention. We do not collect
          government IDs, payment card numbers, or biometric data.
        </Section>

        <Section title="2. Location & Wild Catches">
          The Catch feature stores the photo you submit and — only if you grant your browser&apos;s
          location permission — the GPS coordinates where the catch was made. A catch works without
          location. Granting browser location permission is not consent to publish: every catch is
          private by default and visible only to you. A catch appears on the community map only
          after you explicitly opt that specific catch in (&quot;Show this catch on the community
          map&quot;), and other signed-in users then see its coordinates rounded to roughly 110 m —
          never the exact position. You can unpublish a catch from the map at any time, or delete
          the catch entirely from your album; deletion removes the record (including its
          coordinates) and queues the stored photo for removal. Location data is retained only as
          part of the catch record and is deleted with it, under the retention rules in the Data
          Retention section below.
        </Section>

        <Section title="3. How We Use Data">
          To run the Service, generate AI responses, persist your pet&apos;s memory, render the social
          feed, and prevent abuse. We do not sell personal data. We do not use your data to train
          third-party models without explicit consent (see &quot;AI Training&quot; toggle in Sovereignty).
        </Section>

        <Section title="4. AI Processing">
          Pet conversations, relevant memory context, and image/video prompts are sent to
          third-party AI providers under their respective data processing terms. Platform-funded
          chat uses OpenAI first and may send the same prompt and relevant retained context to xAI
          Grok after an eligible transient, rate-limit, or provider-spend failure. Other text tasks
          use their configured task route and may use the documented provider fallback. Uploaded pet images are sent to
          xAI for animal validation and appearance description and may be retried with OpenAI after
          eligible provider failures. Pet avatar, personal image, and Pet video generation use xAI;
          Studio generation uses FAL. Private reference images are sent as verified inline bytes
          rather than public storage links. If you connect your own model for a task, that provider
          processes the task with your
          key; a broken matching connection is not replaced with a platform provider. These
          owner-model scopes cover chat, typed task generation, and judging; an empty selection means
          those three tasks, not internal extraction, summarization, or persona processing. Tasks
          without a matching owner-model scope use the platform-managed route described above. These
          providers may process your input transiently to produce a response. We do not authorize
          them to retain your data for model training.
        </Section>

        <Section title="5. Paid Agent Office Runs">
          Agent Office is a real, credit-bearing typed task runner rather than a simulated office
          display. When you authorize a run, we keep its run ID, state and timestamps, billing
          result, your selected task kind and server-bound execution contract, your goal,
          the generated answer, and a bounded execution trace with tool or skill
          inputs and outputs. We use this record to run and display your requested work, prevent
          duplicate charges, replay a known result, recover an ambiguous network outcome, settle or
          refund credits, and handle accounting, fraud, or disputes. Run status and history are
          available only through owner-authenticated, owner-scoped product surfaces; they are not
          published to community or social feeds. Paid-run history is not embedded in a pet&apos;s
          SOUL bundle. Sovereignty provides a separate owner-authenticated export of up to 100
          newest-first records per page, with an opaque next-page cursor and SHA-256 checksum.
          Those pages include the caller-generated run ID as a reconciliation ID, goals, answers,
          bounded and sanitized traces, execution contracts, timestamps, and billing outcomes
          without database primary keys, user IDs, pet IDs, or credit-reservation IDs. Each record
          states whether private fields or credential-like values were redacted and whether a size
          bound truncated content. They are access copies only: importing a SOUL bundle never
          creates a run or reservation, restores credits, or replays a charge.
          <br /><br />
          Your goal, and retained pet context that your settings and the selected read-only skill
          permit the run to recall, may be sent to the configured task or chat model and an
          eligible provider fallback as described above. The current Agent Office can use
          one server-selected read-only tool: owner-private memory recall or a memory-isolated
          summarization, review, or draft tool. It has no external action connector, and execution
          cannot commit external actions or write new retained pet memory or self-learning. A
          completed run therefore means that the selected text deliverable
          finished; it does not mean that an external action was taken.
        </Section>

        <Section title="6. On-Chain Data">
          Existing on-chain records on BSC are public and permanent. We cannot delete them. Avoid
          putting sensitive personal information into on-chain fields. New anchoring is disabled;
          a future Base deployment is planned but has no announced activation date.
        </Section>

        <Section title="7. Authentication, Cookies & Local Storage">
          Signing in with your wallet (SIWE) issues a short-lived session token (a JWT valid for
          8 hours) that the web app stores in browser local storage and sends as an Authorization
          header. Logging out invalidates every previously issued session token server-side and
          clears the browser&apos;s web-session token and user-identity entries. A parallel
          HttpOnly, SameSite cookie carries the same short-lived session and is used only for
          protected media requests. External clients (CLI, SDK, browser extension) never use the
          web session: CLI and SDK clients authenticate with revocable personal access tokens
          prefixed <code>pck_</code>; the Chrome extension uses the narrower, shorter-lived{" "}
          <code>pex_</code> token class. You mint and can revoke both in the app.
          <br /><br />
          Before a paid Agent Office request is sent, the browser writes a fail-closed recovery
          journal in local storage. Its entry contains an owner binding (account ID and wallet),
          pet ID and name, run ID, goal, selected task kind, step limit, confirmed credit cost, product surface, and
          creation time. It remains until a terminal settlement or recovery receipt is validated,
          or the request is definitively rejected before a debit; an unresolved entry has no
          automatic time-based expiry and may remain across logout so the same owner can reconcile
          it after signing in again. The journal itself does not store the session token or any AI
          provider key. We also use local browser storage for UX preferences. We do not use
          cross-site advertising trackers.
        </Section>

        <Section title="8. Your Rights (GDPR / PIPA / CCPA)">
          You can: (a) export your pet&apos;s portable SOUL bundle and linked portable activity
          data via Sovereignty → Export SOUL Data, and separately retrieve owner-private paid-run
          history through bounded Sovereignty run-history pages until the page receipt says
          complete; (b) remove pet-scoped
          records and owned media from active systems via Sovereignty → Delete Pet Data, which
          produces a SHA-256 deletion receipt;
          and (c) change consent settings at any time. Deletion is blocked while that pet has a
          reserved or running paid agent task, so the owner can reconcile the task first. Once it
          reaches a terminal state, deletion removes its pet name, goal, answer, and step trace but
          keeps the minimal owner-scoped financial receipt described below. Public on-chain records cannot be erased.
          For account-level requests or records that cannot yet be linked to one pet, contact
          support@myaipet.ai.
        </Section>

        <Section title="9. Data Retention">
          Active pets and memory are stored as long as your account is active. Security and
          application logs are retained for up to 90 days. Encrypted, access-restricted off-host
          backup sets are retained for up to 90 days and are restore-tested at creation.
          Paid Agent Office run history remains in active systems while the associated pet and
          account remain active; the current release does not apply a shorter automatic expiry to
          terminal run records.
          A completed in-product pet deletion removes linked records and owned media from active
          systems immediately, except for a minimal owner-scoped paid-run receipt used for credit
          reconciliation, accounting, fraud or dispute handling, and legal obligations. That
          retained receipt contains the run ID, execution contract, terminal and billing outcome, credit result, and
          timestamps; the pet name, goal, answer, and steps are scrubbed. Backup copies are isolated from active product serving. Retention
          policies make backup and versioned-storage residual copies eligible for deletion no later
          than 90 days; cloud lifecycle removal may complete asynchronously after eligibility.
        </Section>

        <Section title="10. International Transfers">
          The Service is hosted on AWS infrastructure. Your data may be processed outside your
          country of residence. By using the Service you consent to such transfer.
        </Section>

        <Section title="11. Children">
          The Service is not directed to children under 18. We do not knowingly collect data from
          minors.
        </Section>

        <Section title="12. Security">
          We use TLS (HTTPS), owner-scoped authorization, restricted filesystem permissions,
          encrypted off-host backups, and one-time wallet login challenges. No system is perfectly
          secure — please use a hardware wallet for high-value assets.
        </Section>

        <Section title="13. Changes">
          We will announce material changes via the Service. Continued use after changes is acceptance.
        </Section>

        <Section title="14. Contact">
          support@myaipet.ai
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#211A12" }}>{title}</h2>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: "rgba(33,26,18,0.75)" }}>{children}</p>
    </section>
  );
}
