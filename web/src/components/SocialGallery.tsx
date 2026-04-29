"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { MOCK_SOCIAL_FEED, MOCK_TRENDING_TAGS, MOCK_TOP_CREATORS, MOCK_COMMUNITY_STATS } from "@/lib/mockData";

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_NAMES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

function timeAgo(dateStr: string) {
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

function getCardHeight(index: number, aspectRatio: string) {
  const ratioMap: any = {
    "1:1": 1, "4:3": 0.75, "3:4": 1.33,
    "16:9": 0.5625, "9:16": 1.78, "4:5": 1.25, "3:2": 0.667,
  };
  const ratio = ratioMap[aspectRatio] || 1;
  return Math.max(240, Math.min(440, 300 * ratio));
}

// ── Comment Section ──
function CommentSection({ generationId }: { generationId: number }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [generationId]);

  const loadComments = async () => {
    try {
      const data = await api.social.comments(generationId);
      setComments(data.comments || data.items || []);
    } catch {
      setComments([]);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.social.addComment(generationId, newComment.trim());
      setNewComment("");
      await loadComments();
    } catch {
      // ignore
    }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
        textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, fontWeight: 600,
      }}>
        Comments ({comments.length})
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 10, maxHeight: 200 }}>
        {loading ? (
          <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.25)", padding: 8 }}>Loading...</div>
        ) : comments.length === 0 ? (
          <div style={{
            fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.25)",
            textAlign: "center", padding: "16px 0",
          }}>
            No comments yet. Be the first!
          </div>
        ) : (
          comments.map((c: any) => (
            <div key={c.id} style={{
              display: "flex", gap: 8, marginBottom: 10, padding: "8px 0",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
              animation: "fadeUp 0.2s ease-out",
            }}>
              {/* Avatar */}
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                background: c.is_agent ? "rgba(251,191,36,0.15)" : "rgba(139,92,246,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: c.is_agent ? "1.5px solid rgba(251,191,36,0.3)" : "1px solid rgba(139,92,246,0.15)",
              }}>
                {c.pet?.avatar_url ? (
                  <img src={c.pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 12 }}>{c.is_agent ? "🐾" : "👤"}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600,
                    color: c.is_agent ? "#b45309" : "#1a1a2e",
                  }}>
                    {c.is_agent ? (c.pet?.name || "Pet Agent") : (c.display_name || c.wallet_address?.slice(0, 8) || "User")}
                  </span>
                  {c.is_agent && (
                    <span style={{
                      fontSize: 7, padding: "1px 5px", borderRadius: 4,
                      background: "rgba(251,191,36,0.12)", color: "#b45309",
                      fontFamily: "mono", fontWeight: 600,
                    }}>PET</span>
                  )}
                  <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.25)" }}>
                    {c.created_at ? timeAgo(c.created_at) : ""}
                  </span>
                </div>
                <div style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.65)",
                  lineHeight: 1.5, wordBreak: "break-word",
                }}>
                  {c.content}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment input */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Write a comment..."
          style={{
            flex: 1, padding: "9px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)",
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "#1a1a2e",
            outline: "none", boxSizing: "border-box",
          }}
        />
        <button onClick={handleSubmit} disabled={!newComment.trim() || submitting} style={{
          padding: "9px 14px", borderRadius: 8, border: "none", cursor: "pointer",
          background: newComment.trim() ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(0,0,0,0.04)",
          color: newComment.trim() ? "white" : "rgba(26,26,46,0.25)",
          fontFamily: "mono", fontSize: 11, fontWeight: 600,
        }}>
          {submitting ? "..." : "Post"}
        </button>
      </div>
    </div>
  );
}

// ── Detail Modal ──
function DetailModal({ item, onClose, onLike, index }: any) {
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
          {item.video_url || item.video_path ? (
            <>
              <video id="detail-video" src={item.video_url || item.video_path} autoPlay loop playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => {
                const v = document.getElementById("detail-video") as HTMLVideoElement;
                if (v) v.muted = !v.muted;
              }} style={{
                position: "absolute", bottom: 14, right: 14, width: 36, height: 36,
                borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 16, color: "white",
              }}>🔊</button>
            </>
          ) : item.photo_url || item.photo_path ? (
            <img src={item.photo_url || item.photo_path} alt=""
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
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
                  {item.display_name || item.wallet_address || "Anonymous"}
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

          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.55)",
              lineHeight: 1.6, padding: "10px 12px", borderRadius: 8,
              background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)",
              maxHeight: 60, overflow: "hidden",
            }}>
              {item.prompt}
            </div>
          </div>

          <div style={{
            display: "flex", gap: 12, padding: "10px 0", marginBottom: 12,
            borderTop: "1px solid rgba(0,0,0,0.06)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            <button onClick={() => onLike(item.generation_id || item.id, index)} style={{
              display: "flex", alignItems: "center", gap: 5, background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}>
              <span style={{ fontSize: 15, color: item.is_liked ? "#f472b6" : "rgba(26,26,46,0.35)" }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e",
              }}>
                {item.likes_count || 0}
              </span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 14, color: "rgba(26,26,46,0.35)" }}>💬</span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e",
              }}>
                {item.comments_count || 0}
              </span>
            </div>
          </div>

          {/* Comments */}
          <CommentSection generationId={item.generation_id || item.id} />
        </div>
      </div>
    </div>
  );
}

