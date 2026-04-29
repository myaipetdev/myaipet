"use client";

import { useMemo } from "react";

interface StatPoint {
  label: string;
  value: number; // 0..100
  color: string;
  icon: string;
}

interface Props {
  stats: StatPoint[];
  size?: number;
}

/**
 * Hexagonal radar chart for pet stats.
 * Renders an SVG with 6-axis polar layout. Each stat is normalized 0..100.
 */
export default function PetStatRadar({ stats, size = 280 }: Props) {
  const center = size / 2;
  const maxRadius = (size / 2) - 38; // padding for labels
  const count = stats.length;

  // Polygon points for current values
  const valuePoints = useMemo(() => {
    return stats
      .map((s, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        const r = (Math.max(0, Math.min(100, s.value)) / 100) * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  }, [stats, count, center, maxRadius]);

  // Concentric guide rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1].map((pct) => {
    const points = Array.from({ length: count })
      .map((_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        const r = pct * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
    return points;
  });

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245,158,11,0.4)" />
            <stop offset="100%" stopColor="rgba(192,132,252,0.18)" />
          </radialGradient>
        </defs>

        {/* Guide rings */}
        {rings.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="rgba(26,26,46,0.08)"
            strokeWidth={idx === 3 ? 1.5 : 1}
          />
        ))}

        {/* Axes */}
        {stats.map((_, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
          const x = center + maxRadius * Math.cos(angle);
          const y = center + maxRadius * Math.sin(angle);
          return (
            <line
              key={`ax-${i}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="rgba(26,26,46,0.07)"
              strokeWidth={1}
            />
          );
        })}

        {/* Filled value polygon */}
        <polygon
          points={valuePoints}
          fill="url(#radarFill)"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Vertex dots + labels */}
        {stats.map((s, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
          const r = (Math.max(0, Math.min(100, s.value)) / 100) * maxRadius;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          const labelR = maxRadius + 22;
          const lx = center + labelR * Math.cos(angle);
          const ly = center + labelR * Math.sin(angle);
          return (
            <g key={`v-${i}`}>
              <circle cx={x} cy={y} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontFamily="'Space Grotesk', sans-serif"
                fontWeight={700}
                fill="rgba(26,26,46,0.7)"
                style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}
              >
                {s.label}
              </text>
              <text
                x={lx}
                y={ly + 13}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontFamily="'Space Grotesk', sans-serif"
                fontWeight={600}
                fill={s.color}
              >
                {Math.round(s.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 10-slot horizontal stat bar (game-style) ──
interface SlotBarProps {
  label: string;
  value: number; // 0..100
  color: string;
  icon: string;
  max?: number;
  warning?: boolean;
}

export function StatSlotBar({ label, value, color, icon, max = 100, warning }: SlotBarProps) {
  const slots = 10;
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * slots);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div
        style={{
          width: 24,
          fontSize: 14,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ width: 64, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            color: warning ? "#dc2626" : "rgba(26,26,46,0.65)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, flex: 1 }}>
        {Array.from({ length: slots }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 10,
                borderRadius: 2,
                background: isFilled ? color : "rgba(26,26,46,0.06)",
                border: isFilled ? `1px solid ${color}` : "1px solid rgba(26,26,46,0.04)",
                transition: "background 0.25s, border 0.25s",
                boxShadow: isFilled ? `0 0 4px ${color}55` : "none",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          width: 36,
          textAlign: "right",
          fontSize: 11,
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          color: warning ? "#dc2626" : "#1a1a2e",
        }}
      >
        {Math.round(value)}
      </div>
    </div>
  );
}
