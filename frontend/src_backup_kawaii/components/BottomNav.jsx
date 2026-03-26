const TABS = [
  { key: "home", icon: "🏠", label: "Home" },
  { key: "my pet", icon: "🐾", label: "My Pet" },
  { key: "create", icon: "🎬", label: "Create" },
  { key: "village", icon: "🏘️", label: "Village" },
];

export default function BottomNav({ section, setSection }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden
                 bg-white/95 backdrop-blur-2xl
                 border-t border-pink/10
                 flex items-end justify-around
                 px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom,12px)+4px)]"
    >
      {TABS.map((t) => {
        const active = section === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            className={`
              relative flex flex-col items-center gap-0.5
              py-2.5 px-4 rounded-2xl
              transition-all duration-300 ease-out
              min-w-[56px]
              ${active
                ? "bg-pink/12 -translate-y-0.5"
                : "hover:bg-pink/5 active:scale-95"
              }
            `}
            style={active ? { boxShadow: "0 2px 16px rgba(255,134,183,0.18)" } : {}}
          >
            <span
              className={`
                text-2xl leading-none
                transition-transform duration-300
                ${active ? "scale-110" : ""}
              `}
            >
              {t.icon}
            </span>

            <span
              className={`
                font-body text-xs font-bold tracking-tight
                transition-colors duration-300
                ${active ? "text-pink" : "text-pink/55"}
              `}
            >
              {t.label}
            </span>

            {active && (
              <div className="w-1.5 h-1.5 rounded-full bg-pink mt-0.5 shadow-[0_0_6px_rgba(255,134,183,0.6)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
