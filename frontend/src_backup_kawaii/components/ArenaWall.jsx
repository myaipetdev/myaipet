import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { MOCK_SOCIAL_FEED, MOCK_ACTIVITIES } from "../mockData";

const PET_IMAGES = [
  "/gallery/pet_cat.jpg", "/gallery/pet_dog.jpg", "/gallery/pet_parrot.jpg",
  "/gallery/pet_turtle.jpg", "/gallery/pet_hamster.jpg", "/gallery/pet_rabbit.jpg",
  "/gallery/pet_fox.jpg", "/gallery/pet_pom.jpg",
];
const PET_NAMES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

// Convert raw activities into post-like objects
function activityToPost(act, idx) {
  // Determine event type from icon/text
  let eventType = "activity";
  if (act.text?.includes("Adopted") || act.text?.includes("hatched")) eventType = "welcome";
  else if (act.text?.includes("Generated") || act.text?.includes("generated")) eventType = "creation";
  else if (act.text?.includes("leveled up") || act.text?.includes("Liked") || act.text?.includes("Burned")) eventType = "milestone";

  return {
    id: `act-${idx}`,
    eventType,
    icon: act.icon,
    username: act.wallet?.slice(0, 8) + "..." || "Anon",
    text: act.text,
    time: act.time || "just now",
    pet_type: idx % 8,
    likes: Math.floor(Math.random() * 200) + 5,
    comments: Math.floor(Math.random() * 30),
    isLiked: false,
    photo_url: act.photo_url || null,
    chain: act.chain || "Base",
  };
}

