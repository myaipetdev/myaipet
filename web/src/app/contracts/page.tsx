import type { Metadata } from "next";
import styles from "./contracts.module.css";

export const metadata: Metadata = {
  title: "Contracts — MY AI PET",
  description: "On-chain contract addresses, audit status, and verification links.",
};

type Contract = {
  name: string;
  kind: string;
  address: string | null;
  state: "deployed" | "planned";
  status: string;
  summary: string;
  reviewNote?: string;
  checks?: string[];
};

const LAUNCH_DISCLOSURE = "The production app has all blockchain integration disabled.";

const CONTRACTS: Contract[] = [
  { name: "PETContent (NFT)", kind: "NFT provenance", address: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c", state: "deployed", status: "DEPLOYED (INTEGRATION OFF)", summary: "Build-era provenance contract. The live app does not mint or write to it.", reviewNote: "Production integration is disabled. On-chain paused() was false and totalSupply() = 0 at the 2026-07-18 launch review.", checks: ["paused() = false", "totalSupply() = 0"] },
  { name: "PetaGenTracker", kind: "Generation provenance", address: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a", state: "deployed", status: "DEPLOYED (INTEGRATION OFF)", summary: "Build-era generation tracker. Production recording is disabled.", reviewNote: "Production integration is disabled. On-chain paused() was false, totalUsers() = 0, and totalGenerations() = 0 at the 2026-07-18 launch review.", checks: ["paused() = false", "totalUsers() = 0", "totalGenerations() = 0"] },
  {
    name: "PETActivity",
    kind: "Activity recorder",
    address: null,
    state: "planned",
    status: "Roadmap",
    summary: "A gasless, per-user activity recorder. No address or activation date is announced.",
  },
  {
    name: "PETSoul",
    kind: "Identity registry",
    address: null,
    state: "planned",
    status: "Roadmap",
    summary: "A future pet identity and successor-inheritance registry. Not deployed.",
  },
];

export default function ContractsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.shell}>
        <a href="https://myaipet.ai" className={styles.backLink}>
          <span aria-hidden="true">←</span> Back to MY AI PET
        </a>

        <header className={styles.hero}>
          <div className={styles.kicker}><span /> Public verification</div>
          <h1>Smart contracts,<br /><em>clearly explained.</em></h1>
          <p>
            MY AI PET currently runs off-chain. {LAUNCH_DISCLOSURE} Two legacy provenance
            contracts exist on BNB Smart Chain, but neither is connected to the live product flow.
          </p>
          <div className={styles.summaryGrid} aria-label="Current contract status">
            <div><span>Network</span><strong>BNB legacy</strong></div>
            <div><span>Live integration</span><strong className={styles.off}>Off</strong></div>
            <div><span>External audit</span><strong>Planned</strong></div>
          </div>
        </header>

        <section className={styles.holdNotice} aria-labelledby="holding-title">
          <div className={styles.noticeIcon} aria-hidden="true">II</div>
          <div>
            <div className={styles.noticeLabel}>Launch hold · verified July 18, 2026</div>
            <h2 id="holding-title">No production route submits on-chain writes.</h2>
            <p>
              Activation requires a reviewed Base deployment, verified contracts, relayer
              controls, and a completed external security audit. Status will be published
              here before any user-facing activation.
            </p>
          </div>
        </section>

        <section className={styles.registry} aria-labelledby="registry-title">
          <div className={styles.sectionHead}>
            <div>
              <span>Registry · 04</span>
              <h2 id="registry-title">What exists today</h2>
            </div>
            <p>Build-era addresses and roadmap items, separated so deployed never reads as live.</p>
          </div>

          <div className={styles.contractGrid}>
            {CONTRACTS.map((contract, index) => (
              <article className={styles.contractCard} data-state={contract.state} key={contract.name}>
                <div className={styles.cardTopline}>
                  <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.statusBadge}>{contract.status}</span>
                </div>
                <div className={styles.cardTitle}>
                  <span>{contract.kind}</span>
                  <h3>{contract.name}</h3>
                </div>

                <div className={styles.addressBlock}>
                  <span>Contract address</span>
                  <code>{contract.address ?? "Not deployed"}</code>
                </div>

                <p className={styles.cardSummary}>{contract.summary}</p>

                {contract.checks && (
                  <div className={styles.checks} aria-label={contract.reviewNote ?? "Last reviewed chain values"}>
                    {contract.checks.map((check) => <code key={check}>{check}</code>)}
                  </div>
                )}

                {contract.address ? (
                  <a
                    href={`https://bscscan.com/address/${contract.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.explorerLink}
                  >
                    Verify on BscScan <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <div className={styles.roadmapLine}><span /> No address assigned</div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.detailsGrid} aria-label="Audit and ownership details">
          <article>
            <span className={styles.detailIndex}>01 · Review</span>
            <h2>Audit status</h2>
            <p>
              An internal Solidity source review covered four contracts and recorded its fixes.
              Deployment-specific bytecode and owner-permission verification remains in progress.
              No external audit is complete.
            </p>
          </article>
          <article>
            <span className={styles.detailIndex}>02 · Control</span>
            <h2>Owner permissions</h2>
            <p>
              The deployed contracts are non-upgradeable. The owner can pause supported contracts
              and manage relayer or minter permissions. Changing those permissions requires an
              owner-wallet transaction outside this deployment.
            </p>
          </article>
        </section>

        <details className={styles.technicalDetails}>
          <summary>Technical disclosure <span>View details</span></summary>
          <ul>
            <li>Deployer wallet: <code>0x872d5f7F03894EE5c8b84D22868009B58b927357</code></li>
            <li>Production gate: <code>BLOCKCHAIN_ENABLED=false</code>.</li>
            <li>Both deployed contracts returned <code>paused() = false</code> at the July 18, 2026 review.</li>
            <li>The current owner relayer/minter authorization remains active until changed by an owner-wallet transaction.</li>
            <li>Legacy PETToken and PETShop source code is outside the live product flow.</li>
          </ul>
        </details>

        <footer className={styles.footer}>
          <span>PetClaw Protocol v1</span>
          <a href="/architecture">Architecture</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </footer>
      </div>
    </main>
  );
}
