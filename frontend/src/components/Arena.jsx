import { useState, useEffect, useRef, useCallback } from "react";
import { MOCK_PETS } from "../mockData";

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_IMAGES = [
  "/gallery/pet_cat.jpg",
  "/gallery/pet_dog.jpg",
  "/gallery/pet_parrot.jpg",
  "/gallery/pet_turtle.jpg",
  "/gallery/pet_hamster.jpg",
  "/gallery/pet_rabbit.jpg",
  "/gallery/pet_fox.jpg",
  "/gallery/pet_pom.jpg",
];

// ── Mock price data ──
const BASE_PRICE = 635.42;
function generatePriceHistory(count, base) {
  const prices = [];
  let p = base;
  for (let i = 0; i < count; i++) {
    p += (Math.random() - 0.48) * 2.5;
    p = Math.max(base * 0.95, Math.min(base * 1.05, p));
    prices.push({ time: Date.now() - (count - i) * 3000, price: +p.toFixed(2) });
  }
  return prices;
}

// ── Pet Behaviors mapped to signals ──
const PET_BEHAVIORS = {
  0: [ // Cat
    { action: "climbed to a high shelf", signal: "bullish", emoji: "🧗", text: "reaching for higher ground..." },
    { action: "curled up and sleeping", signal: "neutral", emoji: "😴", text: "holding position, waiting..." },
    { action: "knocked something off the table", signal: "bearish", emoji: "💥", text: "disrupting the trend..." },
    { action: "is cautiously watching", signal: "neutral", emoji: "👀", text: "analyzing the market..." },
    { action: "found a sunny spot", signal: "bullish", emoji: "☀️", text: "found a golden opportunity..." },
    { action: "is hiding under the bed", signal: "bearish", emoji: "🫣", text: "sensing danger, retreating..." },
  ],
  1: [ // Dog
    { action: "is chasing its tail excitedly", signal: "bullish", emoji: "🔄", text: "high energy, momentum building!" },
    { action: "is digging a hole to bury a bone", signal: "bearish", emoji: "🦴", text: "storing value, going defensive..." },
    { action: "is fetching at full speed", signal: "bullish", emoji: "🏃", text: "sprinting toward the target!" },
    { action: "heard a suspicious noise", signal: "bearish", emoji: "👂", text: "alert! potential reversal..." },
    { action: "is wagging tail at the door", signal: "bullish", emoji: "🐕", text: "anticipating something good!" },
    { action: "is resting by the fireplace", signal: "neutral", emoji: "🔥", text: "consolidating energy..." },
  ],
};

// Fill other species with generic behaviors
for (let i = 2; i < 8; i++) {
  PET_BEHAVIORS[i] = [
    { action: "is exploring energetically", signal: "bullish", emoji: "🔍", text: "discovering opportunities..." },
    { action: "is eating happily", signal: "bullish", emoji: "🍽", text: "consuming the dip..." },
    { action: "looks nervous", signal: "bearish", emoji: "😰", text: "uncertainty detected..." },
    { action: "is resting peacefully", signal: "neutral", emoji: "💤", text: "market cooling off..." },
    { action: "is playing actively", signal: "bullish", emoji: "🎮", text: "high activity zone!" },
    { action: "retreated to its nest", signal: "bearish", emoji: "🏠", text: "seeking safety..." },
  ];
}

const MOCK_LEADERBOARD = [
  { rank: 1, name: "CryptoKitty", pet: "🐱 Luna", species: 0, winRate: 78, pnl: "+$2,847", streak: 12, badge: "🏆" },
  { rank: 2, name: "DogeMaster", pet: "🐕 Rex", species: 1, winRate: 72, pnl: "+$1,923", streak: 8, badge: "🥈" },
  { rank: 3, name: "PetWhale", pet: "🦊 Pixel", species: 6, winRate: 69, pnl: "+$1,456", streak: 5, badge: "🥉" },
  { rank: 4, name: "Web3Degen", pet: "🐹 Biscuit", species: 4, winRate: 65, pnl: "+$987", streak: 4, badge: "" },
  { rank: 5, name: "AIPetFan", pet: "🐰 Mochi", species: 5, winRate: 63, pnl: "+$754", streak: 3, badge: "" },
  { rank: 6, name: "BlockchainBro", pet: "🐢 Shell", species: 3, winRate: 61, pnl: "+$632", streak: 2, badge: "" },
  { rank: 7, name: "NFTWhale", pet: "🦜 Kiwi", species: 2, winRate: 58, pnl: "+$421", streak: 1, badge: "" },
  { rank: 8, name: "DeFiDog", pet: "🐶 Pom", species: 7, winRate: 55, pnl: "+$312", streak: 0, badge: "" },
];

