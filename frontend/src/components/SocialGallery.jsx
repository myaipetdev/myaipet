import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { MOCK_SOCIAL_FEED } from "../mockData";

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_NAMES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function getCardHeight(index, aspectRatio) {
  const ratioMap = {
    "1:1": 1, "4:3": 0.75, "3:4": 1.33,
    "16:9": 0.5625, "9:16": 1.78, "4:5": 1.25, "3:2": 0.667,
  };
  const ratio = ratioMap[aspectRatio] || 1;
  return Math.max(240, Math.min(440, 300 * ratio));
}

// ── Detail Modal ──
function DetailModal({ item, onClose, onLike, index }) {
  if (!item) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(24px)",
    }} onClick={onClose}>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{
        display: "flex", maxWidth: 1000, width: "92vw", maxHeight: "88vh",
        background: "white", borderRadius: 16, overflow: "hidden",
        boxShadow: "0 40px 120px rgba(0,0,0,0.3)",
        animation: "modalIn 0.25s ease-out",
      }}>
        {/* Media */}
        <div style={{
          flex: "1 1 58%", position: "relative", overflow: "hidden",
          background: "#f5f3ee", display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 400,
        }}>
          {item.video_url ? (
            <video src={item.video_url} autoPlay loop muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : item.photo_url ? (
            <img src={item.photo_url} alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 80, opacity: 0.3 }}>{PET_EMOJIS[item.pet_type] || "🐾"}</span>
          )}
          {item.gen_type === "video" && (
            <div style={{
              position: "absolute", top: 14, left: 14,
              padding: "5px 12px", borderRadius: 20, background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
              <span style={{ fontFamily: "mono", fontSize: 10, color: "white" }}>Video · {item.duration}s</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: "1 1 42%", padding: "24px 26px", display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
              }}>
                {PET_EMOJIS[item.pet_type] || "🐾"}
              </div>
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "#1a1a2e", fontWeight: 600 }}>
                  {item.display_name || "Anonymous"}
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)" }}>
                  {item.created_at ? timeAgo(item.created_at) : ""}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(0,0,0,0.04)", border: "none", color: "rgba(26,26,46,0.4)",
              cursor: "pointer", width: 30, height: 30, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>✕</button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, fontWeight: 600,
            }}>Prompt</div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, color: "rgba(26,26,46,0.65)",
              lineHeight: 1.7, padding: "14px 16px", borderRadius: 10,
              background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
            }}>
              {item.prompt}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {[
              { label: item.style_name || "Cinematic", color: "#b45309" },
              { label: PET_NAMES[item.pet_type] || "Pet", color: "#7c3aed" },
              { label: item.gen_type === "video" ? `Video ${item.duration}s` : "Image", color: "#16a34a" },
            ].map(t => (
              <span key={t.label} style={{
                padding: "4px 10px", borderRadius: 6,
                background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
                fontFamily: "mono", fontSize: 10, color: t.color, fontWeight: 500,
              }}>
                {t.label}
              </span>
            ))}
          </div>

          <div style={{
            display: "flex", gap: 20, padding: "14px 0", marginBottom: 18,
            borderTop: "1px solid rgba(0,0,0,0.06)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: "#1a1a2e", fontWeight: 700 }}>
                {item.likes_count || 0}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)", textTransform: "uppercase" }}>Likes</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: "#1a1a2e", fontWeight: 700 }}>
                {item.comments_count || 0}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)", textTransform: "uppercase" }}>Comments</div>
            </div>
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => onLike(item.generation_id || item.id, index)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "11px", borderRadius: 10, cursor: "pointer",
              background: item.is_liked
                ? "linear-gradient(135deg, rgba(244,114,182,0.1), rgba(244,114,182,0.05))"
                : "rgba(0,0,0,0.03)",
              border: item.is_liked ? "1px solid rgba(244,114,182,0.2)" : "1px solid rgba(0,0,0,0.06)",
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 15, color: item.is_liked ? "#f472b6" : "rgba(26,26,46,0.35)" }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                color: item.is_liked ? "#f472b6" : "rgba(26,26,46,0.5)",
              }}>
                {item.is_liked ? "Liked" : "Like"}
              </span>
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(item.prompt); }} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "11px", borderRadius: 10, cursor: "pointer",
              background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.5)", fontWeight: 600,
            }}>
              📋 Copy Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Gallery Card (Midjourney/Leonardo style) ──