function timeAgo(dateStr) {
  if (!dateStr) return "just now";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Post Card ──
function PostCard({ post, onLike }) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [showHearts, setShowHearts] = useState(false);

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : c - 1));
    if (next) {
      setShowHearts(true);
      setTimeout(() => setShowHearts(false), 800);
    }
    onLike?.(post.id, next);
  };

  const eventConfig = {
    welcome: { badge: "🎉 NEW PET", badgeColor: "bg-sun/20 text-sun-dark" },
    creation: { badge: "✨ CREATION", badgeColor: "bg-sky/20 text-sky-dark" },
    milestone: { badge: "🔥 MILESTONE", badgeColor: "bg-pink/15 text-pink" },
    activity: { badge: "📝 ACTIVITY", badgeColor: "bg-lavender/20 text-lavender" },
  };
  const cfg = eventConfig[post.eventType] || eventConfig.activity;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-5 mb-3 relative animate-slide-up">
      {/* Floating hearts */}
      {showHearts && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className="absolute text-pink text-lg"
              style={{
                animation: `float 0.8s ease-out forwards`,
                animationDelay: `${i * 0.1}s`,
                left: `${30 + Math.random() * 40}%`,
                bottom: "40%",
                opacity: 0,
              }}
            >
              💖
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full overflow-hidden sticker-border shrink-0">
          <img
            src={PET_IMAGES[post.pet_type] || PET_IMAGES[0]}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-body text-sm font-bold text-[#422D26] truncate">
              {post.username}
            </span>
            <span className={`font-body text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeColor}`}>
              {cfg.badge}
            </span>
          </div>
          <span className="font-body text-xs text-pink/55">{post.time}</span>
        </div>
        <span className="shrink-0 font-body text-xs font-semibold text-pink/60 bg-pink/5 px-2 py-1 rounded-full">
          {post.chain}
        </span>
      </div>

      {/* Body */}
      <p className="font-body text-sm text-[#422D26]/80 leading-relaxed mb-3">
        {post.icon} {post.text}
      </p>

      {/* Thumbnail (for creation events) */}
      {post.eventType === "creation" && post.photo_url && (
        <div className="rounded-2xl overflow-hidden mb-3 sticker-border">
          <img
            src={post.photo_url}
            alt=""
            className="w-full h-40 object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-1 pt-2" style={{ borderTop: "1px solid rgba(255,134,183,0.08)" }}>
        <button
          onClick={handleLike}
          className={`squishy flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-xs font-bold transition-all
            ${liked
              ? "bg-pink/12 text-pink"
              : "text-[#422D26]/35 hover:bg-pink/5 hover:text-pink/60"
            }`}
        >
          <span className={`text-base transition-transform duration-200 ${liked ? "scale-125" : ""}`}>
            {liked ? "💖" : "🤍"}
          </span>
          {likeCount > 0 && (
            <span>{likeCount > 999 ? `${(likeCount / 1000).toFixed(1)}k` : likeCount}</span>
          )}
        </button>

        <button className="squishy flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-xs font-bold text-[#422D26]/35 hover:bg-sky/8 hover:text-sky-dark transition-all">
          <span className="text-base">💬</span>
          {post.comments > 0 && <span>{post.comments}</span>}
        </button>

        <button className="squishy flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-xs font-bold text-[#422D26]/35 hover:bg-sun/10 hover:text-sun-dark transition-all">
          <span className="text-base">↗️</span>
        </button>

        <div className="flex-1" />

        <span className="shrink-0 font-body text-xs text-pink/55">
          {PET_NAMES[post.pet_type] || "Pet"}
        </span>
      </div>
    </div>
  );
}

// ── Main Feed ──
export default function ArenaWall() {
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("recent");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
  }, [tab]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      // Try social feed first
      const data = await api.social.feed({ sort: tab === "trending" ? "most_liked" : "recent", page: 1, page_size: 30 });
      const mapped = (data.items || []).map((item, i) => ({
        id: item.generation_id || i,
        eventType: item.gen_type === "video" ? "creation" : (i % 4 === 0 ? "milestone" : "creation"),
        icon: item.gen_type === "video" ? "🎬" : "✨",
        username: item.display_name || item.wallet_address?.slice(0, 10) || "Anon",
        text: item.prompt?.slice(0, 120) || `Generated a ${item.style_name || "cinematic"} ${item.gen_type}`,
        time: timeAgo(item.created_at),
        pet_type: item.pet_type,
        likes: item.likes_count || 0,
        comments: item.comments_count || 0,
        isLiked: item.is_liked || false,
        photo_url: item.photo_url,
        chain: item.chain || "Base",
      }));
      setPosts(mapped);
    } catch {
      // Fallback: merge activities + social mock
      const actPosts = MOCK_ACTIVITIES.map(activityToPost);
      const socialPosts = MOCK_SOCIAL_FEED.items.slice(0, 10).map((item, i) => ({
        id: `social-${i}`,
        eventType: i % 5 === 0 ? "welcome" : i % 3 === 0 ? "milestone" : "creation",
        icon: i % 5 === 0 ? "🎉" : i % 3 === 0 ? "🔥" : "✨",
        username: item.display_name,
        text: i % 5 === 0
          ? `${item.display_name} just hatched a new ${PET_NAMES[item.pet_type]}!`
          : i % 3 === 0
          ? `${PET_NAMES[item.pet_type]} reached ${item.likes_count} Community Likes!`
          : item.prompt?.slice(0, 100),
        time: timeAgo(item.created_at),
        pet_type: item.pet_type,
        likes: item.likes_count,
        comments: item.comments_count,
        isLiked: item.is_liked,
        photo_url: i % 3 === 0 ? null : item.photo_url,
        chain: "Base",
      }));
      const merged = [...socialPosts, ...actPosts].sort(() => Math.random() - 0.5);
      setPosts(tab === "trending" ? merged.sort((a, b) => b.likes - a.likes) : merged);
    }
    setLoading(false);
  };

  const handleLike = useCallback(async (postId, isLiked) => {
    try {
      await api.social.like(postId);
    } catch { /* ok for demo */ }
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-28 pb-24">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-heading text-3xl text-[#422D26] mb-1">Arena Wall</h1>
        <p className="font-body text-sm text-pink/60">What's happening in the community</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/50 rounded-full p-1 sticker-border">
        {[
          { key: "recent", label: "Recent Activity" },
          { key: "trending", label: "Trending" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`squishy flex-1 py-2.5 rounded-full font-body text-sm font-bold transition-all
              ${tab === t.key
                ? "bg-pink text-white shadow-md"
                : "text-pink/55 hover:text-pink/60"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-3xl bg-white/50"
              style={{
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-30">🏟️</div>
          <p className="font-body text-sm text-pink/65">No activity yet. Be the first!</p>
        </div>
      ) : (
        <div>
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleLike}
            />
          ))}
        </div>
      )}
    </div>
  );
}
