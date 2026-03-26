import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function WalletGate({ children, section }) {
  const { isConnected } = useAccount();

  if (isConnected) return children;

  const sectionLabels = {
    "my pet": "My Pet",
    create: "Create",
    community: "Community",
    arena: "Arena",
  };

  return (
    <div style={{
      maxWidth: 440, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center",
    }}>
      <div style={{
        fontSize: 56, marginBottom: 20, opacity: 0.7,
        animation: "petFloat 6s ease-in-out infinite",
      }}>
        🔐
      </div>
      <h2 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700,
        color: "#1a1a2e", marginBottom: 10,
      }}>
        Connect Your Wallet
      </h2>
      <p style={{
        fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)",
        lineHeight: 1.8, marginBottom: 28,
      }}>
        Connect your wallet to access{" "}
        <span style={{ color: "#d97706", fontWeight: 600 }}>
          {sectionLabels[section] || section}
        </span>
        . Your AI pet companion, creations, and social data are tied to your wallet.
      </p>
      <div style={{ display: "inline-block" }}>
        <ConnectButton
          chainStatus="none"
          showBalance={false}
          label="Connect Wallet to Continue"
        />
      </div>
      <p style={{
        fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.35)",
        marginTop: 20,
      }}>
        No gas fees required to browse. Wallet is used for identity only.
      </p>
      <style>{`
        @keyframes petFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
