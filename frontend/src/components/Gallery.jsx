import { useState, useEffect } from "react";
import { api } from "../api";

const PET_NAMES = ["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"];
const PET_EMOJIS = { Cat: "🐱", Dog: "🐕", Parrot: "🦜", Turtle: "🐢", Hamster: "🐹", Rabbit: "🐰", Fox: "🦊", Pomeranian: "🐶" };

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(0); // 0=All, 1=Trending (not impl yet), 2=Recent
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.gallery.list({
      page,
      page_size: 12,
      sort: filter === 2 ? "oldest" : "recent",
    }).then((res) => {
      if (!cancelled) {
        setItems(res.items);
        setTotal(res.total);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [page, filter]);

  return (
    <div style={{ padding: "40px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700,
            color: "white", marginBottom: 6,
          }}>
            Community Creations
          </h2>
          <p style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Every video verified on-chain · {total} total
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["All", "Trending", "Recent"].map((f, i) => (
            <button
              key={f}
              onClick={() => { setFilter(i); setPage(1); }}
              style={{
                background: filter === i ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.02)",
                border: filter === i ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(255,255,255,0.05)",
                borderRadius: 7, padding: "5px 14px", fontFamily: "mono", fontSize: 11,
                color: filter === i ? "#fde68a" : "rgba(255,255,255,0.35)", cursor: "pointer",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{
          textAlign: "center", padding: 60,
          fontFamily: "mono", fontSize: 13, color: "rgba(255,255,255,0.25)",
        }}>
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60,
          fontFamily: "mono", fontSize: 13, color: "rgba(255,255,255,0.25)",
        }}>
          No creations yet. Be the first to generate!
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {items.map((item) => {
              const petName = PET_NAMES[item.pet_type] || "Pet";
              return (
                <div key={item.id} style={{
                  borderRadius: 14, overflow: "hidden",
                  background: "rgba(255,255,255,0.015)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer", transition: "transform 0.3s, border-color 0.3s",
                }}>
                  <div style={{ aspectRatio: "1", position: "relative", overflow: "hidden" }}>
                    {item.video_url ? (
                      <video
                        src={item.video_url}
                        muted
                        loop
                        playsInline
                        onMouseOver={(e) => e.currentTarget.play()}
                        onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        poster={item.photo_url}
                      />
                    ) : (
                      <img
                        src={item.photo_url}
                        alt={petName}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s" }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      />
                    )}
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      display: "flex", alignItems: "center", gap: 3,
                      padding: "3px 8px", borderRadius: 16,
                      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
                    }}>
                      <span style={{ fontSize: 9, color: "#4ade80" }}>▶</span>
                      <span style={{ fontFamily: "mono", fontSize: 9, color: "white" }}>{item.duration}s</span>
                    </div>
                    <div style={{
                      position: "absolute", bottom: 8, left: 8, fontSize: 8,
                      padding: "2px 6px", borderRadius: 3,
                      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
                      color: "rgba(255,255,255,0.6)", fontFamily: "mono",
                    }}>
                      {item.chain || "Base"}
                    </div>
                    <div style={{
                      position: "absolute", bottom: 8, right: 8, fontSize: 9,
                      padding: "2px 8px", borderRadius: 3,
                      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
                      color: "rgba(255,255,255,0.5)", fontFamily: "mono",
                    }}>
                      {petName}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "mono", fontSize: 10, color: "#fbbf24" }}>
                        {item.wallet_address}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 12 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 7, padding: "6px 16px", fontFamily: "mono", fontSize: 11,
                  color: page <= 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                ← Prev
              </button>
              <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "6px 10px" }}>
                {page} / {Math.ceil(total / 12)}
              </span>
              <button
                disabled={page >= Math.ceil(total / 12)}
                onClick={() => setPage(page + 1)}
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 7, padding: "6px 16px", fontFamily: "mono", fontSize: 11,
                  color: page >= Math.ceil(total / 12) ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
                  cursor: page >= Math.ceil(total / 12) ? "not-allowed" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
