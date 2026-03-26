import { ConnectButton } from "@rainbow-me/rainbowkit";

const LOGO_SRC = "data:image/jpeg;base64,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";

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "my pet", label: "My Pet" },
  { key: "arena", label: "Arena" },
  { key: "create", label: "Create" },
  { key: "community", label: "Community" },
  { key: "analytics", label: "Analytics" },
];

export default function Nav({ section, setSection, credits }) {
  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 36px", background: "rgba(8,8,12,0.88)",
        backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => setSection("home")}>
        <img
          src={LOGO_SRC} alt="AI PET"
          style={{
            width: 34, height: 34, borderRadius: 10, objectFit: "cover",
            border: "2px solid rgba(251,191,36,0.25)",
            boxShadow: "0 0 16px rgba(251,191,36,0.12)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17,
            color: "white", letterSpacing: "-0.02em",
          }}>
            AI PET
          </span>
          <span style={{
            fontSize: 8, padding: "2px 7px", borderRadius: 20,
            background: "rgba(251,191,36,0.1)", color: "#fbbf24",
            fontFamily: "mono", fontWeight: 600, letterSpacing: "0.05em",
            border: "1px solid rgba(251,191,36,0.15)",
          }}>
            BETA
          </span>
        </div>
      </div>

      {/* Nav items */}
      <div style={{
        display: "flex", gap: 2, alignItems: "center",
        padding: 3, borderRadius: 12,
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.03)",
      }}>
        {NAV_ITEMS.map((item) => {
          const isActive = section === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                background: isActive ? "rgba(251,191,36,0.08)" : "transparent",
                border: "none", cursor: "pointer",
                borderRadius: 9, padding: "7px 16px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 500,
                color: isActive ? "#fde68a" : "rgba(255,255,255,0.3)",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              {item.label}
              {isActive && (
                <div style={{
                  position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)",
                  width: 12, height: 2, borderRadius: 1,
                  background: "#fbbf24", opacity: 0.6,
                }} />
              )}
            </button>
          );
        })}

        {credits !== null && credits !== undefined && (
          <span style={{
            fontFamily: "mono", fontSize: 10, color: "#fbbf24", fontWeight: 600,
            padding: "5px 12px", borderRadius: 8, marginLeft: 4,
            background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)",
          }}>
            {credits} credits
          </span>
        )}
      </div>

      <ConnectButton
        chainStatus="icon"
        showBalance={false}
        accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
      />
    </nav>
  );
}

export { LOGO_SRC };