function GalleryCard({ item, index, onLike, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const videoRef = useRef(null);
  const cardHeight = getCardHeight(index, item.aspect_ratio);
  const timeoutRef = useRef(null);

  // Video: play on hover with small delay, pause on leave
  useEffect(() => {
    if (!videoRef.current) return;
    if (hovered) {
      timeoutRef.current = setTimeout(() => {
        videoRef.current?.play().catch(() => {});
      }, 200);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [hovered]);

  const hasMedia = item.video_url || item.photo_url;
  const isVideo = item.gen_type === "video" || item.video_url;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(item, index)}
      style={{
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        height: cardHeight, position: "relative",
        marginBottom: 4,
        transition: "transform 0.3s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.3s ease",
        transform: hovered ? "scale(1.01)" : "scale(1)",
        boxShadow: hovered
          ? "0 8px 28px rgba(0,0,0,0.12)"
          : "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {/* Media layer */}
      {hasMedia ? (
        item.video_url ? (
          <>
            {/* Video poster (first frame or photo) */}
            {item.photo_url && (
              <img src={item.photo_url} alt=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "cover", zIndex: 1,
                  opacity: hovered ? 0 : 1,
                  transition: "opacity 0.4s ease",
                }} />
            )}
            <video ref={videoRef} src={item.video_url}
              poster={item.photo_url || undefined}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                position: "relative", zIndex: 0,
              }}
              muted loop playsInline preload="none" />
          </>
        ) : (
          <>
            {!imgLoaded && (
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(135deg, #f5f3ee, #ebe8e1)",
                animation: "shimmer 1.5s ease-in-out infinite",
                backgroundImage: "linear-gradient(90deg, #f5f3ee 0%, #faf7f2 50%, #f5f3ee 100%)",
                backgroundSize: "200% 100%",
              }} />
            )}
            <img
              src={item.photo_url} alt=""
              onLoad={() => setImgLoaded(true)}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                transition: "transform 0.5s cubic-bezier(0.2, 0, 0, 1)",
                transform: hovered ? "scale(1.04)" : "scale(1)",
                opacity: imgLoaded ? 1 : 0,
              }}
              loading="lazy"
            />
          </>
        )
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(135deg, #faf7f2, #f0ede8)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 48, opacity: 0.3 }}>{PET_EMOJIS[item.pet_type] || "🐾"}</span>
        </div>
      )}

      {/* Top-left badges (always visible) */}
      {isVideo && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 10,
          padding: "3px 8px", borderRadius: 6,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: hovered ? "#4ade80" : "#fbbf24",
            boxShadow: hovered ? "0 0 4px #4ade80" : "none",
            transition: "all 0.3s",
          }} />
          <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
            {item.duration || 5}s
          </span>
        </div>
      )}

      {/* Hover overlay — minimal, Midjourney-style */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 10,
        background: hovered
          ? "linear-gradient(0deg, rgba(0,0,0,0.65) 0%, transparent 40%)"
          : "linear-gradient(0deg, rgba(0,0,0,0.25) 0%, transparent 20%)",
        transition: "all 0.3s ease",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: hovered ? 12 : 8,
        pointerEvents: hovered ? "auto" : "none",
      }}>
        {/* Hover: show prompt */}
        {hovered && (
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5,
            color: "rgba(255,255,255,0.92)", lineHeight: 1.5,
            marginBottom: 8, maxHeight: 40, overflow: "hidden",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            animation: "fadeUp 0.2s ease-out",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          }}>
            {item.prompt}
          </div>
        )}

        {/* Bottom bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          opacity: hovered ? 1 : 0.7,
          transition: "opacity 0.3s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {hovered && (
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, animation: "fadeUp 0.15s ease-out",
                border: "1.5px solid rgba(255,255,255,0.3)",
              }}>
                {PET_EMOJIS[item.pet_type]}
              </div>
            )}
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {item.display_name || "Anon"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={e => { e.stopPropagation(); onLike(item.generation_id || item.id, index); }}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <span style={{
                color: item.is_liked ? "#f472b6" : "rgba(255,255,255,0.65)",
                fontSize: 13, transition: "all 0.15s",
                transform: item.is_liked ? "scale(1.2)" : "scale(1)",
                display: "inline-block",
                filter: item.is_liked ? "drop-shadow(0 0 4px rgba(244,114,182,0.5))" : "none",
              }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: "mono", fontSize: 10, fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}>
                {item.likes_count > 999 ? `${(item.likes_count/1000).toFixed(1)}k` : item.likes_count || 0}
              </span>
            </button>

            {hovered && (
              <span style={{
                fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.45)",
                animation: "fadeUp 0.15s ease-out",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}>
                💬 {item.comments_count || 0}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Masonry Layout ──
function MasonryGrid({ items, onLike, onCardClick, columnCount }) {
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({ items: [], height: 0 }));
    items.forEach((item, i) => {
      const shortest = cols.reduce((min, col, idx) => col.height < cols[min].height ? idx : min, 0);
      const h = getCardHeight(i, item.aspect_ratio);
      cols[shortest].items.push({ item, index: i });
      cols[shortest].height += h + 4;
    });
    return cols;
  }, [items, columnCount]);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ flex: 1 }}>
          {col.items.map(({ item, index }) => (
            <GalleryCard
              key={item.generation_id || item.id || index}
              item={item}
              index={index}
              onLike={onLike}
              onClick={onCardClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main ──
export default function SocialGallery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("trending");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [columnCount, setColumnCount] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 580) setColumnCount(2);
      else if (w < 860) setColumnCount(3);
      else if (w < 1200) setColumnCount(4);
      else setColumnCount(5);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => { loadFeed(); }, [sort]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await api.social.feed({ sort, page: 1, page_size: 40 });
      setItems(data.items || []);
    } catch {
      try {
        const data = await api.gallery.list({ sort: sort === "most_liked" ? "recent" : sort, page: 1, page_size: 40 });
        setItems((data.items || []).map(i => ({ ...i, generation_id: i.id, likes_count: 0, comments_count: 0, is_liked: false })));
      } catch {
        setItems(MOCK_SOCIAL_FEED.items);
      }
    }
    setLoading(false);
  };

  const handleLike = useCallback(async (generationId, index) => {
    const toggle = (prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const liked = !item.is_liked;
      return { ...item, is_liked: liked, likes_count: liked ? (item.likes_count||0)+1 : Math.max(0,(item.likes_count||0)-1) };
    });
    try {
      const result = await api.social.like(generationId);
      setItems(prev => prev.map((item, i) => {
        if (i !== index) return item;
        const liked = result.action === "liked";
        return { ...item, is_liked: liked, likes_count: liked ? (item.likes_count||0)+1 : Math.max(0,(item.likes_count||0)-1) };
      }));
    } catch {
      setItems(toggle);
    }
    setSelectedItem(prev => {
      if (!prev || (prev.generation_id || prev.id) !== generationId) return prev;
      const liked = !prev.is_liked;
      return { ...prev, is_liked: liked, likes_count: liked ? (prev.likes_count||0)+1 : Math.max(0,(prev.likes_count||0)-1) };
    });
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i => i.prompt?.toLowerCase().includes(q) || i.display_name?.toLowerCase().includes(q));
    }
    if (typeFilter !== "all") {
      result = result.filter(i => i.gen_type === typeFilter);
    }
    return result;
  }, [items, search, typeFilter]);

  const TABS = [
    { key: "trending", label: "Trending" },
    { key: "recent", label: "Latest" },
    { key: "most_liked", label: "Top" },
  ];

  return (
    <div style={{ padding: "0 16px 60px", maxWidth: 1440, margin: "0 auto", paddingTop: 88 }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        .gallery-search { transition: all 0.2s }
        .gallery-search::placeholder { color: rgba(26,26,46,0.25) }
        .gallery-search:focus { border-color: rgba(0,0,0,0.12) !important; background: rgba(0,0,0,0.02) !important }
        .sort-tab:hover { color: rgba(26,26,46,0.7) !important }
      `}</style>

      {/* Header — minimal like Midjourney */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12, flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
              color: "#1a1a2e", margin: 0, letterSpacing: "-0.03em",
            }}>
              Explore
            </h2>
            <span style={{
              fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.3)", fontWeight: 500,
            }}>
              {filteredItems.length} works
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Type filters — inline with search */}
            <div style={{ display: "flex", gap: 2 }}>
              {[
                { key: "all", label: "All" },
                { key: "image", label: "Images" },
                { key: "video", label: "Videos" },
              ].map(f => (
                <button key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                  background: typeFilter === f.key ? "rgba(0,0,0,0.06)" : "transparent",
                  border: "none", borderRadius: 6, padding: "5px 10px",
                  fontFamily: "mono", fontSize: 10, cursor: "pointer",
                  color: typeFilter === f.key ? "rgba(26,26,46,0.7)" : "rgba(26,26,46,0.3)",
                  transition: "all 0.2s", fontWeight: typeFilter === f.key ? 600 : 400,
                }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 12, color: "rgba(26,26,46,0.2)", pointerEvents: "none",
              }}>⌕</span>
              <input
                className="gallery-search"
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  width: 180, padding: "7px 12px 7px 28px", borderRadius: 8,
                  background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
                  color: "#1a1a2e", fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>

        {/* Sort tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => (
            <button className="sort-tab" key={t.key} onClick={() => setSort(t.key)} style={{
              background: "transparent", border: "none", padding: "6px 14px",
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, cursor: "pointer",
              color: sort === t.key ? "#1a1a2e" : "rgba(26,26,46,0.35)",
              fontWeight: sort === t.key ? 600 : 400,
              borderBottom: sort === t.key ? "2px solid #fbbf24" : "2px solid transparent",
              transition: "all 0.2s", borderRadius: 0,
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: columnCount }, (_, ci) => (
            <div key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {Array.from({ length: 4 }, (_, ri) => (
                <div key={ri} style={{
                  height: 220 + ((ci * 3 + ri) % 5) * 50, borderRadius: 10,
                  background: "linear-gradient(90deg, #f5f3ee 25%, #faf7f2 50%, #f5f3ee 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite",
                  animationDelay: `${(ci + ri) * 0.12}s`,
                }} />
              ))}
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "100px 40px" }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.2 }}>
            {search ? "🔍" : "🎨"}
          </div>
          <h3 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(26,26,46,0.45)",
            marginBottom: 6, fontWeight: 500,
          }}>
            {search ? "No results found" : "No Creations Yet"}
          </h3>
          <p style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.3)" }}>
            {search ? "Try different keywords" : "Be the first to create something"}
          </p>
        </div>
      ) : (
        <MasonryGrid
          items={filteredItems}
          columnCount={columnCount}
          onLike={handleLike}
          onCardClick={(item, index) => { setSelectedItem(item); setSelectedIndex(index); }}
        />
      )}

      {selectedItem && (
        <DetailModal
          item={selectedItem} index={selectedIndex}
          onClose={() => setSelectedItem(null)}
          onLike={handleLike}
        />
      )}
    </div>
  );
}
