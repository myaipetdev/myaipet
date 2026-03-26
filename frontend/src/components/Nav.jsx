import { ConnectButton } from "@rainbow-me/rainbowkit";

const LOGO_SRC = "/mascot.jpg";

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "my pet", label: "My Pet" },
  { key: "create", label: "Create" },
  { key: "community", label: "Community" },
];

export default function Nav({ section, setSection, credits }) {
  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 36px", background: "rgba(250,247,242,0.92)",
        backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => setSection("home")}>
        <img
          src={LOGO_SRC} alt="MY AI PET"
          style={{
            width: 38, height: 38, borderRadius: 12, objectFit: "cover",
            border: "2px solid rgba(251,191,36,0.25)",
            boxShadow: "0 0 16px rgba(251,191,36,0.12)",
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17,
            color: "#1a1a2e", letterSpacing: "-0.02em",
          }}>
            MY AI PET
          </span>
          <span style={{
            fontSize: 9, padding: "3px 10px", borderRadius: 20,
            background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(139,92,246,0.08))",
            color: "#d97706",
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: "0.06em",
            border: "1px solid rgba(251,191,36,0.2)",
          }}>
            CompanionFi
          </span>
        </div>
      </div>

      {/* Nav items */}
      <div style={{
        display: "flex", gap: 2, alignItems: "center",
        padding: 3, borderRadius: 12,
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.06)",
      }}>
        {NAV_ITEMS.map((item) => {
          const isActive = section === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                background: isActive ? "rgba(251,191,36,0.12)" : "transparent",
                border: "none", cursor: "pointer",
                borderRadius: 9, padding: "7px 16px",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500,
                color: isActive ? "#b45309" : "rgba(26,26,46,0.4)",
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
            fontFamily: "mono", fontSize: 11, color: "#b45309", fontWeight: 600,
            padding: "5px 12px", borderRadius: 8, marginLeft: 4,
            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
          }}>
            🪙 {credits}
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
