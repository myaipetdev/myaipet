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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="flex flex-col sm:flex-row w-[92vw] max-w-[1000px] max-h-[88vh] bg-white rounded-3xl overflow-hidden shadow-2xl animate-bounce-in">
        {/* Image */}
        <div className="flex-[1_1_58%] relative overflow-hidden bg-cream-dark flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
          {item.photo_url ? (
            <img src={item.photo_url.replace(/w=\d+/, 'w=800').replace(/h=\d+/, 'h=800')} alt=""
              className="w-full h-full object-cover" />
          ) : (
            <span className="text-7xl opacity-30">{PET_EMOJIS[item.pet_type] || "🐾"}</span>
          )}
          {item.gen_type === "video" && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" style={{ boxShadow: "0 0 6px #4ade80" }} />
              <span className="font-body text-xs text-white font-bold">Video · {item.duration}s</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-[1_1_42%] p-6 flex flex-col overflow-auto">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink to-sun flex items-center justify-center text-sm">
                {PET_EMOJIS[item.pet_type] || "🐾"}
              </div>
              <div>
                <div className="font-heading text-sm text-[#422D26]">{item.display_name || "Anonymous"}</div>
                <div className="font-body text-xs text-pink/65">
                  {item.created_at ? timeAgo(item.created_at) + " ago" : ""}
                </div>
              </div>
            </div>
            <button onClick={onClose}
              className="squishy w-8 h-8 rounded-xl bg-cream-dark/60 hover:bg-cream-dark flex items-center justify-center text-[#422D26]/50 text-sm transition-all">
              ✕
            </button>
          </div>

          {/* Prompt */}
          <div className="mb-5">
            <div className="font-body text-xs text-pink/60 uppercase tracking-widest font-bold mb-2">Prompt</div>
            <div className="font-body text-sm text-[#422D26]/70 leading-relaxed p-4 rounded-2xl bg-cream-dark/40 sticker-border">
              {item.prompt}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {[
              { label: item.style_name || "Cinematic", color: "bg-sun/10 text-sun-dark" },
              { label: PET_NAMES[item.pet_type] || "Pet", color: "bg-lavender/10 text-lavender" },
              { label: item.gen_type === "video" ? `Video ${item.duration}s` : "Image", color: "bg-mint/10 text-[#4ade80]" },
              { label: item.aspect_ratio || "1:1", color: "bg-sky/10 text-sky-dark" },
            ].map(t => (
              <span key={t.label} className={`font-body text-xs font-bold px-2.5 py-1 rounded-full ${t.color}`}>
                {t.label}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-6 py-4 mb-5" style={{ borderTop: "1px solid rgba(255,134,183,0.08)", borderBottom: "1px solid rgba(255,134,183,0.08)" }}>
            <div>
              <div className="font-heading text-xl text-[#422D26]">{item.likes_count || 0}</div>
              <div className="font-body text-xs text-pink/60 uppercase font-bold">Likes</div>
            </div>
            <div>
              <div className="font-heading text-xl text-[#422D26]">{item.comments_count || 0}</div>
              <div className="font-body text-xs text-pink/60 uppercase font-bold">Comments</div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-auto flex gap-2">
            <button onClick={() => onLike(item.generation_id || item.id, index)}
              className={`squishy flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-body text-sm font-bold transition-all
                ${item.is_liked
                  ? "bg-pink/10 text-pink border border-pink/20"
                  : "bg-cream-dark/50 text-[#422D26]/40 border border-cream-dark hover:bg-cream-dark"
                }`}>
              <span className="text-base">{item.is_liked ? "💖" : "🤍"}</span>
              {item.is_liked ? "Liked" : "Like"}
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(item.prompt); }}
              className="squishy flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl
                bg-cream-dark/50 text-[#422D26]/40 border border-cream-dark hover:bg-cream-dark
                font-body text-sm font-bold transition-all">
              📋 Copy Prompt
            </button>
            <button className="squishy w-11 flex items-center justify-center rounded-2xl
              bg-cream-dark/50 border border-cream-dark hover:bg-cream-dark text-sm transition-all">
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
      className="rounded-2xl overflow-hidden cursor-pointer mb-2 transition-all duration-300"
      style={{
        height: cardHeight,
        position: "relative",
        transform: hovered ? "scale(1.015)" : "scale(1)",
        boxShadow: hovered ? "0 20px 60px rgba(66,45,38,0.15)" : "0 4px 12px rgba(66,45,38,0.05)",
      }}
    >
      {/* Image */}
      {hasMedia ? (
        item.video_url ? (
          <video ref={videoRef} src={item.video_url}
            className="w-full h-full object-cover block" muted loop playsInline />
        ) : (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-cream-dark"
                style={{ animation: "shimmer 1.5s ease-in-out infinite", backgroundImage: "linear-gradient(90deg, #FFF0E0 0%, #FFF9F2 50%, #FFF0E0 100%)", backgroundSize: "200% 100%" }} />
            )}
            <img
              src={item.photo_url} alt=""
              onLoad={() => setImgLoaded(true)}
              className="w-full h-full object-cover block"
              style={{
                transition: "transform 0.6s cubic-bezier(0.2, 0, 0, 1), filter 0.4s ease",
                transform: hovered ? "scale(1.06)" : "scale(1)",
                filter: hovered ? "brightness(0.85)" : "brightness(1)",
                opacity: imgLoaded ? 1 : 0,
              }}
              loading="lazy"
            />
          </>
        )
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-cream-dark to-pink/10 flex items-center justify-center">
          <span className="text-5xl opacity-40">{PET_EMOJIS[item.pet_type] || "🐾"}</span>
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-2.5 left-2.5 flex gap-1.5">
        {item.gen_type === "video" && (
          <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md flex items-center gap-1
            font-body text-xs text-white font-bold">
            <span className="w-1 h-1 rounded-full bg-[#4ade80]" style={{ boxShadow: "0 0 4px #4ade80" }} />
            {item.duration}s
          </span>
        )}
      </div>

      {/* Style badge on hover */}
      {hovered && (
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md
          font-body text-xs text-sun font-bold animate-slide-up">
          {item.style_name || "Cinematic"}
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 flex flex-col justify-end transition-all duration-300"
        style={{
          pointerEvents: hovered ? "auto" : "none",
          background: hovered
            ? "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 45%, transparent 65%)"
            : "linear-gradient(0deg, rgba(0,0,0,0.35) 0%, transparent 25%)",
          padding: hovered ? "14px" : "10px",
        }}>
        {/* Prompt on hover */}
        {hovered && (
          <div className="font-body text-xs text-white/90 leading-relaxed mb-2.5 line-clamp-2 animate-slide-up"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            {item.prompt}
          </div>
        )}

        {/* Bottom info */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            {hovered && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink to-sun flex items-center justify-center text-xs border border-white/25 animate-slide-up">
                {PET_EMOJIS[item.pet_type]}
              </div>
            )}
            <span className="font-body text-xs font-bold text-white/80 truncate max-w-[100px]"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {item.display_name || "Anon"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); onLike(item.generation_id || item.id, index); }}
              className="flex items-center gap-1 bg-transparent border-none cursor-pointer p-0">
              <span className="text-sm transition-all" style={{
                color: item.is_liked ? "#FF86B7" : "rgba(255,255,255,0.65)",
                transform: item.is_liked ? "scale(1.2)" : "scale(1)",
                filter: item.is_liked ? "drop-shadow(0 0 4px rgba(255,134,183,0.5))" : "none",
              }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span className="font-body text-xs font-bold text-white/60"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                {item.likes_count > 999 ? `${(item.likes_count/1000).toFixed(1)}k` : item.likes_count || 0}
              </span>
            </button>

            {hovered && (
              <div className="flex items-center gap-1 animate-slide-up">
                <span className="text-xs opacity-50">💬</span>
                <span className="font-body text-xs text-white/50"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
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
    <div className="flex gap-2 items-start">
      {columns.map((col, ci) => (
        <div key={ci} className="flex-1">
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
    <div className="max-w-[1440px] mx-auto px-5 pt-32 pb-16">
      <style>{`
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-baseline gap-3">
            <h2 className="font-heading text-3xl text-[#422D26]">Explore</h2>
            <span className="font-body text-xs text-pink/55 font-bold">{filteredItems.length} works</span>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-pink/55 pointer-events-none">⌕</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-[200px] py-2 pl-8 pr-3 rounded-2xl bg-white/60 border border-pink/10
                text-[#422D26] font-body text-sm outline-none focus:border-pink/25 transition-colors
                placeholder:text-pink/55"
            />
          </div>
        </div>

        {/* Tabs + Filters */}
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setSort(t.key)}
                className={`squishy px-4 py-1.5 font-body text-sm font-bold transition-all border-b-2
                  ${sort === t.key
                    ? "text-[#422D26] border-pink"
                    : "text-pink/60 border-transparent hover:text-pink/60"
                  }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {[
              { key: "all", label: "All" },
              { key: "image", label: "Images" },
              { key: "video", label: "Videos" },
            ].map(f => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)}
                className={`squishy rounded-full px-3 py-1 font-body text-xs font-bold transition-all
                  ${typeFilter === f.key
                    ? "bg-pink/10 text-pink"
                    : "text-pink/60 hover:text-pink/55"
                  }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex gap-2">
          {Array.from({ length: columnCount }, (_, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, ri) => (
                <div key={ri} className="rounded-2xl bg-cream-dark/60"
                  style={{
                    height: 200 + ((ci * 3 + ri) % 5) * 50,
                    animation: "shimmer 1.5s ease-in-out infinite",
                    backgroundImage: "linear-gradient(90deg, #FFF0E0 25%, #FFF9F2 50%, #FFF0E0 75%)",
                    backgroundSize: "200% 100%",
                    animationDelay: `${(ci + ri) * 0.12}s`,
                  }} />
              ))}
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4 opacity-30">{search ? "🔍" : "🎨"}</div>
          <h3 className="font-heading text-lg text-[#422D26]/40 mb-2">
            {search ? "No results found" : "No Creations Yet"}
          </h3>
          <p className="font-body text-xs text-pink/55">
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
