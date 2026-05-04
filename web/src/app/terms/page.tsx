import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — MY AI PET",
  description: "Terms of Service for the PetClaw Protocol and MY AI PET.",
};

const LAST_UPDATED = "2026-04-30";

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <div style={{ fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 36 }}>
          Last updated: {LAST_UPDATED}
        </div>

        <Section title="1. Acceptance">
          By accessing or using MY AI PET (the &quot;Service&quot;) operated by the PetClaw Protocol team
          (&quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 18 years old (or the age of majority in your jurisdiction). You are
          responsible for compliance with all local laws, including any laws governing virtual assets
          and AI services.
        </Section>

        <Section title="3. Account & Wallet">
          The Service uses Sign-In with Ethereum (SIWE). Your wallet is your account. We never custody
          your private keys. Loss of your wallet means loss of access — we cannot recover it for you.
        </Section>

        <Section title="4. Pets, Memory, and AI Output">
          AI-generated content (chat replies, images, videos) is produced by third-party large
          language and image models. Output may be inaccurate, biased, or unsuitable. You are
          responsible for how you use it. Do not rely on AI output for medical, legal, financial,
          or other professional advice.
        </Section>

        <Section title="5. Points & Future Token (Important)">
          The platform may issue non-financial loyalty points for engagement. Points are utility
          credits redeemable for in-app features. Points do not represent equity, debt, profit
          share, or any investment in any entity. Any future conversion or distribution related
          to points will be announced separately and may be subject to additional terms,
          jurisdictional eligibility, and KYC/AML compliance. Nothing on this Service constitutes
          an offer or sale of securities.
        </Section>

        <Section title="6. On-chain Recording">
          Certain actions may be recorded on the BNB Smart Chain. On-chain records are immutable;
          we cannot delete or modify them. By using on-chain features you consent to permanent
          public recording of the relevant action data.
        </Section>

        <Section title="7. Acceptable Use">
          You may not: (a) use the Service to generate illegal, harassing, or sexually explicit
          content involving minors; (b) attempt to extract model weights or jailbreak the AI;
          (c) abuse rate limits or credentials; (d) infringe third-party IP; (e) sell or share
          your account.
        </Section>

        <Section title="8. Intellectual Property">
          You retain ownership of original prompts you author. We retain all rights in the Service,
          SDK, brand assets, and platform code (except open-source components under their licenses).
          You grant us a non-exclusive license to display content you create on the platform.
        </Section>

        <Section title="9. Disclaimers">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT
          UNINTERRUPTED OPERATION, ACCURACY, OR FITNESS FOR ANY PARTICULAR PURPOSE. AI OUTPUT
          IS NOT FACT-CHECKED.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by law, we are not liable for indirect, incidental, or
          consequential damages, lost data, or lost profits. Our total liability is capped at the
          fees you paid in the prior 12 months, or USD 100, whichever is lower.
        </Section>

        <Section title="11. Changes">
          We may update these Terms. Material changes will be announced on the Service. Continued
          use after changes is acceptance.
        </Section>

        <Section title="12. Contact">
          support@myaipet.ai
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
