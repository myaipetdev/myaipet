import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { MOCK_SOCIAL_FEED } from "../mockData";

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_NAMES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
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
  return Math.max(220, Math.min(440, 280 * ratio));
}

// ── Detail Modal ──
function DetailModal({ item, onClose, onLike, index }) {
  if (!item) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)",
    }} onClick={onClose}>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{
        display: "flex", maxWidth: 1000, width: "92vw", maxHeight: "88vh",
        background: "#111114", borderRadius: 14, overflow: "hidden",
        boxShadow: "0 40px 120px rgba(0,0,0,0.8)",
        animation: "modalIn 0.25s ease-out",
      }}>
        {/* Image */}
        <div style={{
          flex: "1 1 58%", position: "relative", overflow: "hidden",
          background: "#0a0a0e", display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 400,
        }}>
          {item.photo_url ? (
            <img src={item.photo_url.replace(/w=\d+/, 'w=800').replace(/h=\d+/, 'h=800')} alt=""
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
          {/* Header */}
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
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "white", fontWeight: 600 }}>
                  {item.display_name || "Anonymous"}
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                  {item.created_at ? timeAgo(item.created_at) + " ago" : ""}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.04)", border: "none", color: "rgba(255,255,255,0.4)",
              cursor: "pointer", width: 30, height: 30, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>✕</button>
          </div>

          {/* Prompt */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, fontWeight: 600,
            }}>Prompt</div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, color: "rgba(255,255,255,0.65)",
              lineHeight: 1.7, padding: "14px 16px", borderRadius: 10,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
            }}>
              {item.prompt}
            </div>
          </div>

          {/* Tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {[
              { label: item.style_name || "Cinematic", color: "#fbbf24" },
              { label: PET_NAMES[item.pet_type] || "Pet", color: "#a78bfa" },
              { label: item.gen_type === "video" ? `Video ${item.duration}s` : "Image", color: "#4ade80" },
              { label: item.aspect_ratio || "1:1", color: "#60a5fa" },
            ].map(t => (
              <span key={t.label} style={{
                padding: "4px 10px", borderRadius: 6,
                background: `rgba(255,255,255,0.03)`, border: `1px solid rgba(255,255,255,0.06)`,
                fontFamily: "mono", fontSize: 10, color: t.color, fontWeight: 500,
              }}>
                {t.label}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div style={{
            display: "flex", gap: 20, padding: "14px 0", marginBottom: 18,
            borderTop: "1px solid rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: "white", fontWeight: 700 }}>
                {item.likes_count || 0}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>Likes</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: "white", fontWeight: 700 }}>
                {item.comments_count || 0}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>Comments</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => onLike(item.generation_id || item.id, index)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "11px", borderRadius: 10, cursor: "pointer",
              background: item.is_liked
                ? "linear-gradient(135deg, rgba(244,114,182,0.15), rgba(244,114,182,0.08))"
                : "rgba(255,255,255,0.03)",
              border: item.is_liked ? "1px solid rgba(244,114,182,0.25)" : "1px solid rgba(255,255,255,0.06)",
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 15, color: item.is_liked ? "#f472b6" : "rgba(255,255,255,0.35)" }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                color: item.is_liked ? "#f472b6" : "rgba(255,255,255,0.4)",
              }}>
                {item.is_liked ? "Liked" : "Like"}
              </span>
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(item.prompt); }} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "11px", borderRadius: 10, cursor: "pointer",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600,
              transition: "all 0.2s",
            }}>
              📋 Copy Prompt
            </button>
            <button style={{
              width: 42, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 10, cursor: "pointer",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 14, transition: "all 0.2s",
            }}>
              ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Gallery Card ──
function GalleryCard({ item, index, onLike, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const videoRef = useRef(null);
  const cardHeight = getCardHeight(index, item.aspect_ratio);

  useEffect(() => {
    if (!videoRef.current) return;
    if (hovered) videoRef.current.play().catch(() => {});
    else { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  }, [hovered]);

  const hasMedia = item.video_url || item.photo_url;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(item, index)}
      style={{
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        height: cardHeight, position: "relative",
        marginBottom: 6,
        transition: "all 0.35s cubic-bezier(0.2, 0, 0, 1)",
        transform: hovered ? "scale(1.015)" : "scale(1)",
        boxShadow: hovered
          ? "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)"
          : "none",
      }}
    >
      {/* Image */}
      {hasMedia ? (
        item.video_url ? (
          <video ref={videoRef} src={item.video_url}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            muted loop playsInline />
        ) : (
          <>
            {!imgLoaded && (
              <div style={{
                position: "absolute", inset: 0, background: "#15151a",
                animation: "shimmer 1.5s ease-in-out infinite",
                backgroundImage: "linear-gradient(90deg, #15151a 0%, #1e1e26 50%, #15151a 100%)",
                backgroundSize: "200% 100%",
              }} />
            )}
            <img
              src={item.photo_url} alt=""
              onLoad={() => setImgLoaded(true)}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                transition: "transform 0.6s cubic-bezier(0.2, 0, 0, 1), filter 0.4s ease",
                transform: hovered ? "scale(1.06)" : "scale(1)",
                filter: hovered ? "brightness(0.7)" : "brightness(1)",
                opacity: imgLoaded ? 1 : 0,
              }}
              loading="lazy"
            />
          </>
        )
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: `linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 48, opacity: 0.4 }}>{PET_EMOJIS[item.pet_type] || "🐾"}</span>
        </div>
      )}

      {/* Badges - always visible */}
      <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 5 }}>
        {item.gen_type === "video" && (
          <span style={{
            padding: "3px 9px", borderRadius: 6,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.9)", fontWeight: 500,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 4px #4ade80" }} />
            {item.duration}s
          </span>
        )}
      </div>

      {/* Style badge - top right, visible on hover */}
      {hovered && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          padding: "3px 9px", borderRadius: 6,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
          fontFamily: "mono", fontSize: 9, color: "#fbbf24", fontWeight: 500,
          animation: "fadeUp 0.2s ease-out",
        }}>
          {item.style_name || "Cinematic"}
        </div>
      )}

      {/* Hover overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: hovered ? "auto" : "none",
        background: hovered
          ? "linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 45%, transparent 65%)"
          : "linear-gradient(0deg, rgba(0,0,0,0.4) 0%, transparent 25%)",
        transition: "all 0.35s ease",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: hovered ? "14px" : "10px",
      }}>
        {/* Prompt - on hover */}
        {hovered && (
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.9)",
            lineHeight: 1.5, marginBottom: 10,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            animation: "fadeUp 0.2s ease-out",
            textShadow: "0 1px 3px rgba(0,0,0,0.5)",
          }}>
            {item.prompt}
          </div>
        )}

        {/* Bottom info */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: hovered ? 24 : 0, height: hovered ? 24 : 0, borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, transition: "all 0.25s ease",
              overflow: "hidden", opacity: hovered ? 1 : 0,
              border: hovered ? "1.5px solid rgba(255,255,255,0.25)" : "none",
            }}>
              {PET_EMOJIS[item.pet_type]}
            </div>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600,
              color: hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              transition: "color 0.2s",
              maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {item.display_name || "Anon"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onLike(item.generation_id || item.id, index); }}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{
                color: item.is_liked ? "#f472b6" : "rgba(255,255,255,0.65)",
                fontSize: 14, transition: "all 0.15s",
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
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                animation: "fadeUp 0.2s ease-out",
              }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>💬</span>
                <span style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.5)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                }}>
                  {item.comments_count || 0}
                </span>
              </div>
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
      cols[shortest].height += h + 6;
    });
    return cols;
  }, [items, columnCount]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
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
    <div style={{ padding: "0 20px 60px", maxWidth: 1440, margin: "0 auto", paddingTop: 88 }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        .gallery-search { transition: all 0.2s }
        .gallery-search::placeholder { color: rgba(255,255,255,0.18) }
        .gallery-search:focus { border-color: rgba(255,255,255,0.12) !important; background: rgba(255,255,255,0.04) !important }
        .sort-tab:hover { color: rgba(255,255,255,0.7) !important }
        .filter-chip:hover { background: rgba(255,255,255,0.06) !important }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
              color: "white", margin: 0, letterSpacing: "-0.03em",
            }}>
              Explore
            </h2>
            <span style={{
              fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.15)", fontWeight: 500,
            }}>
              {filteredItems.length} works
            </span>
          </div>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              fontSize: 12, color: "rgba(255,255,255,0.18)", pointerEvents: "none",
            }}>⌕</span>
            <input
              className="gallery-search"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: 200, padding: "8px 14px 8px 30px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                color: "white", fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Tabs + Filters */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 0 }}>
            {TABS.map(t => (
              <button className="sort-tab" key={t.key} onClick={() => setSort(t.key)} style={{
                background: "transparent", border: "none", padding: "6px 14px",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, cursor: "pointer",
                color: sort === t.key ? "white" : "rgba(255,255,255,0.3)",
                fontWeight: sort === t.key ? 600 : 400,
                borderBottom: sort === t.key ? "2px solid #fbbf24" : "2px solid transparent",
                transition: "all 0.2s", borderRadius: 0,
              }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            {[
              { key: "all", label: "All" },
              { key: "image", label: "Images" },
              { key: "video", label: "Videos" },
            ].map(f => (
              <button className="filter-chip" key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                background: typeFilter === f.key ? "rgba(255,255,255,0.08)" : "transparent",
                border: "none", borderRadius: 6, padding: "4px 10px",
                fontFamily: "mono", fontSize: 10, cursor: "pointer",
                color: typeFilter === f.key ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
                transition: "all 0.2s",
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: columnCount }, (_, ci) => (
            <div key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {Array.from({ length: 4 }, (_, ri) => (
                <div key={ri} style={{
                  height: 200 + ((ci * 3 + ri) % 5) * 50, borderRadius: 12,
                  background: "linear-gradient(90deg, #13131a 25%, #1a1a24 50%, #13131a 75%)",
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
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.25 }}>
            {search ? "🔍" : "🎨"}
          </div>
          <h3 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(255,255,255,0.35)",
            marginBottom: 6, fontWeight: 500,
          }}>
            {search ? "No results found" : "No Creations Yet"}
          </h3>
          <p style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.12)" }}>
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
