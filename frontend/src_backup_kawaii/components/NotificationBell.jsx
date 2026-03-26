import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

const NOTIF_ICONS = {
  hunger: "🍖",
  lonely: "💔",
  excited: "⭐",
  creation: "🎬",
  play: "🎮",
  sleep: "😴",
  social: "💬",
  level_up: "👑",
  default: "🔔",
};

// Mock data for demo/fallback
const MOCK_NOTIFICATIONS = [
  { id: 1, notification_type: "hunger", message: "Luna is getting hungry! Time for a snack~", is_read: false, created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 2, notification_type: "excited", message: "Luna found something cool while exploring!", is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, notification_type: "creation", message: "Luna just finished making a new video!", is_read: true, created_at: new Date(Date.now() - 7200000).toISOString() },
];

function getRelativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationBell({ petId }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);
  const bellRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!petId) return;
    try {
      const result = await api.pets.notifications(petId);
      setNotifications(Array.isArray(result) ? result : result.notifications || []);
    } catch {
      setNotifications(MOCK_NOTIFICATIONS);
    }
    setLoading(false);
  }, [petId]);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true }))
    );

    try {
      await api.pets.readNotifications(petId, unreadIds);
    } catch {
      // Revert on failure
      fetchNotifications();
    }
  }, [notifications, petId, fetchNotifications]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={handleToggle}
        className="squishy relative w-10 h-10 rounded-full bg-white/80 sticker-border flex items-center justify-center
                   hover:bg-pink/10 transition-colors"
        aria-label="Notifications"
      >
        <span className={`text-lg ${unreadCount > 0 ? "animate-wiggle" : ""}`}>
          🔔
        </span>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                       bg-pink text-white font-body text-xs font-bold
                       flex items-center justify-center shadow-md animate-bounce-in"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 w-80 max-h-[420px] rounded-3xl sticker-border
                     bg-white/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          style={{
            animation: "notif-slide-down 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <span className="font-heading text-sm text-[#422D26]">Notifications</span>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="squishy font-body text-xs font-bold text-pink hover:text-pink-dark
                           bg-pink/10 hover:bg-pink/20 px-2.5 py-1 rounded-full transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-cream-dark" />

          {/* Notification List */}
          <div className="overflow-y-auto max-h-[340px] py-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-float">🔔</span>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4">
                <span className="text-4xl mb-3">🌸</span>
                <span className="font-body text-xs text-[#422D26]/60 font-semibold text-center">
                  Your pet is happy and quiet~ 🌸
                </span>
              </div>
            )}

            {!loading &&
              notifications.map((notif, idx) => {
                const icon =
                  NOTIF_ICONS[notif.notification_type] || NOTIF_ICONS.default;
                return (
                  <div
                    key={notif.id || idx}
                    className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-cream/60
                      ${!notif.is_read ? "bg-pink/[0.04]" : ""}`}
                    style={{
                      animation: `slide-up 0.3s ease-out ${idx * 0.05}s both`,
                    }}
                  >
                    {/* Icon circle */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base
                        ${!notif.is_read ? "bg-pink/10" : "bg-cream-dark/60"}`}
                    >
                      {icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-body text-xs leading-relaxed ${
                          !notif.is_read
                            ? "text-[#422D26]/80 font-bold"
                            : "text-[#422D26]/50 font-semibold"
                        }`}
                      >
                        {notif.message}
                      </p>
                      <span className="font-body text-xs text-[#422D26]/50 font-bold">
                        {getRelativeTime(notif.created_at)}
                      </span>
                    </div>

                    {/* Unread dot */}
                    {!notif.is_read && (
                      <div className="w-2 h-2 rounded-full bg-pink shrink-0 mt-1.5 animate-pulse" />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Inline keyframes for slide-down */}
      <style>{`
        @keyframes notif-slide-down {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
