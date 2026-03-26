import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function WalletGate({ children, section }) {
  const { isConnected } = useAccount();

  if (isConnected) return children;

  const sectionLabels = {
    "my pet": "My Pet",
    create: "Create",
    village: "Village",
  };

  return (
    <div className="max-w-md mx-auto px-6 pt-36 text-center">
      <div className="text-6xl mb-6 animate-float">🔒</div>
      <h2 className="font-heading text-2xl text-[#422D26] mb-3">
        Connect Your Wallet
      </h2>
      <p className="font-body text-base text-[#422D26]/55 mb-8 leading-relaxed">
        Connect your wallet to access{" "}
        <span className="font-semibold text-pink">
          {sectionLabels[section] || section}
        </span>
        . Your pets, creations, and village data are tied to your wallet address.
      </p>
      <div className="flex justify-center [&_button]:!rounded-full [&_button]:!font-heading [&_button]:!text-base [&_button]:!px-8 [&_button]:!py-3">
        <ConnectButton
          chainStatus="none"
          showBalance={false}
          label="Connect Wallet to Continue"
        />
      </div>
      <p className="font-body text-sm text-[#422D26]/45 mt-6">
        No gas fees required to browse. Wallet is used for identity only.
      </p>
    </div>
  );
}
