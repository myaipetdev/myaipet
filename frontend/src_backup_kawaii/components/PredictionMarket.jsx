import { useState, useEffect, useCallback, useRef } from "react";

// ── Deterministic mock predictions ──
const INITIAL_PREDICTIONS = [
  {
    id: 1,
    question: "Will Mochi befriend Luna today?",
    pet: { emoji: "🐰", name: "Mochi" },
    category: "social",
    options: [
      { label: "Yes", odds: 1.8, pool: 450 },
      { label: "No", odds: 2.1, pool: 380 },
    ],
    timeLeft: 300,
    duration: 300,
    status: "active",
    result: null,
    resolveResult: 0, // "Yes" wins
  },
  {
    id: 2,
    question: "Which pet visits the playground first?",
    pet: { emoji: "🐱", name: "Luna" },
    category: "movement",
    options: [
      { label: "Luna 🐱", odds: 2.5, pool: 220 },
      { label: "Mochi 🐰", odds: 3.0, pool: 180 },
      { label: "Pixel 🦊", odds: 2.2, pool: 260 },
    ],
    timeLeft: 240,
    duration: 240,
    status: "active",
    result: null,
    resolveResult: 2, // Pixel wins
  },
  {
    id: 3,
    question: "Will any pet fall asleep before noon?",
    pet: { emoji: "🐢", name: "Shell" },
    category: "action",
    options: [
      { label: "Yes", odds: 1.5, pool: 600 },
      { label: "No", odds: 2.8, pool: 310 },
    ],
    timeLeft: 180,
    duration: 180,
    status: "active",
    result: null,
    resolveResult: 0, // Yes wins
  },
  {
    id: 4,
    question: "Luna's next mood: Happy or Playful?",
    pet: { emoji: "🐱", name: "Luna" },
    category: "mood",
    options: [
      { label: "Happy 😊", odds: 1.9, pool: 410 },
      { label: "Playful 🎾", odds: 1.9, pool: 400 },
    ],
    timeLeft: 150,
    duration: 150,
    status: "active",
    result: null,
    resolveResult: 1, // Playful wins
  },
  {
    id: 5,
    question: "How many pets visit the pond this hour?",
    pet: { emoji: "🐕", name: "Rex" },
    category: "movement",
    options: [
      { label: "Over 3", odds: 2.0, pool: 350 },
      { label: "Under 3", odds: 1.85, pool: 390 },
    ],
    timeLeft: 260,
    duration: 260,
    status: "active",
    result: null,
    resolveResult: 0, // Over wins
  },
  {
    id: 6,
    question: "Will the Fox find the hidden treasure?",
    pet: { emoji: "🦊", name: "Pixel" },
    category: "action",
    options: [
      { label: "Yes", odds: 2.3, pool: 290 },
      { label: "No", odds: 1.65, pool: 520 },
    ],
    timeLeft: 200,
    duration: 200,
    status: "active",
    result: null,
    resolveResult: 0, // Yes wins
  },
];

const CATEGORY_STYLES = {
  social: {
    bg: "bg-pink-100",
    text: "text-pink-600",
    border: "border-pink-300",
    icon: "💕",
    label: "Social",
  },
  movement: {
    bg: "bg-sky-100",
    text: "text-sky-600",
    border: "border-sky-300",
    icon: "🏃",
    label: "Movement",
  },
  action: {
    bg: "bg-amber-100",
    text: "text-amber-600",
    border: "border-amber-300",
    icon: "⚡",
    label: "Action",
  },
  mood: {
    bg: "bg-emerald-100",
    text: "text-emerald-600",
    border: "border-emerald-300",
    icon: "🎭",
    label: "Mood",
  },
};

const BET_PRESETS = [10, 50, 100, 500];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Live Dot Animation ──
function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
    </span>
  );
}

// ── Timer Countdown Bar ──
function TimerBar({ timeLeft, duration }) {
  const percent = duration > 0 ? (timeLeft / duration) * 100 : 0;
  const isUrgent = percent < 25;
  const isWarning = percent < 50 && !isUrgent;

  const barColor = isUrgent
    ? "bg-red-400"
    : isWarning
    ? "bg-amber-400"
    : "bg-gradient-to-r from-pink-400 to-sky-400";

  return (
    <div className="w-full mt-3 mb-1">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <LiveDot />
          <span className="font-body text-xs text-[#422D26]/50 uppercase tracking-wide">
            Live
          </span>
        </div>
        <span
          className={`font-heading text-sm tabular-nums ${
            isUrgent
              ? "text-red-500 animate-pulse"
              : isWarning
              ? "text-amber-500"
              : "text-[#422D26]/60"
          }`}
        >
          {formatTime(timeLeft)} remaining
        </span>
      </div>
      <div className="w-full h-2 bg-[#422D26]/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{
            width: `${percent}%`,
            background: !isUrgent && !isWarning
              ? "linear-gradient(90deg, #FF86B7, #70D6FF)"
              : undefined,
          }}
        />
      </div>
    </div>
  );
}