// ── Gallery Card (Midjourney/Leonardo style) ──
function GalleryCard({ item, index, onLike, onClick }: any) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardHeight = getCardHeight(index, item.aspect_ratio);
  const timeoutRef = useRef<any>(null);

  // Video: auto-play when visible (IntersectionObserver)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // Timeout-based fallback: hide broken video cards after 3s
  useEffect(() => {
    const isVideo = item.video_url || item.video_path;
    const hasPoster = item.photo_url || item.photo_path;
    if (isVideo) {
      const timeout = setTimeout(() => {
        const video = videoRef.current;
        if (video && (video.readyState < 2)) {
          // Video hasn't loaded enough to play
          if (!hasPoster) {
            setCardVisible(false);
          } else {
            setMediaFailed(true);
          }
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, []);

  const hasMedia = !!(item.video_url || item.video_path || item.photo_url || item.photo_path);
  const isVideo = item.gen_type === "video" || item.video_url || item.video_path;

  if (!cardVisible) return null;

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
        item.video_url || item.video_path ? (
          <>
            {/* Video poster — shown as fallback when video fails */}
            {(item.photo_url || item.photo_path) && (
              <img src={item.photo_url || item.photo_path} alt=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "cover", zIndex: 1,
                  opacity: mediaFailed ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }} />
            )}
            {!mediaFailed && (
              <video ref={videoRef} src={item.video_url || item.video_path}
                poster={item.photo_url || item.photo_path || undefined}
                style={{
                  width: "100%", height: "100%", objectFit: "cover", display: "block",
                  position: "relative", zIndex: 0,
                }}
                autoPlay muted loop playsInline preload="metadata"
                onError={() => setMediaFailed(true)} />
            )}
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
              src={item.photo_url || item.photo_path} alt=""
              onLoad={() => setImgLoaded(true)}
              onError={() => { setCardVisible(false); }}
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
        {/* Hover: show pet name only, no prompt */}

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
              {item.display_name || item.wallet_address || "Anon"}
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

            {hovered && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  const text = encodeURIComponent(`${item.prompt || "My AI Pet creation"} — generated on MY AI PET 🐾`);
                  const url = encodeURIComponent("https://app.myaipet.ai");
                  const tags = encodeURIComponent("MYAIPET,AIArt,PetClaw");
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${tags}`, "_blank", "width=600,height=400");
                }}
                style={{
                  background: "rgba(0,0,0,0.45)", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 6, padding: 0,
                  animation: "fadeUp 0.15s ease-out", flexShrink: 0,
                }}
                title="Share on X"
              >
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700, lineHeight: 1 }}>𝕏</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Masonry Layout ──
function MasonryGrid({ items, onLike, onCardClick, columnCount }: any) {
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({ items: [] as any[], height: 0 }));
    items.forEach((item: any, i: number) => {
      const shortest = cols.reduce((min: number, col: any, idx: number) => col.height < cols[min].height ? idx : min, 0);
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
          {col.items.map(({ item, index }: any) => (
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
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("trending");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
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
    const MIN_REAL = 8;
    let realItems: any[] = [];
    try {
      const data = await api.social.feed({ sort, page: 1, page_size: 40 });
      realItems = (data.items || []).filter((i: any) => i.photo_url || i.photo_path || i.video_url || i.video_path);
    } catch {}
    if (realItems.length === 0) {
      try {
        const data = await api.gallery.list({ sort: sort === "most_liked" ? "recent" : sort, page: 1, page_size: 40 });
        realItems = (data.items || []).map((i: any) => ({ ...i, generation_id: i.id, likes_count: 0, comments_count: 0, is_liked: false }));
      } catch {}
    }
    // Pad with mock data when real items are sparse so community doesn't look empty
    if (realItems.length < MIN_REAL) {
      const usedIds = new Set(realItems.map((i: any) => i.id));
      const mockPad = MOCK_SOCIAL_FEED.items.filter((m: any) => !usedIds.has(m.id));
      setItems([...realItems, ...mockPad]);
    } else {
      setItems(realItems);
    }
    setLoading(false);
  };

  const handleLike = useCallback(async (generationId: number, index: number) => {
    const toggle = (prev: any[]) => prev.map((item, i) => {
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
    setSelectedItem((prev: any) => {
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

      {/* ── Community Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Works", value: MOCK_COMMUNITY_STATS.total_works, icon: "🎨" },
          { label: "Active Pets", value: MOCK_COMMUNITY_STATS.active_pets, icon: "🐾" },
          { label: "Likes Today", value: MOCK_COMMUNITY_STATS.likes_today, icon: "❤️" },
          { label: "Creators", value: MOCK_COMMUNITY_STATS.creators, icon: "✨" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: "#1a1a2e" }}>{s.value}</div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(26,26,46,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Top Creators ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, letterSpacing: "-0.01em" }}>
          Top Creators
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {MOCK_TOP_CREATORS.map(c => (
            <div key={c.name} style={{
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              padding: "7px 12px", borderRadius: 24,
              background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
              cursor: "pointer", transition: "all 0.2s",
            }}>
              <img src={c.avatar} alt={c.name} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: "#1a1a2e" }}>{c.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>❤️ {c.likes.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trending Tags ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MOCK_TRENDING_TAGS.map(t => (
            <button key={t.tag} onClick={() => setSearch(t.tag.replace("#",""))} style={{
              padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)",
              background: "rgba(0,0,0,0.02)", fontFamily: "monospace", fontSize: 10,
              color: "rgba(26,26,46,0.5)", cursor: "pointer", transition: "all 0.2s",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {t.tag} <span style={{ color: "rgba(26,26,46,0.25)" }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

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
          onCardClick={(item: any, index: number) => { setSelectedItem(item); setSelectedIndex(index); }}
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
