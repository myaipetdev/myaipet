"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import { SEASON_SCHEDULED } from "@/lib/season";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF", cta1: "#F49B2A", cta2: "#E27D0C",
  happy: "#F0589E", energy: "#3E8FE0", bond: "#9E72E8",
  rareCommon: "#5C8A4E", rareRare: "#3E8FE0", rareEpic: "#9E72E8", rareLegend: "#C8932F",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
function CommentSection({ generationId, onAdded }: { generationId: number; onAdded?: () => void }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A failed POST (401/429/500) used to be swallowed — the field just sat there
  // with no signal. Surface a distinct, wallet-aware message; clear it on the
  // next keystroke or a successful post.
  const [error, setError] = useState("");

  // Closing the detail modal unmounts this card mid-fetch; guard every async
  // setState so a late comments/post response doesn't warn on an unmounted node.
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    loadComments();
  }, [generationId]);

  const loadComments = async () => {
    try {
      const data = await api.social.comments(generationId);
      if (mountedRef.current) setComments(data.comments || data.items || []);
    } catch {
      if (mountedRef.current) setComments([]);
    }
    if (mountedRef.current) setLoading(false);
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    if (mountedRef.current) setError("");
    try {
      await api.social.addComment(generationId, newComment.trim());
      // Only clear the field once the server actually accepted the comment.
      if (mountedRef.current) setNewComment("");
      await loadComments();
      onAdded?.();
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e?.status === 401
          ? "Connect your wallet to comment"
          : "Couldn't post — try again");
      }
    }
    if (mountedRef.current) setSubmitting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        fontFamily: T.m, fontSize: 13, color: T.mono,
        textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 8, fontWeight: 700,
      }}>
        Comments · {comments.length}
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 10, maxHeight: 200 }}>
        {loading ? (
          <div role="status" aria-live="polite" style={{ fontFamily: T.m, fontSize: 13, color: T.muted2, padding: 8, letterSpacing: "0.04em" }}>Loading comments…</div>
        ) : comments.length === 0 ? (
          <div style={{
            fontFamily: T.m, fontSize: 13, color: T.muted2,
            textAlign: "center", padding: "16px 0", letterSpacing: "0.04em",
          }}>
            No comments yet. Be the first — a comment earns +3 pts.
          </div>
        ) : (
          comments.map((c: any) => (
            <div key={c.id} style={{
              display: "flex", gap: 8, marginBottom: 10, padding: "8px 0",
              borderBottom: `1px solid ${T.hair}`,
              animation: "fadeUp 0.2s ease-out",
            }}>
              {/* Avatar */}
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0, overflow: "hidden",
                background: T.inset,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: c.is_agent
                  ? "inset 0 0 0 1.5px rgba(184,130,44,.55)"
                  : `inset 0 0 0 1px ${T.hair}`,
              }}>
                {c.pet?.avatar_url ? (
                  <img src={c.pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : c.is_agent ? (
                  <img src="/mascot.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                    stroke={T.muted} strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx={12} cy={8} r={3.5} />
                    <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: T.body, fontSize: 13, fontWeight: 600,
                    color: c.is_agent ? T.rareLegend : T.ink,
                  }}>
                    {c.is_agent ? (c.pet?.name || "Pet Agent") : (c.display_name || c.wallet_address?.slice(0, 8) || "User")}
                  </span>
                  {c.is_agent && (
                    <span style={{
                      fontSize: 13, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(200,147,47,0.14)", color: T.rareLegend,
                      fontFamily: T.m, fontWeight: 700, letterSpacing: "0.1em",
                    }}>PET</span>
                  )}
                  <span style={{ fontFamily: T.m, fontSize: 13, color: T.mono }}>
                    {c.created_at ? timeAgo(c.created_at) : ""}
                  </span>
                </div>
                <div style={{
                  fontFamily: T.body, fontSize: 13, color: T.muted2,
                  lineHeight: 1.5, wordBreak: "break-word",
                }}>
                  {c.content}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Post-failure notice — a click that hits a 401/4xx/5xx must say so. */}
      {error && (
        <div role="alert" style={{
          fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
          color: T.terra, marginBottom: 6, paddingLeft: 2,
        }}>
          {error}
        </div>
      )}

      {/* Comment input */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          aria-label="Write a comment"
          value={newComment}
          onChange={e => { setNewComment(e.target.value); if (error) setError(""); }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Write a comment… (+3 pts)"
          style={{
            flex: 1, padding: "9px 12px", minHeight: 44, borderRadius: 8,
            background: T.inset, border: `1px solid ${T.hair}`,
            fontFamily: T.body, fontSize: 13, color: T.ink,
            outline: "none", boxSizing: "border-box",
          }}
        />
        <button type="button" aria-busy={submitting} onClick={handleSubmit} disabled={!newComment.trim() || submitting} style={{
          padding: "9px 14px", minHeight: 44, minWidth: 44, borderRadius: 8, border: "none", cursor: "pointer",
          background: newComment.trim() ? `linear-gradient(135deg,${T.cta1},${T.cta2})` : T.inset,
          color: newComment.trim() ? T.ink : T.mono,
          fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
          boxShadow: newComment.trim() ? "var(--ed-shadow-card)" : "none",
        }}>
          {submitting ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}

// ── Detail Modal ──
function DetailModal({ item, onClose, onLike, index, onCommentAdded }: any) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('[data-modal-close="true"]')?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current;
      requestAnimationFrame(() => target?.focus());
    };
  }, []);
  const [copied, setCopied] = useState(false);
  // Mobile: the 58/42 side-by-side layout squeezed both panes into unusable
  // slivers on a phone. Under 700px the modal stacks — media on top, details
  // scrolling below — and action targets grow to ≥44px.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 700px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  if (!item) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(38,28,12,0.52)",
    }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Creation details" onMouseDown={e => e.stopPropagation()} style={{
        display: "flex", flexDirection: narrow ? "column" : "row",
        maxWidth: 1000, width: narrow ? "94vw" : "92vw", maxHeight: "88vh",
        background: T.paper, borderRadius: 16, overflow: "hidden",
        boxShadow: "var(--ed-shadow-float)",
        animation: "modalIn 0.25s ease-out",
      }}>
        {/* Media */}
        <div style={{
          flex: narrow ? "0 0 auto" : "1 1 58%", position: "relative", overflow: "hidden",
          background: T.inset, display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: narrow ? 0 : 400, height: narrow ? "42vh" : undefined,
        }}>
          {item.video_url || item.video_path ? (
            <>
              <video id="detail-video" src={item.video_url || item.video_path} autoPlay loop muted playsInline
                poster={item.photo_url || item.photo_path || undefined}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button aria-label="Toggle sound" onClick={() => {
                const v = document.getElementById("detail-video") as HTMLVideoElement;
                if (v) v.muted = !v.muted;
              }} style={{
                position: "absolute", bottom: 14, right: 14, width: 44, height: 44,
                borderRadius: "50%", border: `2px solid ${T.paper}`, background: T.ink,
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 16, color: "white",
                boxShadow: "var(--ed-shadow-card)",
              }}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
                  stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" fill="white" stroke="none" />
                  <path d="M16.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M19 6a8.5 8.5 0 0 1 0 12" />
                </svg>
              </button>
            </>
          ) : item.photo_url || item.photo_path ? (
            // Foil-stamped collectible reveal — the creation presented as an artifact.
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: narrow ? "16px 14px" : "40px 28px" }}>
              <CollectibleFrame
                photoUrl={item.photo_url || item.photo_path}
                level={item.generation_id || item.id || 0}
                speciesLabel={(item.gen_type === "video" ? "MOTION" : "STILL")}
                elementLabel={`FILE №${item.generation_id || item.id || "—"}`}
                width={narrow ? 210 : 330}
                tilt={-2.4}
                seal={false}
              />
            </div>
          ) : (
            <img src="/mascot.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
          )}
          {item.gen_type === "video" && (
            <div style={{
              position: "absolute", top: 14, left: 14,
              padding: "5px 12px", borderRadius: 6, background: T.paper,
              boxShadow: "var(--ed-shadow-card)", display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.rareCommon }} />
              <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.ink70, textTransform: "uppercase" }}>Video · {item.duration}s</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: narrow ? "1 1 auto" : "1 1 42%", minHeight: 0, padding: narrow ? "16px 16px 18px" : "24px 26px", display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: T.inset,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                overflow: "hidden", boxShadow: `inset 0 0 0 1px ${T.hair}`,
              }}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
                  stroke={T.muted} strokeWidth={1.8}
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx={12} cy={8} r={3.5} />
                  <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: T.body, fontSize: 14, color: T.ink, fontWeight: 600 }}>
                  {item.display_name || item.wallet_address || "Anonymous"}
                </div>
                <div style={{ fontFamily: T.m, fontSize: 13, color: T.mono, letterSpacing: "0.06em" }}>
                  {item.created_at ? timeAgo(item.created_at) : ""}
                </div>
              </div>
            </div>
            <button type="button" data-modal-close="true" aria-label="Close creation details" onClick={onClose} style={{
              background: T.inset, border: "none", color: T.muted,
              cursor: "pointer", width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>✕</button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontFamily: T.body, fontSize: 13, color: T.muted2,
              lineHeight: 1.6, padding: "10px 12px", borderRadius: 8,
              background: T.inset, border: `1px solid ${T.hair}`,
              maxHeight: 60, overflow: "hidden",
            }}>
              {item.prompt}
            </div>
          </div>

          {/* Action row — every control keeps a ≥44px touch target (minHeight
              44 on the buttons; the row's vertical padding shrinks to hold the
              overall rhythm). */}
          <div style={{
            display: "flex", gap: 12, padding: "2px 0", marginBottom: 12, alignItems: "center",
            borderTop: `1px solid ${T.hair}`,
            borderBottom: `1px solid ${T.hair}`,
          }}>
            <button type="button" aria-label={item.is_liked ? "Unlike this creation" : "Like this creation"} aria-pressed={!!item.is_liked} onClick={() => onLike(item.generation_id || item.id, index)} style={{
              display: "flex", alignItems: "center", gap: 5, background: "none",
              border: "none", cursor: "pointer", padding: "0 4px", minHeight: 44, minWidth: 44,
            }}>
              <span style={{
                fontSize: 15, color: item.is_liked ? T.happy : T.muted,
                display: "inline-block",
                transform: item.is_liked ? "scale(1.3)" : "scale(1)",
                transition: "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s",
              }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.ink,
              }}>
                {item.likes_count || 0}
              </span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Icon name="chat" size={14} />
              <span style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.ink,
              }}>
                {item.comments_count || 0}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`https://app.myaipet.ai/c/${item.generation_id || item.id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {}
              }}
              aria-label="Copy link"
              title="Copy link to this creation"
              style={{
                display: "flex", alignItems: "center", gap: 5, background: "none",
                border: "none", cursor: "pointer", padding: "0 4px", marginRight: 10,
                minHeight: 44, minWidth: 44,
                fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                color: copied ? T.rareCommon : T.ink70,
              }}
            ><span style={{ fontSize: 13, display: "inline-flex", alignItems: "center" }}>{copied ? "✓" : (
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.5 14.5a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.2 1.2" />
                <path d="M14.5 9.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.2-1.2" />
              </svg>
            )}</span> {copied ? "Copied" : "Copy link"}</button>
            <button
              type="button"
              onClick={() => {
                const text = encodeURIComponent(`${item.prompt || "My AI Pet creation"} — generated on MY AI PET 🐾`);
                const url = encodeURIComponent(`https://app.myaipet.ai/c/${item.generation_id || item.id}`);
                const tags = encodeURIComponent("MYAIPET,AIArt,PetClaw");
                window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${tags}`, "_blank", "width=600,height=400");
              }}
              aria-label="Share on X"
              title="Share on X"
              style={{
                display: "flex", alignItems: "center", gap: 5, background: "none",
                border: "none", cursor: "pointer", padding: "0 4px",
                minHeight: 44, minWidth: 44,
                fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: T.ink70,
              }}
            ><span style={{ fontSize: 13 }}>𝕏</span> Share</button>
          </div>

          {/* Browse → Create: the highest-intent moment. Stash this creation's
              prompt and jump to the Create tab so a viewer becomes a generator. */}
          {!item.__mock && (
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem("studio_prefill", JSON.stringify({
                    prompt: item.prompt || "",
                    genType: item.gen_type === "video" ? "video" : "image",
                  }));
                } catch {}
                window.location.href = "/?section=create";
              }}
              style={{
                width: "100%", padding: "11px", minHeight: 44, borderRadius: 10, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg,${T.cta1},${T.cta2})`, color: T.ink,
                fontFamily: T.body, fontSize: 14, fontWeight: 700,
                marginBottom: 6, boxShadow: "var(--ed-shadow-card)",
              }}
            ><Icon name="sparkling" size={15} style={{ marginRight: 4 }} /> Make one like this →</button>
          )}
          {/* REAL grant: /api/studio/generate → studio_gen image +10 / video +20 (daily-capped) */}
          {!item.__mock && (
            <div style={{
              fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2,
              textAlign: "center", marginBottom: 12, letterSpacing: "0.04em",
            }}>
              A finished make earns +10 pts (image) · +20 (motion)
            </div>
          )}

          {/* Comments */}
          {item.__mock
            ? <div style={{ fontFamily: T.m, fontSize: 13, color: T.muted2, padding: "12px 2px", letterSpacing: "0.04em" }}>Sample post — comments open up on real creations.</div>
            : <CommentSection generationId={item.generation_id || item.id} onAdded={onCommentAdded} />}
        </div>
      </div>
    </div>
  );
}