// ── Mini Chart ──
function MiniChart({ prices, width = 400, height = 140 }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices.map(p => p.price));
  const max = Math.max(...prices.map(p => p.price));
  const range = max - min || 1;
  const pad = 4;

  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (width - pad * 2);
    const y = height - pad - ((p.price - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  const lastPrice = prices[prices.length - 1].price;
  const firstPrice = prices[0].price;
  const isUp = lastPrice >= firstPrice;
  const color = isUp ? "#4ade80" : "#f87171";
  const gradId = `chart-grad-${isUp ? 'up' : 'down'}`;

  const areaPoints = `${pad},${height} ${points} ${width - pad},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last price dot */}
      {(() => {
        const lx = pad + ((prices.length - 1) / (prices.length - 1)) * (width - pad * 2);
        const ly = height - pad - ((lastPrice - min) / range) * (height - pad * 2);
        return (
          <>
            <circle cx={lx} cy={ly} r="4" fill={color} />
            <circle cx={lx} cy={ly} r="8" fill={color} opacity="0.2">
              <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
          </>
        );
      })()}
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={pad} y1={height * f} x2={width - pad} y2={height * f}
          stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
      ))}
    </svg>
  );
}

// ── Bet Result Overlay ──
function BetResult({ result, onClose }) {
  if (!result) return null;
  const won = result.won;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      background: won ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
      backdropFilter: "blur(8px)", borderRadius: 16,
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeUp 0.3s ease-out",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{won ? "🎉" : "😔"}</div>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: won ? "#4ade80" : "#f87171", marginBottom: 4,
        }}>
          {won ? "You Won!" : "Better Luck Next Time"}
        </div>
        <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 4 }}>
          BNB/USDT went {result.direction === "up" ? "↑ UP" : "↓ DOWN"}
        </div>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700,
          color: won ? "#4ade80" : "#f87171", marginBottom: 16,
        }}>
          {won ? `+${result.payout} $PET` : `-${result.amount} $PET`}
        </div>
        <button onClick={onClose} style={{
          background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 10, padding: "10px 28px", cursor: "pointer",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "#1a1a2e", fontWeight: 500,
        }}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ── Main Arena ──
export default function Arena() {
  const [pet] = useState(MOCK_PETS[0]);
  const [prices, setPrices] = useState(() => generatePriceHistory(40, BASE_PRICE));
  const [currentBehavior, setCurrentBehavior] = useState(null);
  const [behaviorHistory, setBehaviorHistory] = useState([]);
  const [betAmount, setBetAmount] = useState(10);
  const [betDirection, setBetDirection] = useState(null); // "up" | "down"
  const [betActive, setBetActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [betResult, setBetResult] = useState(null);
  const [balance, setBalance] = useState(500);
  const [stats, setStats] = useState({ wins: 3, losses: 1, total: 4 });
  const [leaderboardTab, setLeaderboardTab] = useState("daily");
  const chartRef = useRef(null);

  // Update price every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => {
        const last = prev[prev.length - 1].price;
        const next = +(last + (Math.random() - 0.48) * 2.5).toFixed(2);
        return [...prev.slice(-59), { time: Date.now(), price: Math.max(600, Math.min(670, next)) }];
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Pet behavior every 8s
  useEffect(() => {
    const behaviors = PET_BEHAVIORS[pet.species] || PET_BEHAVIORS[0];
    const pick = () => {
      const b = behaviors[Math.floor(Math.random() * behaviors.length)];
      setCurrentBehavior(b);
      setBehaviorHistory(prev => [{ ...b, time: Date.now() }, ...prev].slice(0, 6));
    };
    pick();
    const interval = setInterval(pick, 8000);
    return () => clearInterval(interval);
  }, [pet.species]);

  // Countdown for active bet
  useEffect(() => {
    if (!betActive || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          resolveBet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [betActive, countdown]);

  const placeBet = (direction) => {
    if (betActive || balance < betAmount) return;
    setBetDirection(direction);
    setBetActive(true);
    setCountdown(10);
    setBetResult(null);
    setBalance(prev => prev - betAmount);
  };

  const resolveBet = useCallback(() => {
    const won = Math.random() > 0.45; // slightly favorable
    const actualDirection = won ? betDirection : (betDirection === "up" ? "down" : "up");
    const payout = betAmount * 1.85;
    setBetResult({
      won,
      direction: actualDirection,
      amount: betAmount,
      payout: won ? payout.toFixed(0) : 0,
    });
    if (won) {
      setBalance(prev => prev + payout);
      setStats(prev => ({ ...prev, wins: prev.wins + 1, total: prev.total + 1 }));
    } else {
      setStats(prev => ({ ...prev, losses: prev.losses + 1, total: prev.total + 1 }));
    }
    setBetActive(false);
  }, [betDirection, betAmount]);

  const currentPrice = prices[prices.length - 1]?.price || BASE_PRICE;
  const prevPrice = prices[prices.length - 2]?.price || currentPrice;
  const priceChange = currentPrice - prevPrice;
  const priceChangePercent = ((currentPrice - prices[0]?.price) / prices[0]?.price * 100).toFixed(2);
  const isUp = priceChange >= 0;

  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div style={{ padding: "0 24px 60px", maxWidth: 1200, margin: "0 auto", paddingTop: 90 }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse2 { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes behaviorIn { from { opacity:0; transform:translateX(-10px) } to { opacity:1; transform:translateX(0) } }
        @keyframes countPulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.1) } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: "#1a1a2e", margin: 0, letterSpacing: "-0.03em",
        }}>
          Pet Arena
        </h2>
        <span style={{
          fontFamily: "mono", fontSize: 9, padding: "3px 10px", borderRadius: 8,
          background: "rgba(245,158,11,0.08)", color: "#b45309",
          border: "1px solid rgba(245,158,11,0.15)", fontWeight: 600,
        }}>
          BNB / USDT
        </span>
        <span style={{
          fontFamily: "mono", fontSize: 9, padding: "3px 10px", borderRadius: 8,
          background: "rgba(139,92,246,0.08)", color: "#7c3aed",
          border: "1px solid rgba(139,92,246,0.15)", fontWeight: 600,
        }}>
          PET-ALGO
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        {/* Left: Chart + Betting */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Price + Chart Card */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
            position: "relative",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            {/* Price header */}
            <div style={{ padding: "18px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a2e",
                  }}>
                    ${currentPrice.toFixed(2)}
                  </span>
                  <span style={{
                    fontFamily: "mono", fontSize: 12, fontWeight: 600,
                    color: isUp ? "#4ade80" : "#f87171",
                  }}>
                    {isUp ? "▲" : "▼"} {Math.abs(+priceChangePercent).toFixed(2)}%
                  </span>
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)", marginTop: 2 }}>
                  BNB/USDT · Live
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["1m", "5m", "15m", "1h"].map(t => (
                  <span key={t} style={{
                    fontFamily: "mono", fontSize: 9, padding: "3px 8px", borderRadius: 6,
                    background: t === "5m" ? "rgba(0,0,0,0.05)" : "transparent",
                    color: t === "5m" ? "rgba(26,26,46,0.6)" : "rgba(26,26,46,0.25)",
                    cursor: "pointer",
                  }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div ref={chartRef} style={{ padding: "8px 10px 4px" }}>
              <MiniChart prices={prices} width={620} height={180} />
            </div>

            {betResult && <BetResult result={betResult} onClose={() => setBetResult(null)} />}
          </div>

          {/* Betting Panel */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.06)", padding: "18px 22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            {/* Balance + Stats */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div>
                  <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", textTransform: "uppercase", marginBottom: 2 }}>Balance</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: "#b45309" }}>
                    {balance.toFixed(0)} $PET
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.06)" }} />
                <div>
                  <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", textTransform: "uppercase", marginBottom: 2 }}>Win Rate</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: winRate >= 50 ? "#4ade80" : "#f87171" }}>
                    {winRate}%
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.06)" }} />
                <div>
                  <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", textTransform: "uppercase", marginBottom: 2 }}>Record</div>
                  <div style={{ fontFamily: "mono", fontSize: 14, fontWeight: 600, color: "rgba(26,26,46,0.5)" }}>
                    <span style={{ color: "#4ade80" }}>{stats.wins}W</span> / <span style={{ color: "#f87171" }}>{stats.losses}L</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bet Amount */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
                Bet Amount
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[5, 10, 25, 50, 100].map(amt => (
                  <button key={amt} onClick={() => !betActive && setBetAmount(amt)}
                    disabled={balance < amt}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, cursor: betActive ? "not-allowed" : "pointer",
                      background: betAmount === amt ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.02)",
                      border: betAmount === amt ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(0,0,0,0.06)",
                      fontFamily: "mono", fontSize: 12, fontWeight: 600,
                      color: balance < amt ? "rgba(26,26,46,0.15)" : betAmount === amt ? "#b45309" : "rgba(26,26,46,0.4)",
                      transition: "all 0.2s",
                    }}>
                    {amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Up/Down Buttons */}
            {betActive ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "rgba(26,26,46,0.5)",
                  marginBottom: 8,
                }}>
                  Bet placed: <span style={{ color: betDirection === "up" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                    {betDirection === "up" ? "↑ LONG" : "↓ SHORT"}
                  </span> · {betAmount} $PET
                </div>
                <div style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 800,
                  color: countdown <= 3 ? "#f87171" : "#1a1a2e",
                  animation: countdown <= 3 ? "countPulse 0.5s ease infinite" : "none",
                }}>
                  {countdown}s
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)", marginTop: 4 }}>
                  Resolving...
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => placeBet("up")} style={{
                  flex: 1, padding: "16px", borderRadius: 12, cursor: "pointer",
                  background: "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.03))",
                  border: "1px solid rgba(74,222,128,0.2)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.2s",
                }}>
                  <span style={{ fontSize: 24 }}>📈</span>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#16a34a" }}>
                    LONG
                  </span>
                  <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(74,222,128,0.7)" }}>
                    1.85x payout
                  </span>
                </button>
                <button onClick={() => placeBet("down")} style={{
                  flex: 1, padding: "16px", borderRadius: 12, cursor: "pointer",
                  background: "linear-gradient(135deg, rgba(248,113,113,0.08), rgba(248,113,113,0.03))",
                  border: "1px solid rgba(248,113,113,0.2)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.2s",
                }}>
                  <span style={{ fontSize: 24 }}>📉</span>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#dc2626" }}>
                    SHORT
                  </span>
                  <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(248,113,113,0.7)" }}>
                    1.85x payout
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Pet + Leaderboard */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pet Behavior Card */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.06)", padding: "18px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                border: "2px solid rgba(245,158,11,0.25)",
                overflow: "hidden",
              }}>
                <img src={PET_IMAGES[pet.species] || PET_IMAGES[0]} alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
                  {pet.name}
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)" }}>
                  Lv.{pet.level} · {pet.personality_type} · Trading Agent
                </div>
              </div>
              <div style={{
                marginLeft: "auto", width: 8, height: 8, borderRadius: "50%",
                background: "#4ade80", boxShadow: "0 0 8px rgba(74,222,128,0.5)",
                animation: "pulse2 2s ease infinite",
              }} />
            </div>

            {/* Current behavior */}
            {currentBehavior && (
              <div style={{
                padding: "14px 16px", borderRadius: 12, marginBottom: 14,
                background: currentBehavior.signal === "bullish"
                  ? "rgba(74,222,128,0.06)" : currentBehavior.signal === "bearish"
                  ? "rgba(248,113,113,0.06)" : "rgba(0,0,0,0.02)",
                border: currentBehavior.signal === "bullish"
                  ? "1px solid rgba(74,222,128,0.15)" : currentBehavior.signal === "bearish"
                  ? "1px solid rgba(248,113,113,0.15)" : "1px solid rgba(0,0,0,0.06)",
                animation: "behaviorIn 0.4s ease-out",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{currentBehavior.emoji}</span>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "#1a1a2e", fontWeight: 500,
                  }}>
                    {pet.name} {currentBehavior.action}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontFamily: "mono", fontSize: 11, fontStyle: "italic",
                    color: "rgba(26,26,46,0.4)",
                  }}>
                    "{currentBehavior.text}"
                  </span>
                  <span style={{
                    fontFamily: "mono", fontSize: 9, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                    background: currentBehavior.signal === "bullish"
                      ? "rgba(74,222,128,0.1)" : currentBehavior.signal === "bearish"
                      ? "rgba(248,113,113,0.1)" : "rgba(0,0,0,0.04)",
                    color: currentBehavior.signal === "bullish"
                      ? "#16a34a" : currentBehavior.signal === "bearish"
                      ? "#dc2626" : "rgba(26,26,46,0.4)",
                    textTransform: "uppercase",
                  }}>
                    {currentBehavior.signal}
                  </span>
                </div>
              </div>
            )}

            {/* Behavior history */}
            <div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)", textTransform: "uppercase", marginBottom: 8 }}>
                Signal History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {behaviorHistory.slice(0, 5).map((b, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                    borderRadius: 6, background: i === 0 ? "rgba(0,0,0,0.02)" : "transparent",
                    opacity: 1 - i * 0.15,
                  }}>
                    <span style={{ fontSize: 12 }}>{b.emoji}</span>
                    <span style={{
                      flex: 1, fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {b.action}
                    </span>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: b.signal === "bullish" ? "#4ade80" : b.signal === "bearish" ? "#f87171" : "rgba(0,0,0,0.1)",
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.06)", padding: "18px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>🏆</span>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                  Leaderboard
                </span>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {["daily", "weekly", "all"].map(t => (
                  <button key={t} onClick={() => setLeaderboardTab(t)} style={{
                    background: leaderboardTab === t ? "rgba(0,0,0,0.05)" : "transparent",
                    border: "none", borderRadius: 6, padding: "3px 8px",
                    fontFamily: "mono", fontSize: 9, cursor: "pointer",
                    color: leaderboardTab === t ? "rgba(26,26,46,0.7)" : "rgba(26,26,46,0.3)",
                    textTransform: "capitalize",
                  }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {MOCK_LEADERBOARD.map((entry, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8,
                  background: i < 3 ? "rgba(0,0,0,0.02)" : "transparent",
                }}>
                  <span style={{
                    fontFamily: "mono", fontSize: 11, fontWeight: 700,
                    color: i === 0 ? "#d97706" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7f32" : "rgba(26,26,46,0.25)",
                    width: 18, textAlign: "center",
                  }}>
                    {entry.badge || entry.rank}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500,
                      color: "rgba(26,26,46,0.7)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {entry.name}
                    </div>
                    <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                      {entry.pet}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontFamily: "mono", fontSize: 11, fontWeight: 600,
                      color: "#4ade80",
                    }}>
                      {entry.pnl}
                    </div>
                    <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                      {entry.winRate}% WR
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Your rank */}
            <div style={{
              marginTop: 10, padding: "10px 12px", borderRadius: 10,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontFamily: "mono", fontSize: 11, fontWeight: 700, color: "rgba(26,26,46,0.3)", width: 18, textAlign: "center" }}>
                42
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: "#b45309" }}>
                  You
                </div>
                <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                  <img src={PET_IMAGES[pet.species] || PET_IMAGES[0]} alt=""
                    style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover", verticalAlign: "middle", marginRight: 4 }} />{pet.name}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "mono", fontSize: 11, fontWeight: 600, color: winRate >= 50 ? "#4ade80" : "#f87171" }}>
                  {balance > 500 ? "+" : ""}{(balance - 500).toFixed(0)} $PET
                </div>
                <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                  {winRate}% WR
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