// ── Pool Distribution Bar ──
function PoolBar({ options }) {
  const totalPool = options.reduce((sum, o) => sum + o.pool, 0);
  const colors = [
    "bg-pink-400",
    "bg-sky-400",
    "bg-amber-400",
    "bg-emerald-400",
  ];

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs font-semibold text-[#422D26]/50 uppercase tracking-wide">
          Pool Distribution
        </span>
        <span className="font-body text-xs font-bold text-[#422D26]/70">
          {totalPool.toLocaleString()} $PET total
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[#422D26]/5">
        {options.map((opt, idx) => {
          const pct = totalPool > 0 ? (opt.pool / totalPool) * 100 : 0;
          return (
            <div
              key={idx}
              className={`${colors[idx % colors.length]} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${pct}%` }}
              title={`${opt.label}: ${opt.pool} $PET (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex gap-3 flex-wrap">
        {options.map((opt, idx) => {
          const pct = totalPool > 0 ? Math.round((opt.pool / totalPool) * 100) : 0;
          return (
            <div key={idx} className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${colors[idx % colors.length]}`}
              />
              <span className="font-body text-xs text-[#422D26]/60">
                {opt.label}: {opt.pool} $PET ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Prediction Card ──
function PredictionCard({ prediction, onPlaceBet, userBet }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [betAmount, setBetAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");

  const isActive = prediction.status === "active";
  const isResolved = prediction.status === "resolved";
  const catStyle = CATEGORY_STYLES[prediction.category];

  const handlePlaceBet = useCallback(() => {
    if (selectedOption === null) return;
    const amount = customAmount ? parseInt(customAmount, 10) : betAmount;
    if (!amount || amount <= 0) return;
    onPlaceBet(prediction.id, selectedOption, amount);
    setSelectedOption(null);
    setCustomAmount("");
  }, [selectedOption, betAmount, customAmount, prediction.id, onPlaceBet]);

  const potentialPayout =
    selectedOption !== null
      ? (
          (customAmount ? parseInt(customAmount, 10) : betAmount) *
          prediction.options[selectedOption].odds
        ).toFixed(0)
      : 0;

  const userWon =
    isResolved && userBet && userBet.optionIndex === prediction.result;
  const userLost =
    isResolved && userBet && userBet.optionIndex !== prediction.result;

  // Card border / glow styles
  let cardBorder = "border border-[#422D26]/8";
  if (userWon) {
    cardBorder =
      "border-2 border-emerald-400 shadow-[0_0_20px_rgba(125,223,176,0.3)]";
  } else if (userLost) {
    cardBorder = "border-2 border-pink-300/50";
  } else if (selectedOption !== null) {
    cardBorder =
      "border-2 border-pink-400 shadow-[0_0_16px_rgba(255,134,183,0.25)]";
  }

  return (
    <div
      className={`bg-white/80 backdrop-blur-sm rounded-3xl p-6 transition-all duration-300 ${cardBorder}`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#FFF9F2] flex items-center justify-center text-2xl shadow-sm">
            {prediction.pet.emoji}
          </div>
          <div>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-body font-bold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
            >
              <span>{catStyle.icon}</span>
              {catStyle.label}
            </span>
            <div className="font-body text-xs text-[#422D26]/40 mt-0.5 ml-0.5">
              {prediction.pet.name}
            </div>
          </div>
        </div>

        {isResolved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
            <span className="text-sm">✅</span>
            <span className="text-xs font-body font-bold text-emerald-600">
              Resolved
            </span>
          </div>
        )}
      </div>

      {/* Question */}
      <h3 className="font-heading text-lg text-[#422D26] mb-1 leading-snug">
        {prediction.question}
      </h3>

      {/* Timer (active only) */}
      {isActive && (
        <TimerBar timeLeft={prediction.timeLeft} duration={prediction.duration} />
      )}

      {/* Options as betting buttons */}
      <div className="grid gap-2 mt-4">
        {prediction.options.map((opt, idx) => {
          const isBetOption = userBet && userBet.optionIndex === idx;
          const isWinner = isResolved && prediction.result === idx;
          const isLoser = isResolved && prediction.result !== idx;
          const isSelected = selectedOption === idx;

          let btnClass =
            "squishy relative rounded-2xl font-body px-4 py-3 transition-all duration-200 border-2 flex items-center justify-between ";

          if (isResolved) {
            if (isWinner) {
              btnClass +=
                "bg-emerald-50 border-emerald-400 shadow-[0_0_12px_rgba(125,223,176,0.25)] ";
            } else {
              btnClass += "bg-[#422D26]/5 border-transparent opacity-50 ";
            }
          } else if (isSelected) {
            btnClass +=
              "bg-pink-50 border-pink-400 shadow-[0_0_12px_rgba(255,134,183,0.3)] scale-[1.02] ";
          } else if (isBetOption) {
            btnClass += "bg-sky-50 border-sky-400 ";
          } else {
            btnClass +=
              "bg-white border-[#422D26]/10 hover:border-pink-300 hover:bg-pink-50/30 cursor-pointer ";
          }

          return (
            <button
              key={idx}
              className={btnClass}
              onClick={() =>
                isActive &&
                !userBet &&
                setSelectedOption(isSelected ? null : idx)
              }
              disabled={!isActive || !!userBet}
            >
              <div className="flex items-center gap-2">
                {isResolved && isWinner && (
                  <span className="text-lg">✅</span>
                )}
                {isResolved && isLoser && (
                  <span className="text-lg opacity-40">❌</span>
                )}
                {isSelected && !isResolved && (
                  <span className="w-5 h-5 rounded-full bg-pink-400 flex items-center justify-center text-white text-xs">
                    ✓
                  </span>
                )}
                <span
                  className={`font-bold text-sm ${
                    isResolved && isLoser
                      ? "text-[#422D26]/40"
                      : "text-[#422D26]"
                  }`}
                >
                  {opt.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-body text-xs text-[#422D26]/40">
                  {opt.pool} $PET
                </span>
                <span
                  className={`font-heading text-sm px-2.5 py-1 rounded-lg ${
                    isSelected
                      ? "bg-pink-400 text-white"
                      : isWinner
                      ? "bg-emerald-400 text-white"
                      : "bg-[#422D26]/8 text-[#422D26]/70"
                  }`}
                >
                  {opt.odds}x
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pool Distribution */}
      <PoolBar options={prediction.options} />

      {/* Bet input (when option selected, no existing bet, active) */}
      {isActive && selectedOption !== null && !userBet && (
        <div className="bg-gradient-to-b from-[#FFF9F2] to-[#FFF5EB] rounded-2xl p-5 mt-4 space-y-4 animate-fadeIn border border-amber-200/50">
          <div className="font-body text-xs font-semibold text-[#422D26]/50 uppercase tracking-wide">
            Your Wager
          </div>

          {/* Preset amounts in a row */}
          <div className="flex items-center gap-2">
            {BET_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`squishy flex-1 rounded-xl font-body font-bold py-2.5 text-sm transition-all border-2 ${
                  betAmount === preset && !customAmount
                    ? "bg-[#FFD23F] text-[#422D26] border-[#FFD23F] shadow-md"
                    : "bg-white text-[#422D26]/70 border-[#422D26]/10 hover:border-amber-300"
                }`}
                onClick={() => {
                  setBetAmount(preset);
                  setCustomAmount("");
                }}
              >
                {preset}
              </button>
            ))}
            <input
              type="number"
              placeholder="Custom"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-24 px-3 py-2.5 rounded-xl border-2 border-[#422D26]/10 text-sm font-body text-center focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
            />
          </div>

          {/* Payout and Place Bet */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="font-body text-xs text-[#422D26]/50">
                Potential Payout
              </div>
              <div className="font-heading text-2xl text-emerald-500">
                {potentialPayout} $PET
              </div>
            </div>
            <button
              className="squishy rounded-2xl font-heading font-bold px-8 py-3.5 text-base bg-gradient-to-r from-pink-400 to-pink-500 text-white hover:from-pink-500 hover:to-pink-600 transition-all shadow-lg shadow-pink-200 hover:shadow-xl hover:shadow-pink-300 active:scale-95"
              onClick={handlePlaceBet}
            >
              Place Bet
            </button>
          </div>
        </div>
      )}

      {/* User bet display */}
      {userBet && isActive && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mt-4 flex items-center justify-between">
          <div>
            <div className="font-body text-xs text-sky-500 font-semibold uppercase tracking-wide mb-1">
              Your Active Bet
            </div>
            <div className="font-body text-sm text-[#422D26]">
              <span className="font-bold">{userBet.amount} $PET</span> on "
              {prediction.options[userBet.optionIndex].label}"
            </div>
          </div>
          <div className="text-right">
            <div className="font-body text-xs text-[#422D26]/40">
              Potential Payout
            </div>
            <div className="font-heading text-lg text-emerald-500">
              {(
                userBet.amount *
                prediction.options[userBet.optionIndex].odds
              ).toFixed(0)}{" "}
              $PET
            </div>
          </div>
        </div>
      )}

      {/* Resolved result - WIN */}
      {userWon && (
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl p-5 mt-4 text-center shadow-[0_0_20px_rgba(125,223,176,0.2)]">
          <div className="text-3xl mb-2">🎉🏆🎉</div>
          <div className="font-heading text-xl text-emerald-600 mb-1">
            You Won!
          </div>
          <div className="font-heading text-2xl text-emerald-500">
            +
            {(
              userBet.amount *
              prediction.options[userBet.optionIndex].odds
            ).toFixed(0)}{" "}
            $PET
          </div>
        </div>
      )}

      {/* Resolved result - LOSE */}
      {userLost && (
        <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-2xl p-4 mt-4 text-center">
          <div className="text-2xl mb-1">😔</div>
          <div className="font-heading text-base text-pink-500">
            Better luck next time
          </div>
          <div className="font-body text-sm text-[#422D26]/40 mt-0.5">
            -{userBet.amount} $PET
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export default function PredictionMarket() {
  const [predictions, setPredictions] = useState(() =>
    INITIAL_PREDICTIONS.map((p) => ({
      ...p,
      options: p.options.map((o) => ({ ...o })),
    }))
  );
  const [bets, setBets] = useState({}); // { [predictionId]: { optionIndex, amount } }
  const [balance, setBalance] = useState(1000);
  const [totalWon, setTotalWon] = useState(0);
  const [activeTab, setActiveTab] = useState("active");
  const [toast, setToast] = useState(null);
  const toastTimeout = useRef(null);

  const showToast = useCallback((message, type) => {
    setToast({ message, type });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setPredictions((prev) =>
        prev.map((p) => {
          if (p.status !== "active") return p;
          const next = p.timeLeft - 1;
          if (next <= 0) {
            return {
              ...p,
              timeLeft: 0,
              status: "resolved",
              result: p.resolveResult,
            };
          }
          return { ...p, timeLeft: next };
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle resolved predictions payouts
  const processedRef = useRef(new Set());
  useEffect(() => {
    predictions.forEach((p) => {
      if (p.status === "resolved" && !processedRef.current.has(p.id)) {
        processedRef.current.add(p.id);
        const userBet = bets[p.id];
        if (userBet) {
          if (userBet.optionIndex === p.result) {
            const payout = Math.floor(
              userBet.amount * p.options[userBet.optionIndex].odds
            );
            setBalance((b) => b + payout);
            setTotalWon((t) => t + payout);
            showToast(`You won ${payout} $PET!`, "win");
          } else {
            showToast("Better luck next time!", "lose");
          }
        }
      }
    });
  }, [predictions, bets, showToast]);

  const handlePlaceBet = useCallback(
    (predictionId, optionIndex, amount) => {
      if (amount > balance) {
        showToast("Not enough $PET!", "lose");
        return;
      }
      if (bets[predictionId]) return;
      setBets((prev) => ({
        ...prev,
        [predictionId]: { optionIndex, amount },
      }));
      setBalance((b) => b - amount);
      setPredictions((prev) =>
        prev.map((p) => {
          if (p.id !== predictionId) return p;
          const newOptions = p.options.map((o, i) =>
            i === optionIndex ? { ...o, pool: o.pool + amount } : o
          );
          return { ...p, options: newOptions };
        })
      );
      showToast(`Bet placed: ${amount} $PET`, "info");
    },
    [balance, bets, showToast]
  );

  // Derived stats
  const activeBetCount = Object.keys(bets).filter((id) => {
    const p = predictions.find((pred) => pred.id === parseInt(id, 10));
    return p && p.status === "active";
  }).length;

  const resolvedBets = Object.keys(bets).filter((id) => {
    const p = predictions.find((pred) => pred.id === parseInt(id, 10));
    return p && p.status === "resolved";
  });
  const wins = resolvedBets.filter((id) => {
    const p = predictions.find((pred) => pred.id === parseInt(id, 10));
    return p && bets[id].optionIndex === p.result;
  }).length;
  const winRate =
    resolvedBets.length > 0
      ? Math.round((wins / resolvedBets.length) * 100)
      : 0;

  // Filtered predictions
  const filteredPredictions = predictions.filter((p) => {
    if (activeTab === "active") return p.status === "active";
    if (activeTab === "mybets") return !!bets[p.id];
    if (activeTab === "resolved") return p.status === "resolved";
    return true;
  });

  const tabs = [
    {
      key: "active",
      label: "Active",
      icon: "🔴",
      count: predictions.filter((p) => p.status === "active").length,
    },
    {
      key: "mybets",
      label: "My Bets",
      icon: "🎯",
      count: Object.keys(bets).length,
    },
    {
      key: "resolved",
      label: "Resolved",
      icon: "✅",
      count: predictions.filter((p) => p.status === "resolved").length,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-36 pb-24 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl font-body font-bold text-sm shadow-xl transition-all duration-300 flex items-center gap-2 ${
            toast.type === "win"
              ? "bg-emerald-500 text-white shadow-emerald-200"
              : toast.type === "lose"
              ? "bg-pink-500 text-white shadow-pink-200"
              : "bg-sky-500 text-white shadow-sky-200"
          }`}
        >
          <span className="text-lg">
            {toast.type === "win"
              ? "🎉"
              : toast.type === "lose"
              ? "💔"
              : "📝"}
          </span>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="font-heading text-3xl text-[#422D26] mb-2">
          Pet Behavior Predictions
        </h1>
        <p className="font-body text-base text-[#422D26]/50 max-w-md mx-auto leading-relaxed">
          Bet on what happens next in the village. AI pets are unpredictable!
        </p>
      </div>

      {/* Stats Bar */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[#422D26]/8 p-6 mb-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-2xl bg-amber-50/80">
            <div className="text-xl mb-1">💰</div>
            <div className="font-heading text-xl text-[#422D26]">
              {balance.toLocaleString()}
            </div>
            <div className="font-body text-xs text-[#422D26]/40 mt-0.5">
              $PET Balance
            </div>
          </div>
          <div className="text-center p-3 rounded-2xl bg-pink-50/80">
            <div className="text-xl mb-1">🎯</div>
            <div className="font-heading text-xl text-pink-500">
              {activeBetCount}
            </div>
            <div className="font-body text-xs text-[#422D26]/40 mt-0.5">
              Active Bets
            </div>
          </div>
          <div className="text-center p-3 rounded-2xl bg-emerald-50/80">
            <div className="text-xl mb-1">📊</div>
            <div className="font-heading text-xl text-emerald-500">
              {resolvedBets.length > 0 ? `${winRate}%` : "\u2014"}
            </div>
            <div className="font-body text-xs text-[#422D26]/40 mt-0.5">
              Win Rate
            </div>
          </div>
          <div className="text-center p-3 rounded-2xl bg-yellow-50/80">
            <div className="text-xl mb-1">🏆</div>
            <div className="font-heading text-xl text-amber-500">
              {totalWon.toLocaleString()}
            </div>
            <div className="font-body text-xs text-[#422D26]/40 mt-0.5">
              $PET Won
            </div>
          </div>
        </div>
      </div>

      {/* Pill Tabs */}
      <div className="flex gap-2 mb-6 bg-[#422D26]/5 p-1.5 rounded-2xl">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`squishy flex-1 rounded-xl font-body font-bold px-4 py-3 text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === tab.key
                ? "bg-white text-[#422D26] shadow-md"
                : "text-[#422D26]/40 hover:text-[#422D26]/60"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="text-sm">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold min-w-[22px] text-center ${
                  activeTab === tab.key
                    ? "bg-pink-400 text-white"
                    : "bg-[#422D26]/10 text-[#422D26]/50"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Prediction Cards */}
      <div className="space-y-6">
        {filteredPredictions.length === 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[#422D26]/8 p-10 text-center">
            <div className="text-4xl mb-3">
              {activeTab === "mybets"
                ? "🎯"
                : activeTab === "resolved"
                ? "⏳"
                : "🔮"}
            </div>
            <p className="font-heading text-lg text-[#422D26]/60 mb-1">
              {activeTab === "mybets"
                ? "No bets placed yet"
                : activeTab === "resolved"
                ? "No predictions resolved yet"
                : "No active predictions right now"}
            </p>
            <p className="font-body text-sm text-[#422D26]/40">
              {activeTab === "mybets"
                ? "Pick a prediction and place your bet!"
                : activeTab === "resolved"
                ? "Hang tight, results are coming!"
                : "Check back soon for new predictions."}
            </p>
          </div>
        )}
        {filteredPredictions.map((prediction) => (
          <PredictionCard
            key={prediction.id}
            prediction={prediction}
            onPlaceBet={handlePlaceBet}
            userBet={bets[prediction.id] || null}
          />
        ))}
      </div>
    </div>
  );
}