// Touch targets (audit P2): on hover-less devices (media hover:none) the card's
// Copy/X share buttons must be ALWAYS visible at >=44px; on pointer devices
// they reveal on hover at >=28px. Hover-only 22px buttons were unreachable on
// touch and below every touch-target guideline.
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return coarse;
}

// ── Gallery Card (Midjourney/Leonardo style) ──
function GalleryCard({ item, index, onLike, onClick }: any) {
  const [hovered, setHovered] = useState(false);
  const coarse = useCoarsePointer();
  const showShare = hovered || coarse; // always-on for touch, hover-reveal for pointer
  const shareSize = coarse ? 44 : 28;  // >=44px touch targets, >=28px desktop
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");
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
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
      style={{
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        height: cardHeight, position: "relative",
        marginBottom: 4, background: T.paper,
        boxSizing: "border-box",
        transition: "transform 0.3s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.3s ease",
        transform: hovered ? "translateY(-3px) scale(1.01)" : "translateY(0) scale(1)",
        boxShadow: hovered
          ? "0 26px 46px -24px rgba(80,55,20,.6)"
          : "var(--ed-shadow-card)",
      }}
    >
      {/* gold inset keyline — the collectible's foil edge (small grid thumb) */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, borderRadius: 10, zIndex: 12, pointerEvents: "none",
        boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)",
      }} />
      {/* small holographic sheen (not the giant float) */}
      <div className="ed-holo-sheen" aria-hidden style={{ inset: 0, borderRadius: 10, zIndex: 2, opacity: 0.18 }} />
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
                background: "linear-gradient(135deg, #F5EFE2, #ECE4D4)",
                animation: "shimmer 1.5s ease-in-out infinite",
                backgroundImage: "linear-gradient(90deg, #F5EFE2 0%, #FBF6EC 50%, #F5EFE2 100%)",
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
          background: "linear-gradient(135deg, #FBF6EC, #ECE4D4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img src="/mascot.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
        </div>
      )}

      {/* A real full-card button keeps the card keyboard-operable without
          nesting the like/share buttons inside another interactive element. */}
      <button
        type="button"
        aria-label={`Open creation${item.prompt ? `: ${String(item.prompt).slice(0, 60)}` : ""}`}
        onClick={() => onClick(item, index)}
        style={{ position: "absolute", inset: 0, zIndex: 9, border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
      />

      {/* Top-left badges (always visible) */}
      {isVideo && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 10,
          padding: "3px 8px", borderRadius: 5,
          background: T.paper, boxShadow: "var(--ed-shadow-card)",
          display: "flex", alignItems: "center", gap: 5, pointerEvents: "none",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: hovered ? T.rareCommon : T.cta2,
            transition: "all 0.3s",
          }} />
          <span style={{ fontFamily: T.m, fontSize: 13, color: T.ink70, fontWeight: 700, letterSpacing: "0.08em" }}>
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
        pointerEvents: "none",
      }}>
        {/* Hover: show pet name only, no prompt */}

        {shareError && (
          <div role="alert" style={{
            alignSelf: "flex-end", marginBottom: 6, padding: "4px 7px", borderRadius: 6,
            background: "rgba(33,26,18,0.82)", color: "#FFF8EE", fontFamily: T.m, fontSize: 13,
          }}>
            {shareError}
          </div>
        )}

        {/* Bottom bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          opacity: hovered || coarse ? 1 : 0.7,
          transition: "opacity 0.3s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {hovered && (
              <div style={{
                width: 20, height: 20, borderRadius: 6,
                background: T.inset,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, animation: "fadeUp 0.15s ease-out",
                boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.7)", overflow: "hidden",
              }}>
                <img src="/mascot.jpg" alt="" style={{ width: "100%", height: "100%", borderRadius: 5, objectFit: "cover" }} />
              </div>
            )}
            <span style={{
              fontFamily: T.body, fontSize: 13, fontWeight: 600,
              color: "rgba(255,255,255,0.92)",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {item.display_name || item.wallet_address || "Anon"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onLike(item.generation_id || item.id, index); }}
              aria-label={item.is_liked ? "Unlike this creation" : "Like this creation"}
              aria-pressed={!!item.is_liked}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 3, pointerEvents: "auto",
              }}
            >
              <span style={{
                color: item.is_liked ? T.happy : "rgba(255,255,255,0.7)",
                fontSize: 13,
                // Overshoot easing → a tactile "pop" on like instead of a flat ease.
                transition: "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s, filter 0.15s",
                transform: item.is_liked ? "scale(1.3)" : "scale(1)",
                display: "inline-block",
                filter: item.is_liked ? "drop-shadow(0 1px 3px rgba(240,88,158,0.55))" : "none",
              }}>
                {item.is_liked ? "♥" : "♡"}
              </span>
              <span style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}>
                {item.likes_count > 999 ? `${(item.likes_count/1000).toFixed(1)}k` : item.likes_count || 0}
              </span>
            </button>

            {(hovered || (item.comments_count || 0) > 0) && (
              <span style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                display: "inline-flex", alignItems: "center", gap: 3,
              }}>
                <Icon name="chat" size={10} /> {item.comments_count || 0}
              </span>
            )}

            {showShare && (
              <button
                type="button"
                onClick={async e => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(`https://app.myaipet.ai/c/${item.generation_id || item.id}`);
                    setShareError("");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setShareError("Couldn't copy the link.");
                    setTimeout(() => setShareError(""), 2400);
                  }
                }}
                style={{
                  background: copied ? "rgba(92,138,78,0.9)" : "rgba(33,26,18,0.5)", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: shareSize, height: shareSize, borderRadius: coarse ? 10 : 8, padding: 0,
                  animation: "fadeUp 0.15s ease-out", flexShrink: 0, pointerEvents: "auto",
                }}
                title={copied ? "Copied!" : "Copy link"}
                aria-label="Copy link"
              >
                <span style={{ fontSize: coarse ? 17 : 13, color: "rgba(255,255,255,0.85)", fontWeight: 700, lineHeight: 1, display: "inline-flex" }}>{copied ? "✓" : (
                  <svg width={coarse ? 17 : 13} height={coarse ? 17 : 13} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.5 14.5a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.2 1.2" />
                    <path d="M14.5 9.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.2-1.2" />
                  </svg>
                )}</span>
              </button>
            )}
            {showShare && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const text = encodeURIComponent(`${item.prompt || "My AI Pet creation"} — generated on MY AI PET 🐾`);
                  const url = encodeURIComponent(`https://app.myaipet.ai/c/${item.generation_id || item.id}`);
                  const tags = encodeURIComponent("MYAIPET,AIArt,PetClaw");
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${tags}`, "_blank", "width=600,height=400");
                }}
                style={{
                  background: "rgba(33,26,18,0.5)", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: shareSize, height: shareSize, borderRadius: coarse ? 10 : 8, padding: 0,
                  animation: "fadeUp 0.15s ease-out", flexShrink: 0, pointerEvents: "auto",
                }}
                title="Share on X"
                aria-label="Share on X"
              >
                <span style={{ fontSize: coarse ? 17 : 13, color: "rgba(255,255,255,0.7)", fontWeight: 700, lineHeight: 1 }}>𝕏</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Masonry Layout ──
/** ALBUM view — community creations as standing record sleeves in a 3D
 *  carousel (the "Album Carousel UI" reference). Center sleeve faces the
 *  viewer; neighbours angle away like crate-dug vinyl. Wheel, drag, arrows
 *  and clicking a side sleeve all navigate; the player bar below carries the
 *  real creator/likes and opens the detail modal. */
export function AlbumCarousel({ items, onOpen, onLike, autoAdvance }: {
  items: any[];
  onOpen: (item: any, index: number) => void;
  /** Optional — when absent the ♥ button in the player bar is hidden (read-only surfaces). */
  onLike?: (genId: number, index: number) => void;
  /** Optional gentle auto-rotation interval (ms). Pauses on hover, skips under
   *  prefers-reduced-motion, and any manual interaction resets the timer. */
  autoAdvance?: number;
}) {
  const [idx, setIdx] = useState(0);
  const n = items.length;
  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, n - 1))); }, [n]);
  const wheelLock = useRef(0);
  const dragX = useRef<number | null>(null);

  // ── Responsive sleeve sizing ── the 300px sleeve + 168px neighbour offset
  // shot past a 375px phone (clipped by the stage, but the center sleeve nearly
  // filled the screen and neighbours were cropped to slivers). Shrink both on
  // mobile so the crate reads as a carousel, not one giant card. Desktop values
  // are byte-identical.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 560px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  const SLEEVE_W = narrow ? 220 : 300;
  const SLEEVE_OFFSET = narrow ? 120 : 168;
  const STAGE_H = narrow ? 360 : 470;

  // ── auto-advance ── an interval nudges idx forward (wrapping); hovering
  // pauses it, manual interaction restarts it (autoKey bump re-creates the
  // interval so the full delay elapses again), unmount clears it.
  const hoverRef = useRef(false);
  const [autoKey, setAutoKey] = useState(0);
  useEffect(() => {
    if (!autoAdvance || n < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (hoverRef.current) return;
      setIdx((i) => (i + 1) % n);
    }, autoAdvance);
    return () => clearInterval(t);
  }, [autoAdvance, n, autoKey]);
  const resetAuto = () => { if (autoAdvance) setAutoKey((k) => k + 1); };

  const go = (d: number) => { resetAuto(); setIdx((i) => Math.max(0, Math.min(n - 1, i + d))); };
  const cur = items[idx];
  const curId = cur ? (cur.generation_id || cur.id) : null;

  const media = (it: any) => it.photo_url || it.photo_path || null;
  const isVideo = (it: any) => !!(it.video_url || it.video_path);

  return (
    <div
      tabIndex={0}
      role="listbox"
      aria-label="Community creations carousel"
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
      onWheel={(e) => {
        // Only HORIZONTAL intent steps the crate — a vertical wheel must scroll
        // the page (previously deltaY hijacked the carousel, so scrolling down
        // both jumped the cards AND moved the page). One step per lock window so
        // a swipe "catches" a single sleeve at a time.
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        const now = Date.now();
        if (now - wheelLock.current < 320) return;
        wheelLock.current = now;
        if (Math.abs(e.deltaX) > 8) go(e.deltaX > 0 ? 1 : -1);
      }}
      onPointerEnter={() => { hoverRef.current = true; }}
      onPointerLeave={() => { hoverRef.current = false; }}
      onPointerDown={(e) => { dragX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (dragX.current == null) return;
        const dx = e.clientX - dragX.current;
        dragX.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
      style={{ outline: "none" }}
    >
      <div style={{ position: "relative", height: STAGE_H, perspective: 1400, overflow: "hidden" }}>
        {items.map((it, i) => {
          const off = i - idx;
          if (Math.abs(off) > 4) return null;
          const center = off === 0;
          const url = media(it);
          return (
            <div
              key={it.generation_id || it.id}
              style={{
                position: "absolute", left: "50%", top: "50%", width: SLEEVE_W,
                marginLeft: -SLEEVE_W / 2, marginTop: -(SLEEVE_W / 2 + 45),
                transform: `translateX(${off * SLEEVE_OFFSET}px) translateZ(${center ? 96 : -40 * Math.abs(off)}px) rotateY(${center ? 0 : -Math.sign(off) * 56}deg)`,
                transformStyle: "preserve-3d",
                zIndex: 100 - Math.abs(off),
                transition: "transform .45s cubic-bezier(.22,.9,.3,1)",
                cursor: "pointer",
              }}
            >
              {/* printed sleeve: paper mat + gold keyline well + spine caption */}
              <div aria-hidden="true" style={{ position: "relative", background: T.paper, borderRadius: 6, padding: 9, boxShadow: center ? "var(--ed-shadow-float)" : "var(--ed-shadow-card)" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden", borderRadius: 3, boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)", background: T.inset }}>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={it.prompt || "creation"} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : isVideo(it) ? (
                    <video src={it.video_url || it.video_path} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : null}
                  {center && <div className="ed-gloss" aria-hidden style={{ left: 0, opacity: 0.5 }} />}
                  {isVideo(it) && (
                    <span style={{ position: "absolute", right: 8, bottom: 8, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.creamOn, background: "rgba(33,26,18,.62)", borderRadius: 6, padding: "2px 8px" }}>▸ MOTION</span>
                  )}
                  {/* spine — vertical mono caption on the sleeve edge */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 22,
                    background: "linear-gradient(90deg, rgba(33,26,18,.28), rgba(33,26,18,0))",
                    display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
                  }}>
                    <span style={{
                      writingMode: "vertical-rl", fontFamily: T.m, fontSize: 13, fontWeight: 700,
                      letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,246,236,.92)",
                      maxHeight: "92%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {(it.display_name || "Anonymous")} · {(it.prompt || "untitled").slice(0, 26)}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.muted, textTransform: "uppercase" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{it.display_name || "Anonymous"}</span>
                  <span>♥ {it.likes_count || 0}</span>
                </div>
              </div>
              <button
                type="button"
                role="option"
                aria-selected={center}
                aria-posinset={i + 1}
                aria-setsize={n}
                aria-label={`${center ? "Open" : "Show"} creation by ${it.display_name || "Anonymous"}${it.prompt ? `: ${String(it.prompt).slice(0, 60)}` : ""}`}
                onClick={() => { resetAuto(); if (center) onOpen(it, i); else setIdx(i); }}
                title={center ? "Open" : undefined}
                style={{ position: "absolute", inset: 0, zIndex: 2, cursor: "pointer", padding: 0, border: 0, borderRadius: 6, background: "transparent" }}
              />
            </div>
          );
        })}
      </div>

      {/* player bar — the reference's bottom control strip, with REAL data */}
      {cur && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, maxWidth: 560, margin: "18px auto 0",
          background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 999,
          padding: "8px 10px 8px 16px", boxShadow: "var(--ed-shadow-card)",
        }}>
          <button type="button" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous" style={{ background: "transparent", border: "none", cursor: idx === 0 ? "default" : "pointer", fontSize: 18, color: idx === 0 ? T.hair : T.ink, padding: "0 2px" }}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.terraSub, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cur.display_name || "Anonymous"} · {idx + 1}/{n}
            </div>
            <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cur.prompt || "untitled"}
            </div>
          </div>
          {onLike && (
            <button
              type="button"
              onClick={() => curId != null && onLike(curId, idx)}
              aria-label={cur.is_liked ? "Unlike this creation" : "Like this creation"}
              aria-pressed={!!cur.is_liked}
              style={{ background: "transparent", border: `1px solid ${T.hair}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontFamily: T.m, fontSize: 13, fontWeight: 700, color: cur.is_liked ? T.terra : T.muted2 }}
            >
              {cur.is_liked ? "♥" : "♡"} {cur.likes_count || 0}
            </button>
          )}
          <button type="button" onClick={() => onOpen(cur, idx)} style={{ background: T.ink, border: "none", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.creamOn }}>
            OPEN ▸
          </button>
          <button type="button" onClick={() => go(1)} disabled={idx >= n - 1} aria-label="Next" style={{ background: "transparent", border: "none", cursor: idx >= n - 1 ? "default" : "pointer", fontSize: 18, color: idx >= n - 1 ? T.hair : T.ink, padding: "0 2px" }}>›</button>
        </div>
      )}
    </div>
  );
}

/** LIBRARY view — the whole feed as a dense archive wall of small prints
 *  (the "Ad Library" reference): uniform tiles, airy field behind, click
 *  zooms into the existing detail modal. */
function LibraryWall({ items, onOpen }: { items: any[]; onOpen: (item: any, index: number) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
      {items.map((it, i) => {
        const url = it.photo_url || it.photo_path;
        const vid = it.video_url || it.video_path;
        return (
          <button
            key={it.generation_id || it.id}
            onClick={() => onOpen(it, i)}
            className="lib-tile mp-enter"
            aria-label={it.prompt || "creation"}
            style={{
              position: "relative", padding: 3, background: T.paper, borderRadius: 8,
              border: `1px solid ${T.hair}`, cursor: "zoom-in", overflow: "hidden",
              boxShadow: "var(--ed-shadow-card)", animationDelay: `${Math.min(i, 20) * 22}ms`,
            }}
          >
            <span style={{ display: "block", width: "100%", aspectRatio: "1 / 1", borderRadius: 5, overflow: "hidden", background: T.inset }}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : vid ? (
                <video src={vid} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : null}
            </span>
            {vid && (
              <span style={{ position: "absolute", right: 7, bottom: 7, width: 18, height: 18, borderRadius: "50%", background: "rgba(33,26,18,.62)", color: T.creamOn, fontSize: 13, lineHeight: "18px" }}>▸</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// (Legacy masonry wall — superseded by the ALBUM/LIBRARY views above; kept
// for reference while the new views bed in.)
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

// ── Sample showcase (genuine-zero empty state only) ──
// REAL static product assets from /public/gallery — art that ships with the
// product. We deliberately removed fabricated community posts, so this strip
// is the honest stand-in: every print is permanently stamped SAMPLE, carries
// no author / likes / comments, and is NOT clickable into a post detail. It
// exists purely to show what the wall becomes once real creations land.
const SAMPLE_SHOWCASE = [
  { src: "/gallery/cat_astro.jpg", label: "Astro cat" },
  { src: "/gallery/fox_witch.jpg", label: "Witch fox" },
  { src: "/gallery/rabbit_samurai.jpg", label: "Samurai rabbit" },
  { src: "/gallery/hamster_sushi.jpg", label: "Sushi hamster" },
  { src: "/gallery/owl_library.jpg", label: "Library owl" },
];

function SampleShowcase() {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: T.terra, marginBottom: 6,
      }}>
        Sample showcase
      </div>
      <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2, letterSpacing: "0.04em" }}>
        What creations look like — these are samples, not community posts.
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
        {SAMPLE_SHOWCASE.map((s, i) => (
          <figure key={s.src} style={{
            margin: 0, width: 148, background: T.paper, borderRadius: 10, padding: 7,
            boxShadow: "var(--ed-shadow-card)",
            transform: `rotate(${[-2.2, 1.6, -1.2, 2, -1.8][i % 5]}deg)`,
          }}>
            {/* print well — gold inset keyline, same language as the real cards */}
            <div style={{
              position: "relative", width: "100%", aspectRatio: "1 / 1",
              borderRadius: 6, overflow: "hidden", background: T.inset,
              boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)",
            }}>
              <img src={s.src} alt={`Sample creation: ${s.label}`} loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {/* SAMPLE stamp — same treatment as CardDeck's guest samples,
                  rotated so it reads as a stamp, permanent on the art */}
              <span style={{
                position: "absolute", left: 6, bottom: 8, fontFamily: T.m, fontSize: 13, fontWeight: 700,
                letterSpacing: "0.12em", color: T.ink70, background: "rgba(251,246,236,.9)",
                border: `1px solid ${T.hair}`, borderRadius: 5, padding: "1px 6px",
                transform: "rotate(-6deg)", transformOrigin: "left bottom",
              }}>SAMPLE</span>
            </div>
            <figcaption style={{
              fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: T.muted2, marginTop: 7,
            }}>
              {s.label}
            </figcaption>
          </figure>
        ))}
      </div>
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
  // ALBUM = 3D sleeve carousel (browse one at a time), LIBRARY = dense
  // archive wall (survey everything, click to zoom). Owner-picked pair.
  const [view, setView] = useState<"album" | "library">("album");
  // Pet Square (walkable community, f627ce06b) retired 2026-07-24 by founder
  // call — Community is the creations Feed again. PetSquare.tsx removed.

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

  // Monotonic token so a slow response for an old `sort` can't overwrite the
  // grid after the user has switched sort and a newer load already landed.
  const feedReqRef = useRef(0);
  const [feedFailed, setFeedFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 40;
  const hasMedia = (i: any) => i.photo_url || i.photo_path || i.video_url || i.video_path;

  const loadFeed = async () => {
    const reqId = ++feedReqRef.current;
    setLoading(true);
    setFeedFailed(false);
    let realItems: any[] = [];
    let ok = false;
    let more = false;
    try {
      const data = await api.social.feed({ sort, page: 1, page_size: PAGE_SIZE });
      const raw = data.items || [];
      realItems = raw.filter(hasMedia);
      more = raw.length >= PAGE_SIZE; // a full page back ⇒ likely more to fetch
      ok = true;
    } catch {}
    if (realItems.length === 0) {
      try {
        const data = await api.gallery.list({ sort: sort === "most_liked" ? "recent" : sort, page: 1, page_size: PAGE_SIZE });
        realItems = (data.items || []).map((i: any) => ({ ...i, generation_id: i.id, likes_count: 0, comments_count: 0, is_liked: false }));
        ok = true;
        more = false; // the gallery fallback path isn't wired for load-more
      } catch {}
    }
    if (reqId !== feedReqRef.current) return; // a newer sort/load superseded this one
    // Show only real creations. Sparse feeds fall through to the real
    // "No Creations Yet" empty-state below — never pad with fabricated
    // usernames/like-counts, which misrepresented activity to every user.
    setItems(realItems);
    setPage(1);
    setHasMore(more);
    setFeedFailed(!ok); // distinguish a real outage from a genuinely empty feed
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const reqId = feedReqRef.current; // tie to the current feed generation
    const next = page + 1;
    setLoadingMore(true);
    try {
      const data = await api.social.feed({ sort, page: next, page_size: PAGE_SIZE });
      if (reqId !== feedReqRef.current) return; // sort changed mid-load — drop these
      const raw = data.items || [];
      const newItems = raw.filter(hasMedia);
      setItems(prev => {
        const seen = new Set(prev.map((i: any) => i.generation_id || i.id));
        return [...prev, ...newItems.filter((i: any) => !seen.has(i.generation_id || i.id))];
      });
      setPage(next);
      setHasMore(raw.length >= PAGE_SIZE);
    } catch {} finally {
      if (reqId === feedReqRef.current) setLoadingMore(false);
    }
  };

  // Latest items, readable from the []-dep callback below.
  const itemsRef = useRef<any[]>([]);
  itemsRef.current = items;

  // Per-id in-flight set: a rapid second click while one like POST is pending
  // would fire a second toggle and settle the UI on the server's intermediate
  // (wrong) state — ignore re-clicks until the first resolves.
  const likeInFlight = useRef<Set<number>>(new Set());

  // A failed like used to silently revert the heart — no signal the click did
  // nothing. Surface a brief, wallet-aware toast instead; it auto-dismisses.
  const [likeNotice, setLikeNotice] = useState("");
  const likeNoticeTimer = useRef<any>(null);
  const flashLikeNotice = useCallback((msg: string) => {
    setLikeNotice(msg);
    if (likeNoticeTimer.current) clearTimeout(likeNoticeTimer.current);
    likeNoticeTimer.current = setTimeout(() => setLikeNotice(""), 2600);
  }, []);
  useEffect(() => () => { if (likeNoticeTimer.current) clearTimeout(likeNoticeTimer.current); }, []);

  const handleLike = useCallback(async (generationId: number, _index: number) => {
    if (likeInFlight.current.has(generationId)) return;
    // Optimistic toggle, then reconcile with the server's truth. (The API
    // returns { liked, likes_count } — there is no `action` field, so the old
    // `result.action === "liked"` was always false and silently reverted likes.)
    const flip = (item: any) => {
      const liked = !item.is_liked;
      return { ...item, is_liked: liked, likes_count: liked ? (item.likes_count||0)+1 : Math.max(0,(item.likes_count||0)-1) };
    };
    // Match by id, not list index — the grid renders the FILTERED list, so an
    // index would update the wrong row while searching/filtering.
    const matches = (it: any) => it && (it.generation_id || it.id) === generationId;
    // Demo/mock padding carries real-looking DB ids; never call the like API for
    // it — that would toggle a like on an unrelated real generation. Local only.
    const isMock = itemsRef.current.find(matches)?.__mock;

    setItems(prev => prev.map(item => (matches(item) ? flip(item) : item)));
    setSelectedItem((prev: any) => (matches(prev) ? flip(prev) : prev));
    if (isMock) return;

    likeInFlight.current.add(generationId);
    try {
      const result: any = await api.social.like(generationId);
      const apply = (item: any) => ({
        ...item,
        is_liked: !!result.liked,
        likes_count: typeof result.likes_count === "number" ? result.likes_count : item.likes_count,
      });
      setItems(prev => prev.map(item => (matches(item) ? apply(item) : item)));
      setSelectedItem((prev: any) => (matches(prev) ? apply(prev) : prev));
    } catch (e: any) {
      // revert the optimistic flip
      setItems(prev => prev.map(item => (matches(item) ? flip(item) : item)));
      setSelectedItem((prev: any) => (matches(prev) ? flip(prev) : prev));
      flashLikeNotice(e?.status === 401
        ? "Connect your wallet to like"
        : "Couldn't save your like — try again");
    } finally {
      likeInFlight.current.delete(generationId);
    }
  }, [flashLikeNotice]);

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
  ];

  // A genuinely empty feed (zero real works, not a search miss or outage) should
  // lead with the "Create the first one" CTA — not a full filter toolbar over
  // nothing. Hide the layout/type/search/sort chrome in that state.
  const zeroWorks = !loading && !feedFailed && items.length === 0;
  const showChrome = !zeroWorks;

  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink, paddingTop: 88 }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, padding: "0 16px 60px", maxWidth: 1440, margin: "0 auto" }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        .gallery-search { transition: all 0.2s }
        .gallery-search::placeholder { color: #9A7B4E }
        .gallery-search:focus { border-color: rgba(184,130,44,.55) !important; background: #FBF6EC !important }
        .sort-tab:hover { color: #211A12 !important }
        .lib-tile { transition: transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s ease; }
        @media (hover: hover) { .lib-tile:hover { transform: scale(1.06); box-shadow: var(--ed-shadow-float); z-index: 3; } }
        .lib-tile:active { transform: scale(1.0); }
        @keyframes likeToastIn { from { opacity:0; transform:translate(-50%, 10px) } to { opacity:1; transform:translate(-50%, 0) } }
      `}</style>

      {/* Like-failure toast — a failed like isn't a silent no-op anymore. */}
      {likeNotice && (
        <div role="alert" style={{
          position: "fixed", bottom: 24, left: "50%", zIndex: 300,
          transform: "translateX(-50%)", animation: "likeToastIn 0.2s ease-out",
          background: T.ink, color: T.creamOn,
          fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
          padding: "10px 18px", borderRadius: 999,
          boxShadow: "var(--ed-shadow-float)", border: `1px solid ${T.hair}`,
          maxWidth: "90vw", textAlign: "center",
        }}>
          {likeNotice}
        </div>
      )}

      {/* Real community stats + featured pets live in <CommunityHighlights>,
          mounted just above this gallery — we don't repeat them here with mock
          data (the old fake stats/creators/trending blocks were removed). */}

      {/* Header — Collectible Editorial masthead */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase", color: T.terra, marginBottom: 8,
        }}>
          Community
        </div>
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 14, flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h2 style={{
              fontFamily: T.disp, fontSize: 46, fontWeight: 800,
              color: T.ink, margin: 0, letterSpacing: "-0.035em", lineHeight: 0.95,
            }}>
              The remix wall
            </h2>
            {showChrome && (
              <span style={{
                fontFamily: T.m, fontSize: 13, color: T.muted, fontWeight: 700, letterSpacing: "0.08em",
              }}>
                {filteredItems.length} works
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* View toggle — Album carousel vs Library wall */}
            {showChrome && <div role="group" aria-label="Feed layout" style={{ display: "flex", gap: 4, marginRight: 4 }}>
              {([["album", "Album"], ["library", "Library"]] as const).map(([key, label]) => {
                const on = view === key;
                return (
                  <button type="button" key={key} aria-pressed={on} onClick={() => setView(key)} style={{
                    background: on ? T.ink : T.paper,
                    border: `1px solid ${on ? T.ink : T.hair}`,
                    borderRadius: 999, padding: "6px 15px",
                    fontFamily: T.m, fontSize: 13, cursor: "pointer",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    color: on ? T.creamOn : T.muted,
                    transition: "all 0.2s", fontWeight: 700,
                    boxShadow: on ? "var(--ed-shadow-card)" : "none",
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>}

            {/* Type filters — inline with search (feed only) */}
            {showChrome && <div role="group" aria-label="Creation type" style={{ display: "flex", gap: 4 }}>
              {[
                { key: "all", label: "All", color: T.terra },
                { key: "image", label: "Images", color: T.rareRare },
                { key: "video", label: "Videos", color: T.rareEpic },
              ].map(f => {
                const on = typeFilter === f.key;
                return (
                  <button type="button" key={f.key} aria-pressed={on} onClick={() => setTypeFilter(f.key)} style={{
                    background: on ? f.color : T.paper,
                    border: `1px solid ${on ? f.color : T.hair}`,
                    borderRadius: 6, padding: "5px 13px",
                    fontFamily: T.m, fontSize: 13, cursor: "pointer",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: on ? T.creamOn : T.muted,
                    transition: "all 0.2s", fontWeight: 700,
                    boxShadow: on ? "var(--ed-shadow-card)" : "none",
                  }}>
                    {f.label}
                  </button>
                );
              })}
            </div>}

            {/* Search (feed only) */}
            {showChrome && <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 13, color: T.mono, pointerEvents: "none",
                display: "inline-flex",
              }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx={10.5} cy={10.5} r={6.5} />
                  <path d="M20 20l-4.2-4.2" />
                </svg>
              </span>
              <input
                className="gallery-search"
                aria-label="Search creations"
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  width: 180, padding: "7px 12px 7px 28px", borderRadius: 8,
                  background: T.inset, border: `1px solid ${T.hair}`,
                  color: T.ink, fontFamily: T.body, fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>}

            {/* Create yours — primary CTA lives in the masthead (was a floating
                fixed FAB bottom-right, which read as detached from the page). */}
            <button
              onClick={() => { window.location.href = "/?section=create"; }}
              className="ed-card-hover"
              aria-label="Create your own"
              title="A finished make earns +10 pts (image) / +20 (motion)"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer",
                background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: T.ink,
                fontFamily: T.body, fontSize: 13, fontWeight: 700,
                boxShadow: "0 10px 22px -12px rgba(226,125,12,.6)",
              }}
            ><Icon name="sparkling" size={14} /> Create yours</button>
          </div>
        </div>

        {/* Sort tabs — ink underline on active (feed only) */}
        {showChrome && <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.hair}` }}>
          {TABS.map(t => (
            <button type="button" className="sort-tab" key={t.key} aria-pressed={sort === t.key} onClick={() => setSort(t.key)} style={{
              background: "transparent", border: "none", padding: "8px 16px",
              fontFamily: T.m, fontSize: 13, cursor: "pointer",
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: sort === t.key ? T.ink : T.muted,
              fontWeight: 700,
              borderBottom: sort === t.key ? `2px solid ${T.ink}` : "2px solid transparent",
              marginBottom: -1,
              transition: "all 0.2s", borderRadius: 0,
            }}>
              {t.label}
            </button>
          ))}
        </div>}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: columnCount }, (_, ci) => (
            <div key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {Array.from({ length: 4 }, (_, ri) => (
                <div key={ri} style={{
                  height: 220 + ((ci * 3 + ri) % 5) * 50, borderRadius: 10,
                  background: "linear-gradient(90deg, #F5EFE2 25%, #FBF6EC 50%, #F5EFE2 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite",
                  animationDelay: `${(ci + ri) * 0.12}s`,
                  boxShadow: "var(--ed-shadow-card)",
                }} />
              ))}
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: zeroWorks && !search ? "48px 20px 100px" : "100px 40px" }}>
          {/* Genuine zero (not a search miss, not an outage): show what the
              wall becomes — real product assets, SAMPLE-stamped, no fake posts. */}
          {zeroWorks && !search && <SampleShowcase />}
          {search ? (
            <div style={{ marginBottom: 14, opacity: 0.35, display: "flex", justifyContent: "center" }}>
              <svg width={44} height={44} viewBox="0 0 24 24" fill="none"
                stroke={T.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx={10.5} cy={10.5} r={6.5} />
                <path d="M20 20l-4.5-4.5" />
              </svg>
            </div>
          ) : feedFailed ? (
            <div style={{ marginBottom: 14, opacity: 0.4, display: "flex", justifyContent: "center" }}>
              <svg width={44} height={44} viewBox="0 0 24 24" fill="none"
                stroke={T.terra} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.5 1.8 20.5h20.4L12 3.5Z" />
                <path d="M12 9.5v5" />
                <path d="M12 17.6h.01" />
              </svg>
            </div>
          ) : (
            <div style={{ display: "inline-flex", padding: 7, background: T.paper, borderRadius: 16, marginBottom: 14, boxShadow: "var(--ed-shadow-card)" }}>
              <img src="/mascot.jpg" alt="" style={{
                width: 72, height: 72, borderRadius: 11, objectFit: "cover",
                boxShadow: "inset 0 0 0 2px rgba(184,130,44,.55)",
              }} />
            </div>
          )}
          <h3 style={{
            fontFamily: T.disp, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em",
            color: T.ink, marginBottom: 6,
          }}>
            {search ? "No results found" : feedFailed ? "Couldn't load the feed" : "No creations yet"}
          </h3>
          <p style={{ fontFamily: T.m, fontSize: 13, color: T.muted2, letterSpacing: "0.06em" }}>
            {search ? "Try different keywords" : feedFailed ? "Check your connection and try again" : "Be the first to create something"}
          </p>
          {/* REAL first-creation grant (/api/studio/generate → studio_gen: image +10 / video +20) */}
          {!search && !feedFailed && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {["+10 pts · image", "+20 pts · motion"].map(c => (
                <span key={c} style={{
                  fontFamily: T.m, fontSize: 13, fontWeight: 800, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: T.terraSub, background: "rgba(190,79,40,.09)",
                  border: "1px solid rgba(190,79,40,.32)", borderRadius: 999, padding: "5px 12px",
                }}>{c}</span>
              ))}
            </div>
          )}
          {/* No dates/countdowns while Season 1 is unscheduled — carry-in note only. */}
          {!search && !feedFailed && !SEASON_SCHEDULED && (
            <div style={{ marginTop: 10, fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2, letterSpacing: "0.04em" }}>
              Season 1 starts soon — points you earn now carry in.
            </div>
          )}
          {feedFailed && !search && (
            <button onClick={() => loadFeed()} className="ed-wipe" style={{
              marginTop: 16, padding: "9px 22px", borderRadius: 8,
              border: `1px solid ${T.hair}`, background: T.paper, cursor: "pointer",
              fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.ink, boxShadow: "var(--ed-shadow-card)",
            }}>Retry</button>
          )}
          {!search && !feedFailed && (
            <button onClick={() => { window.location.href = "/?section=create"; }} style={{
              marginTop: 16, padding: "11px 26px", borderRadius: 10, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg,${T.cta1},${T.cta2})`, color: T.ink,
              fontFamily: T.body, fontSize: 14, fontWeight: 700, boxShadow: "var(--ed-shadow-card)",
            }}><Icon name="sparkling" size={15} style={{ marginRight: 4 }} /> Create the first one</button>
          )}
        </div>
      ) : view === "album" ? (
        /* One pop Reveal around the whole carousel block — sleeves inside keep
           their own 3D transforms untouched. */
        <Reveal dir="pop">
          <AlbumCarousel
            items={filteredItems}
            onLike={handleLike}
            onOpen={(item: any, index: number) => { setSelectedItem(item); setSelectedIndex(index); }}
          />
        </Reveal>
      ) : (
        /* One Reveal around the whole wall; tiles keep their existing
           mp-enter mount stagger so above-the-fold tiles aren't scroll-gated. */
        <Reveal dir="up">
          <LibraryWall
            items={filteredItems}
            onOpen={(item: any, index: number) => { setSelectedItem(item); setSelectedIndex(index); }}
          />
        </Reveal>
      )}

      {!loading && hasMore && (filteredItems.length > 0 || search) && (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0 48px" }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="ed-wipe"
            style={{
              padding: "11px 32px", borderRadius: 8,
              border: `1px solid ${T.hair}`, background: T.paper,
              cursor: loadingMore ? "wait" : "pointer",
              fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: T.ink, boxShadow: "var(--ed-shadow-card)",
              opacity: loadingMore ? 0.6 : 1,
            }}
          >{loadingMore ? "Loading…" : "Load more"}</button>
        </div>
      )}

      {selectedItem && (
        <DetailModal
          item={selectedItem} index={selectedIndex}
          onClose={() => setSelectedItem(null)}
          onLike={handleLike}
          onCommentAdded={() => {
            const gid = selectedItem.generation_id || selectedItem.id;
            setSelectedItem((prev: any) => prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev);
            setItems(prev => prev.map(it => ((it.generation_id || it.id) === gid ? { ...it, comments_count: (it.comments_count || 0) + 1 } : it)));
          }}
        />
      )}

      </div>
    </div>
  );
}
