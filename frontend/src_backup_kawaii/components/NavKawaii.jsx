import { ConnectButton } from "@rainbow-me/rainbowkit";
import NotificationBell from "./NotificationBell";

const LOGO_SRC = "data:image/jpeg;base64,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";

const NAV_ITEMS = [
  { key: "home", icon: "🏠", label: "Home" },
  { key: "my pet", icon: "🐾", label: "My Pet" },
  { key: "create", icon: "🎬", label: "Create" },
  { key: "village", icon: "🏘️", label: "Village" },
];

export default function NavKawaii({ section, setSection, credits }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-cream/95 backdrop-blur-2xl"
      style={{
        borderBottom: "1.5px solid rgba(255,134,183,0.12)",
        boxShadow: "0 1px 12px rgba(255,134,183,0.06)",
      }}
      aria-label="Main navigation"
    >
      {/* Top row: Logo + Wallet */}
      <div className="flex items-center justify-between px-8 py-4">
        {/* Logo area */}
        <div
          className="flex items-center gap-3.5 cursor-pointer squishy"
          onClick={() => setSection("home")}
        >
          <div
            className="relative flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden"
            style={{
              border: "2px solid rgba(255,134,183,0.2)",
              boxShadow: "0 2px 8px rgba(255,134,183,0.15)",
            }}
          >
            <img
              src={LOGO_SRC}
              alt="AI PET"
              className="w-10 h-10 rounded-xl object-cover"
            />
          </div>

          <div className="flex flex-col justify-center leading-none">
            <div className="flex items-center gap-2.5">
              <span className="font-heading text-2xl tracking-tight text-pink">
                AI PET
              </span>
              <span
                className="font-body text-xs font-extrabold tracking-widest px-2.5 py-1 rounded-md text-white uppercase"
                style={{
                  background: "linear-gradient(135deg, #ff86b7 0%, #a855f7 50%, #6366f1 100%)",
                  letterSpacing: "0.12em",
                  lineHeight: "1",
                }}
              >
                WEB 4.0
              </span>
            </div>
          </div>
        </div>

        {/* Right side: credits + bell + wallet */}
        <div className="flex items-center gap-4">
          {credits !== null && credits !== undefined && (
            <div
              className="flex items-center gap-1.5 font-body text-sm font-bold text-sun-dark px-4 py-2 rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(255,199,44,0.18) 0%, rgba(255,199,44,0.1) 100%)",
                border: "1px solid rgba(255,199,44,0.2)",
              }}
            >
              <span className="text-base">✨</span>
              <span>{credits}</span>
            </div>
          )}

          <NotificationBell petId={null} />

          <div className="[&_button]:!rounded-full [&_button]:!font-body [&_button]:!text-sm [&_button]:!px-4 [&_button]:!py-2">
            <ConnectButton
              chainStatus="icon"
              showBalance={false}
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
            />
          </div>
        </div>
      </div>

      {/* Tab row (desktop) */}
      <div
        className="hidden sm:flex items-center justify-center gap-1.5 px-8 pb-4"
        role="tablist"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = section === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              role="tab"
              aria-selected={isActive}
              aria-label={item.label}
              className={`squishy flex items-center gap-2.5 font-body text-base font-bold px-6 py-3 rounded-full transition-all duration-200
                ${
                  isActive
                    ? "bg-pink text-white shadow-lg shadow-pink/20"
                    : "text-[#422D26]/60 hover:text-[#422D26]/80 hover:bg-pink/5"
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export { LOGO_SRC };
